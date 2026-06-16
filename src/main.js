// src/main.js
const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// Importamos el motor de red cliente (Instancia Singleton única)
const chatClient = require("./client/chatClient");
// Importamos el diccionario oficial de protocolos del proyecto
const MessageTypes = require("./protocol/messageTypes");

// Variable global para mantener viva la referencia de la ventana de la interfaz
let ventanaPrincipal = null;

/**
 * Función encargada de instanciar y configurar la ventana gráfica (UI)
 */
function crearVentana() {
  ventanaPrincipal = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      // El archivo preload actúa como el puente intermedio obligatorio
      preload: path.join(__dirname, "ui", "preload.js"),
      contextIsolation: true, // Aísla el contexto por seguridad
      nodeIntegration: false, // Desactiva Node.js directo en la pantalla web
    },
  });

  // Carga la interfaz gráfica del chat (HTML/CSS)
  ventanaPrincipal.loadFile(path.join(__dirname, "ui", "index.html"));

  // Limpieza de memoria cuando la ventana se cierra
  ventanaPrincipal.on("closed", () => {
    ventanaPrincipal = null;
  });
}

// --- CICLO DE VIDA DE LA APLICACIÓN ---

app.whenReady().then(() => {
  crearVentana();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on("window-all-closed", () => {
  // En macOS (darwin) las apps suelen quedarse activas en la barra hasta que se fuerza el cierre
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// --- 🎛️ SECCIÓN DE ORQUESTACIÓN Y RUTEO (IPC MAIN) ---

/**
 * Escucha el evento 'intentar-login' disparado por la interfaz gráfica (renderer.js)
 * a través del cordón seguro de preload.js
 */
ipcMain.on("intentar-login", (event, { ip, puerto, usuario }) => {
  console.log(
    `[Main Process] Solicitud de conexión de red para: ${usuario} en ${ip}:${puerto}`,
  );

  // Invocamos el método conectar del motor TCP pasándole las credenciales y las funciones de retorno (callbacks)
  chatClient.conectar(
    ip,
    parseInt(puerto),
    usuario,

    // Callback 1: Se ejecuta automáticamente cada vez que llega un JSON del servidor de Carlos
    (mensajeJson) => {
      if (ventanaPrincipal) {
        console.log(
          `[Main Process] Mensaje TCP entrante ruteado a la UI: ${mensajeJson.type}`,
        );
        // Reenviamos el objeto JSON por el canal "servidor-respuesta" hacia la pantalla
        ventanaPrincipal.webContents.send("servidor-respuesta", mensajeJson);
      }
    },

    // Callback 2: Se ejecuta automáticamente si el cable de red TCP o Tailscale falla
    (error) => {
      if (ventanaPrincipal) {
        console.error(
          `[Main Process] Error de red capturado: ${error.message}`,
        );
        // Construimos un mensaje de error estructurado según el protocolo para no colapsar la UI
        ventanaPrincipal.webContents.send("servidor-respuesta", {
          type: MessageTypes.LOGIN_ERROR,
          payload: {
            message: `No se pudo conectar al servidor: ${error.message}`,
          },
        });
      }
    },
  );
});
