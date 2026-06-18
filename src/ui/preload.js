const { contextBridge, ipcRenderer } = require("electron");

// Exponemos una API segura y personalizada en el objeto global 'window'
contextBridge.exposeInMainWorld("poorChatAPI", {
  /**
   * Envía la solicitud de inicio de sesión al proceso principal (main.js)
   * @param {string} usuario - Nombre de usuario para la sesión
   */
  enviarLogin: (usuario) => {
    ipcRenderer.send("intentar-login", { usuario });
  },

  /**
   * Envía un mensaje de texto plano hacia el proceso principal para ser despachado por TCP
   * @param {string} texto - Cuerpo del mensaje que se va a transmitir
   */
  enviarMensajeTexto: (texto) => {
    ipcRenderer.send("enviar-mensaje-texto", texto);
  },

  /**
   * Registra un callback para escuchar de forma asíncrona las respuestas del servidor
   * @param {function} callback - Función que procesará el JSON recibido
   */
  recibirRespuesta: (callback) => {
    // Remueve escuchas previos para evitar fugas de memoria o duplicación de eventos
    ipcRenderer.removeAllListeners("servidor-respuesta");

    ipcRenderer.on("servidor-respuesta", (event, data) => callback(data));
  },
});
