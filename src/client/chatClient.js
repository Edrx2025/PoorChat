const net = require("net");
const MessageTypes = require("../protocol/messageTypes");

class ChatClient {
  constructor() {
    this.socket = null;
    this.username = "";
  }

  conectar(host, puerto, username, onMessageReceived, onError) {
    this.username = username;

    this.socket = net.connect({ host, port: puerto }, () => {
      console.log(`[TCP] Conectado al servidor en ${host}:${puerto}`);

      // Enviamos el primer paquete de LOGIN bajo el protocolo JSON
      const loginPayload = {
        type: MessageTypes.LOGIN,
        payload: { username, password: "123" },
      };
      this.socket.write(JSON.stringify(loginPayload) + "\n");
    });

    // Ruteo hacia tu UI
    this.socket.on("data", (data) => {
      const lineas = data.toString().split("\n");
      for (let linea of lineas) {
        if (linea.trim()) {
          try {
            const mensajeJson = JSON.parse(linea.trim());
            onMessageReceived(mensajeJson);
          } catch (e) {
            // Resguardo por si se manda un texto plano durante las pruebas
            onMessageReceived({
              type: MessageTypes.TEXT_MESSAGE,
              payload: { emisor: "Sistema", text: linea.trim() },
            });
          }
        }
      }
    });

    this.socket.on("error", (err) => {
      onError(err);
    });
  }

  /*Toma el texto de la caja de texto HTML y lo empuja por el socket TCP*/
  enviarMensaje(texto) {
    if (!this.socket) return;

    const txtPayload = {
      type: MessageTypes.TEXT_MESSAGE,
      payload: {
        emisor: this.username,
        text: texto,
      },
    };

    // Empujamos el texto estructurado con el salto de línea obligatorio \n
    this.socket.write(JSON.stringify(txtPayload) + "\n");
  }
}

module.exports = new ChatClient();
