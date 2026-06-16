// src/client/chatClient.js
const net = require("net");
const MessageTypes = require("../protocol/messageTypes"); // Sube una carpeta a src/ y entra a protocol/

class ChatClient {
  constructor() {
    this.socket = null;
  }

  conectar(host, puerto, username, onMessageReceived, onError) {
    this.socket = net.connect({ host, port: puerto }, () => {
      console.log(`[TCP] Conectado a ${host}:${puerto}`);

      const loginPayload = {
        type: MessageTypes.LOGIN,
        payload: { username, password: "123" },
      };

      this.socket.write(JSON.stringify(loginPayload) + "\n");
    });

    this.socket.on("data", (data) => {
      const lineas = data.toString().split("\n");
      for (let linea of lineas) {
        if (linea.trim()) {
          const mensajeJson = JSON.parse(linea.trim());
          onMessageReceived(mensajeJson);
        }
      }
    });

    this.socket.on("error", (err) => {
      console.error("[TCP] Error en cliente:", err.message);
      onError(err);
    });
  }
}

// Aquí es donde exportamos la instancia viva
module.exports = new ChatClient();
