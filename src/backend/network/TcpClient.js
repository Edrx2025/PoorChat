const net = require("net");
const { EventEmitter } = require("events");
const MessageProtocol = require("./MessageProtocol");

class TcpClient extends EventEmitter {
  constructor() {
    super();
    this.socket = null;
    this.buffer = "";
    this.pendingRequests = new Map();
    this.host = null;
    this.port = null;
  }

  connect(host, port) {
    if (this.socket && !this.socket.destroyed) {
      return Promise.resolve();
    }

    this.host = host;
    this.port = port;

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      this.socket = socket;
      socket.setEncoding("utf8");

      const onInitialError = (error) => {
        socket.removeListener("connect", onConnect);
        reject(error);
      };

      const onConnect = () => {
        socket.removeListener("error", onInitialError);
        this.attachSocketListeners(socket);
        this.emit("connected", { host, port });
        resolve();
      };

      socket.once("error", onInitialError);
      socket.once("connect", onConnect);
    });
  }

  attachSocketListeners(socket) {
    socket.on("data", (data) => this.handleData(data));
    socket.on("error", (error) => this.emit("error", error));
    socket.on("close", () => {
      this.socket = null;
      this.rejectPending(new Error("La conexión con el servidor se cerró"));
      this.emit("disconnected");
    });
  }

  request(type, payload = {}, timeoutMs = 15000) {
    if (!this.socket || this.socket.destroyed) {
      return Promise.reject(new Error("No hay conexión con el servidor"));
    }

    const request = MessageProtocol.createRequest(type, payload);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.requestId);
        reject(new Error("El servidor tardó demasiado en responder"));
      }, timeoutMs);

      this.pendingRequests.set(request.requestId, {
        resolve,
        reject,
        timeout,
      });

      this.socket.write(MessageProtocol.encode(request));
    });
  }

  handleData(data) {
    this.buffer += data;

    let parsed;
    try {
      parsed = MessageProtocol.decodeBuffer(this.buffer);
    } catch (error) {
      this.buffer = "";
      this.emit("error", new Error("El servidor envió JSON inválido"));
      return;
    }

    this.buffer = parsed.pending;

    for (const message of parsed.messages) {
      if (message.kind === "response") {
        this.handleResponse(message);
      } else if (message.kind === "event") {
        this.emit("event", message);
      }
    }
  }

  handleResponse(message) {
    const pending = this.pendingRequests.get(message.requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(message.requestId);

    if (message.ok) pending.resolve(message.data);
    else pending.reject(new Error(message.error || "Error desconocido"));
  }

  disconnect() {
    if (this.socket && !this.socket.destroyed) {
      this.socket.end();
    }
    this.socket = null;
  }

  rejectPending(error) {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}

module.exports = TcpClient;
