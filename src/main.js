const { app, BrowserWindow } = require("electron");
const path = require("path");

function crearVentana() {
  const ventana = new BrowserWindow({
    width: 1000,
    height: 750,
    webPreferences: {
      // El archivo preload actúa como el puente seguro entre HTML y Node.js
      preload: path.join(__dirname, "ui", "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Carga la interfaz gráfica del chat
  ventana.loadFile(path.join(__dirname, "ui", "index.html"));
}

app.whenReady().then(() => {
  crearVentana();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
