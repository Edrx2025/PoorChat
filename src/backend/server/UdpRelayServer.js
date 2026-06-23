const dgram = require("dgram");

class UdpRelayServer {
  constructor({ host, port, getRecipientIds }) {
    this.host = host;
    this.port = port;
    this.getRecipientIds = getRecipientIds;
    this.socket = dgram.createSocket("udp4");
    this.endpoints = new Map();
  }

  start() {
    return new Promise((resolve) => {
      this.socket.on("message", (message, remote) => {
        this.handleMessage(message, remote);
      });
      this.socket.bind(this.port, this.host, resolve);
    });
  }

  address() {
    return this.socket.address();
  }

  handleMessage(message, remote) {
    let packet;
    try {
      packet = JSON.parse(message.toString("utf8"));
    } catch {
      return;
    }

    if (packet.kind === "register" && packet.userId) {
      this.endpoints.set(Number(packet.userId), {
        address: remote.address,
        port: remote.port,
      });
      return;
    }

    if (packet.kind !== "media") return;

    const recipients = this.getRecipientIds(
      Number(packet.callId),
      Number(packet.senderId),
    );

    for (const userId of recipients) {
      const endpoint = this.endpoints.get(Number(userId));
      if (!endpoint) continue;
      this.socket.send(message, endpoint.port, endpoint.address);
    }
  }

  stop() {
    return new Promise((resolve) => this.socket.close(resolve));
  }
}

module.exports = UdpRelayServer;
