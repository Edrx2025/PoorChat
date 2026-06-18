const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

// Importamos el motor de red cliente (Instancia Singleton única)
const chatClient = require("./client/chatClient");
// Importamos el diccionario oficial de protocolos del proyecto
const MessageTypes = require("./protocol/messageTypes");
// Importamos la configuración fija de red de Tailscale (Patrón Singleton/Config)
const NetConfig = require("./network/puertos");

// Variable global para mantener viva la referencia de la ventana de la interfaz
let ventanaPrincipal = null;

// Función encargada de instanciar y configurar la ventana gráfica (UI)
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

// --- Ciclo de vida de la app ---

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

// -SECCIÓN DE ORQUESTACIÓN Y RUTEO (IPC MAIN)-

/*Canal 1: Escucha el intento de login desde la interfaz gráfica (renderer.js).
Ya no recibe IP ni Puerto desde la UI, usa las constantes estáticas de Tailscale.*/

ipcMain.on("intentar-login", (event, { usuario }) => {
  console.log(
    `[Main Process] Conectando de forma transparente a Tailscale en ${NetConfig.SERVER_IP}:${NetConfig.SERVER_PORT} para el usuario: ${usuario}`,
  );

  // Invocamos el método conectar usando las credenciales fijas del archivo de configuración
  chatClient.conectar(
    NetConfig.SERVER_IP,
    NetConfig.SERVER_PORT,
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
            message: `No se pudo conectar al servidor de Carlos: ${error.message}`,
          },
        });
      }
    },
  );
});

/*Canal 2: Mensajería de Texto
Atrapa el texto plano enviado desde el submit de tu formulario de chat y le ordena al motor de red empujarlo por el socket TCP. */
ipcMain.on("enviar-mensaje-texto", (event, texto) => {
  console.log(`[Main Process] Despachando mensaje de texto hacia chatClient`);
  chatClient.enviarMensaje(texto);
});
