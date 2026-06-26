const MessageFactory = require("../factories/MessageFactory");
const { presentMessage } = require("../utils/presenters");

class ChatService {
  constructor(chatRepository, groupRepository, notificationService) {
    this.chatRepository = chatRepository;
    this.groupRepository = groupRepository;
    this.notificationService = notificationService;
  }

  openPrivateChat(userId, targetUserId) {
    if (userId === targetUserId) {
      throw new Error("No puedes crear un chat contigo mismo");
    }

    const chat = this.chatRepository.findOrCreatePrivateChat(
      userId,
      targetUserId,
    );
    this.chatRepository.showPrivateChatForUser(chat.id, userId);
    return chat;
  }

  listPrivateChats(userId) {
    return this.chatRepository.listPrivateChatsForUser(userId);
  }

  getMessages(
    userId,
    {
      contextType,
      contextId,
      limit = 100,
      afterMessageId = null,
      beforeMessageId = null,
    },
  ) {
    this.assertContextAccess(userId, contextType, contextId);
    const pageLimit = this.normalizePageLimit(limit);
    const minimumMessageId = this.getMinimumMessageId(
      userId,
      contextType,
      contextId,
    );

    const messages =
      contextType === "private"
        ? this.chatRepository.listMessages({
            chatId: contextId,
            minimumMessageId,
            afterMessageId,
            beforeMessageId,
            limit: pageLimit,
          })
        : this.chatRepository.listMessages({
            groupId: contextId,
            minimumMessageId,
            afterMessageId,
            beforeMessageId,
            limit: pageLimit,
          });

    return messages.map(presentMessage);
  }

  syncMessages(
    userId,
    {
      contextType,
      contextId,
      afterMessageId = null,
      limit = 100,
    },
  ) {
    this.assertContextAccess(userId, contextType, contextId);
    const minimumMessageId = this.getMinimumMessageId(
      userId,
      contextType,
      contextId,
    );
    const context =
      contextType === "private"
        ? { chatId: contextId, minimumMessageId }
        : { groupId: contextId, minimumMessageId };
    const latestMessageId = this.chatRepository.getLatestMessageId(context);
    const checkpoint =
      afterMessageId === null || afterMessageId === undefined
        ? null
        : Number(afterMessageId);
    const resetRequired =
      checkpoint !== null &&
      (checkpoint > latestMessageId || checkpoint < minimumMessageId);

    return {
      messages: this.getMessages(userId, {
        contextType,
        contextId,
        limit,
        afterMessageId:
          resetRequired || checkpoint === null ? null : checkpoint,
      }),
      latestMessageId,
      resetRequired,
    };
  }

  sendText(userId, { contextType, contextId, content, replyToId = null }) {
    this.assertContextAccess(userId, contextType, contextId);

    const cleanContent = String(content || "").trim();
    if (!cleanContent) throw new Error("El mensaje no puede estar vacío");
    if (cleanContent.length > 4000) throw new Error("El mensaje es demasiado largo");
    const reply = replyToId
      ? this.assertReplyTarget(contextType, contextId, Number(replyToId))
      : null;

    const message = MessageFactory.create("text", {
      chatId: contextType === "private" ? contextId : null,
      groupId: contextType === "group" ? contextId : null,
      senderId: userId,
      content: cleanContent,
      replyToId: reply?.id || null,
    });

    const saved = this.chatRepository.createMessage(message);
    if (contextType === "private") {
      this.chatRepository.revealPrivateChatForMembers(contextId);
    }
    const presented = presentMessage(saved);
    const recipients = this.getContextMemberIds(contextType, contextId);

    this.notificationService.notify("message:new", recipients, presented);
    return presented;
  }

  deleteMessage(userId, messageId) {
    const message = this.assertMessageAccess(userId, messageId);
    if (message.deletedAt) throw new Error("El mensaje ya fue borrado");
    if (message.messageType === "system") {
      throw new Error("Los mensajes del sistema no se pueden borrar");
    }

    const deletingOwnMessage = message.senderId === userId;
    const canModerateGroup =
      message.groupId &&
      this.groupRepository.isAdmin(message.groupId, userId);
    if (!deletingOwnMessage && !canModerateGroup) {
      throw new Error("Solo puedes borrar tus propios mensajes");
    }

    const updated = presentMessage(
      this.chatRepository.softDeleteMessage(
        messageId,
        userId,
        deletingOwnMessage ? "self" : "admin",
      ),
    );
    this.notifyMessageUpdated(message, updated);
    return updated;
  }

