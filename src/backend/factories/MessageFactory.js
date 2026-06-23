const { Message, FileMessage } = require("../models/Message");

class MessageFactory {
  static create(type, data) {
    switch (type) {
      case "text":
        return new Message({
          ...data,
          messageType: "text",
        });

      case "image":
      case "document":
      case "audio":
      case "video":
        return new FileMessage({
          ...data,
          messageType: type,
        });

      default:
        throw new Error(`Tipo de mensaje no soportado: ${type}`);
    }
  }
}

module.exports = MessageFactory;
