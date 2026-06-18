const dgram = require("dgram");
const crypto = require("crypto");
const { EventEmitter } = require("events");
const AppConfig = require("../config/AppConfig");

class UdpMediaClient extends EventEmitter {
  constructor(config = AppConfig.getInstance()) {
    super();
    this.config = config;
    this.socket = null;
    this.serverHost = null;
    this.serverPort = null;
    this.userId = null;
    this.frames = new Map();
  }

  start({ serverHost, serverPort, userId }) {
    if (this.socket) return Promise.resolve();

    this.serverHost = serverHost;
    this.serverPort = serverPort;
    this.userId = userId;
    this.socket = dgram.createSocket("udp4");

    this.socket.on("message", (message) => this.handleDatagram(message));
    this.socket.on("error", (error) => this.emit("error", error));
    return new Promise((resolve) => {
      this.socket.bind(0, () => {
        this.sendDatagram({
          kind: "register",
          userId,
        });
        resolve();
      });
    });
  }

  sendMedia({ callId, mediaType, dataBase64 }) {
    if (!this.socket) throw new Error("El canal UDP no está activo");

    const buffer = Buffer.from(dataBase64, "base64");
    const frameId = crypto.randomUUID();
    const totalChunks = Math.ceil(buffer.length / this.config.mediaChunkSize);

    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * this.config.mediaChunkSize;
      const end = start + this.config.mediaChunkSize;
      const chunk = buffer.subarray(start, end);

      this.sendDatagram({
        kind: "media",
        callId,
        senderId: this.userId,
        mediaType,
        frameId,
        sequence: index,
        chunkIndex: index,
        totalChunks,
        timestamp: Date.now(),
        payload: chunk.toString("base64"),
      });
    }
  }

  handleDatagram(message) {
    let packet;
    try {
      packet = JSON.parse(message.toString("utf8"));
    } catch {
      return;
    }

    if (packet.kind !== "media") return;

    const key = `${packet.callId}:${packet.senderId}:${packet.mediaType}:${packet.frameId}`;
    let frame = this.frames.get(key);

    if (!frame) {
      frame = {
        chunks: new Array(packet.totalChunks),
        received: 0,
        packet,
      };
      this.frames.set(key, frame);
      const cleanupTimer = setTimeout(() => this.frames.delete(key), 5000);
      cleanupTimer.unref?.();
    }

    if (!frame.chunks[packet.chunkIndex]) {
      frame.chunks[packet.chunkIndex] = Buffer.from(packet.payload, "base64");
      frame.received += 1;
    }

    if (frame.received === packet.totalChunks) {
      const data = Buffer.concat(frame.chunks).toString("base64");
      this.frames.delete(key);
      this.emit("media", {
        callId: packet.callId,
        senderId: packet.senderId,
        mediaType: packet.mediaType,
        dataBase64: data,
        timestamp: packet.timestamp,
      });
    }
  }

  sendDatagram(packet) {
    const message = Buffer.from(JSON.stringify(packet));
    this.socket.send(message, this.serverPort, this.serverHost);
  }

  stop() {
    if (this.socket) this.socket.close();
    this.socket = null;
    this.frames.clear();
  }
}

module.exports = UdpMediaClient;