  setMessagePinned(userId, messageId, pinned) {
    const message = this.assertMessageAccess(userId, messageId);
    if (message.deletedAt) {
      throw new Error("No puedes fijar un mensaje borrado");
    }

    const updated = presentMessage(
      this.chatRepository.setMessagePinned(messageId, Boolean(pinned), userId),
    );
    this.notifyMessageUpdated(message, updated);
    return updated;
  }

  clearPrivateChat(userId, chatId) {
    this.assertContextAccess(userId, "private", chatId);
    return this.chatRepository.clearPrivateChatForUser(
      chatId,
      userId,
      false,
    );
  }

  removePrivateChat(userId, chatId) {
    this.assertContextAccess(userId, "private", chatId);
    return this.chatRepository.clearPrivateChatForUser(
      chatId,
      userId,
      true,
    );
  }

  clearGroupChat(userId, groupId) {
    this.assertContextAccess(userId, "group", groupId);
    if (!this.groupRepository.isAdmin(groupId, userId)) {
      throw new Error("Solo el dueño o un admin puede vaciar el chat");
    }

    const result = this.chatRepository.clearGroupMessages(groupId);
    this.notificationService.notify(
      "group:cleared",
      this.groupRepository.getMemberIds(groupId),
      result,
    );
    return result;
  }

  createSystemMessage(groupId, senderId, content) {
    const saved = this.chatRepository.createMessage({
      groupId,
      senderId,
      content: String(content || "").trim(),
      messageType: "system",
    });
    const presented = presentMessage(saved);
    this.notificationService.notify(
      "message:new",
      this.groupRepository.getMemberIds(groupId),
      presented,
    );
    return presented;
  }

  createFileMessage(
    userId,
    contextType,
    contextId,
    file,
    replyToId = null,
  ) {
    const message = MessageFactory.create(file.fileType, {
      chatId: contextType === "private" ? contextId : null,
      groupId: contextType === "group" ? contextId : null,
      senderId: userId,
      content: file.originalName,
      fileId: file.id,
      file,
      replyToId,
    });

    const saved = this.chatRepository.createMessage(message);
    if (contextType === "private") {
      this.chatRepository.revealPrivateChatForMembers(contextId);
    }
    const presented = presentMessage(saved);
    const recipients = this.getContextMemberIds(contextType, contextId);

    this.notificationService.notify("message:new", recipients, presented);
    return presented;
  }

  assertContextAccess(userId, contextType, contextId) {
    if (contextType === "private") {
      if (!this.chatRepository.isPrivateChatMember(contextId, userId)) {
        throw new Error("No perteneces a este chat");
      }
      return;
    }

    if (contextType === "group") {
      if (!this.groupRepository.isMember(contextId, userId)) {
        throw new Error("No perteneces a este grupo");
      }
      return;
    }

    throw new Error("Contexto de conversación inválido");
  }

  getContextMemberIds(contextType, contextId) {
    return contextType === "private"
      ? this.chatRepository.getPrivateChatMemberIds(contextId)
      : this.groupRepository.getMemberIds(contextId);
  }

  assertReplyTarget(contextType, contextId, messageId) {
    const message = this.chatRepository.findMessageById(messageId);
    if (!message || message.deletedAt) {
      throw new Error("El mensaje que intentas responder ya no está disponible");
    }

    const sameContext =
      (contextType === "private" && message.chatId === Number(contextId)) ||
      (contextType === "group" && message.groupId === Number(contextId));
    if (!sameContext) throw new Error("No puedes responder un mensaje de otro chat");
    return message;
  }

  assertMessageAccess(userId, messageId) {
    const message = this.chatRepository.findMessageById(Number(messageId));
    if (!message) throw new Error("El mensaje no existe");

    const contextType = message.chatId ? "private" : "group";
    const contextId = message.chatId || message.groupId;
    this.assertContextAccess(userId, contextType, contextId);
    return message;
  }

  notifyMessageUpdated(original, updated) {
    const contextType = original.chatId ? "private" : "group";
    const contextId = original.chatId || original.groupId;
    const recipients = this.getContextMemberIds(contextType, contextId);
    this.notificationService.notify("message:updated", recipients, updated);
  }

  getMinimumMessageId(userId, contextType, contextId) {
    return contextType === "private"
      ? this.chatRepository.getClearedThroughMessageId(contextId, userId)
      : 0;
  }

  normalizePageLimit(limit) {
    const numericLimit = Number(limit);
    if (!Number.isFinite(numericLimit)) return 100;
    return Math.max(1, Math.min(Math.trunc(numericLimit), 100));
  }
}

module.exports = ChatService;
