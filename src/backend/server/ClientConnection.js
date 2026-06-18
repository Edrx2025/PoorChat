const MessageProtocol = require("../network/MessageProtocol");

class ClientConnection {
  constructor(socket, chatServer) {
    this.socket = socket;
    this.chatServer = chatServer;
    this.buffer = "";
    this.user = null;
  }

  start() {
    this.socket.setEncoding("utf8");
    this.socket.on("data", (data) => this.handleData(data));
    this.socket.on("error", (error) => {
      console.error("[TCP] Error de cliente:", error.message);
    });
    this.socket.on("close", () => this.chatServer.handleDisconnect(this));
  }

  async handleData(data) {
    this.buffer += data;

    let parsed;
    try {
      parsed = MessageProtocol.decodeBuffer(this.buffer);
    } catch {
      this.buffer = "";
      this.send(MessageProtocol.createError(null, new Error("JSON inválido")));
      return;
    }

    this.buffer = parsed.pending;

    for (const request of parsed.messages) {
      if (request.kind !== "request" || !request.requestId || !request.type) {
        this.send(
          MessageProtocol.createError(
            request.requestId || null,
            new Error("Solicitud inválida"),
          ),
        );
        continue;
      }

      try {
        const dataResponse = await this.chatServer.handleRequest(this, request);
        this.send(
          MessageProtocol.createResponse(request.requestId, dataResponse),
        );
      } catch (error) {
        this.send(MessageProtocol.createError(request.requestId, error));
      }
    }
  }

  authenticate(user) {
    this.user = user;
  }

  requireUser() {
    if (!this.user) throw new Error("Debes iniciar sesión");
    return this.user;
  }

  send(message) {
    if (!this.socket.destroyed) {
      this.socket.write(MessageProtocol.encode(message));
    }
  }

  sendEvent(eventName, data) {
    this.send(MessageProtocol.createEvent(eventName, data));
  }
}

module.exports = ClientConnection;
