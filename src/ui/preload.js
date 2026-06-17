// src/ui/preload.js
const { contextBridge, ipcRenderer } = require("electron");

// Exponemos una API segura y personalizada en el objeto global 'window'
contextBridge.exposeInMainWorld("poorChatAPI", {
  /**
   * Envía las credenciales de conexión al proceso principal (main.js)
   * @param {string} ip - Dirección IP de Tailscale del servidor
   * @param {string} puerto - Puerto de escucha TCP
   * @param {string} usuario - Nombre de usuario para la sesión
   */
  enviarLogin: (ip, puerto, usuario) => {
    ipcRenderer.send("intentar-login", { ip, puerto, usuario });
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
