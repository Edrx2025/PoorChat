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

  getMessages(userId, { contextType, contextId }) {
    this.assertContextAccess(userId, contextType, contextId);

    const messages =
      contextType === "private"
        ? this.chatRepository.listMessages({
            chatId: contextId,
            afterMessageId:
              this.chatRepository.getClearedThroughMessageId(
                contextId,
                userId,
              ),
          })
        : this.chatRepository.listMessages({ groupId: contextId });

    return messages.map(presentMessage);
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
    if (message.senderId !== userId) {
      throw new Error("Solo puedes borrar tus propios mensajes");
    }
    if (message.deletedAt) throw new Error("El mensaje ya fue borrado");

    const updated = presentMessage(
      this.chatRepository.softDeleteMessage(messageId),
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
}

module.exports = ChatService;
