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

    return this.chatRepository.findOrCreatePrivateChat(userId, targetUserId);
  }

  listPrivateChats(userId) {
    return this.chatRepository.listPrivateChatsForUser(userId);
  }

  getMessages(userId, { contextType, contextId }) {
    this.assertContextAccess(userId, contextType, contextId);

    const messages =
      contextType === "private"
        ? this.chatRepository.listMessages({ chatId: contextId })
        : this.chatRepository.listMessages({ groupId: contextId });

    return messages.map(presentMessage);
  }

  sendText(userId, { contextType, contextId, content }) {
    this.assertContextAccess(userId, contextType, contextId);

    const cleanContent = String(content || "").trim();
    if (!cleanContent) throw new Error("El mensaje no puede estar vacío");
    if (cleanContent.length > 4000) throw new Error("El mensaje es demasiado largo");

    const message = MessageFactory.create("text", {
      chatId: contextType === "private" ? contextId : null,
      groupId: contextType === "group" ? contextId : null,
      senderId: userId,
      content: cleanContent,
    });

    const saved = this.chatRepository.createMessage(message);
    const presented = presentMessage(saved);
    const recipients = this.getContextMemberIds(contextType, contextId);

    this.notificationService.notify("message:new", recipients, presented);
    return presented;
  }

  createFileMessage(userId, contextType, contextId, file) {
    const message = MessageFactory.create(file.fileType, {
      chatId: contextType === "private" ? contextId : null,
      groupId: contextType === "group" ? contextId : null,
      senderId: userId,
      content: file.originalName,
      fileId: file.id,
      file,
    });

    const saved = this.chatRepository.createMessage(message);
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
}

module.exports = ChatService;
