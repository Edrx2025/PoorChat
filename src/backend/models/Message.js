class Message {
  constructor({
    id = null,
    chatId = null,
    groupId = null,
    senderId,
    content = "",
    messageType = "text",
    fileId = null,
    createdAt = null,
  }) {
    this.id = id;
    this.chatId = chatId;
    this.groupId = groupId;
    this.senderId = senderId;
    this.content = content;
    this.messageType = messageType;
    this.fileId = fileId;
    this.createdAt = createdAt;
  }
}

class FileMessage extends Message {
  constructor(data) {
    super(data);
    this.file = data.file;
  }
}

module.exports = {
  Message,
  FileMessage,
};
