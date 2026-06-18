const crypto = require("crypto");

class MessageProtocol {
  static createRequest(type, payload = {}) {
    return {
      kind: "request",
      requestId: crypto.randomUUID(),
      type,
      payload,
      timestamp: new Date().toISOString(),
    };
  }

  static createResponse(requestId, data) {
    return {
      kind: "response",
      requestId,
      ok: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  static createError(requestId, error) {
    return {
      kind: "response",
      requestId,
      ok: false,
      error: error.message || String(error),
      timestamp: new Date().toISOString(),
    };
  }

  static createEvent(event, data) {
    return {
      kind: "event",
      event,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  static encode(message) {
    return `${JSON.stringify(message)}\n`;
  }

  static decodeBuffer(buffer) {
    const lines = buffer.split("\n");
    const pending = lines.pop() || "";
    const messages = [];

    for (const line of lines) {
      const cleanLine = line.trim();
      if (!cleanLine) continue;
      messages.push(JSON.parse(cleanLine));
    }

    return { messages, pending };
  }
}

module.exports = MessageProtocol;
