const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");
const TcpClient = require("../backend/network/TcpClient");
const UdpMediaClient = require("../backend/network/UdpMediaClient");
const registerIpcHandlers = require("./ipcHandlers");

let mainWindow = null;
const tcpClient = new TcpClient();
const udpClient = new UdpMediaClient();
const sessionState = {
  user: null,
  host: null,
  port: null,
  udpPort: null,
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: Number(process.env.CHAD_WINDOW_WIDTH || 1440),
    height: Number(process.env.CHAD_WINDOW_HEIGHT || 900),
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: "#101412",
    title: "Chad",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(
    path.join(__dirname, "..", "renderer", "index.html"),
  );
  mainWindow.webContents.once("did-finish-load", async () => {
    if (process.env.CHAD_E2E_LOGIN_USER) {
      const credentials = {
        username: process.env.CHAD_E2E_LOGIN_USER,
        password: process.env.CHAD_E2E_LOGIN_PASSWORD || "123456",
        host: process.env.CHAD_E2E_HOST || "127.0.0.1",
        port: process.env.CHAD_E2E_PORT || "5050",
      };
      await mainWindow.webContents.executeJavaScript(`
        document.querySelector("#login-username").value = ${JSON.stringify(credentials.username)};
        document.querySelector("#login-password").value = ${JSON.stringify(credentials.password)};
        document.querySelector("#server-host").value = ${JSON.stringify(credentials.host)};
        document.querySelector("#server-port").value = ${JSON.stringify(credentials.port)};
        document.querySelector("#login-form").requestSubmit();
        ${
          process.env.CHAD_E2E_OPEN_FIRST_CHAT
            ? `
              setTimeout(() => {
                document.querySelector(".conversation-item")?.click();
              }, 1800);
            `
            : ""
        }
        ${
          process.env.CHAD_E2E_VIEW
            ? `
              setTimeout(() => {
                document.querySelector('[data-view="${process.env.CHAD_E2E_VIEW}"]')?.click();
              }, 1800);
            `
            : ""
        }
      `);
    }

    if (process.env.CHAD_SCREENSHOT_PATH) {
      setTimeout(async () => {
        const image = await mainWindow.webContents.capturePage();
        fs.writeFileSync(
          process.env.CHAD_SCREENSHOT_PATH,
          image.toPNG(),
        );
        app.quit();
      }, process.env.CHAD_E2E_LOGIN_USER ? 3500 : 900);
    }
  });
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerIpcHandlers({
    tcpClient,
    udpClient,
    getWindow: () => mainWindow,
    sessionState,
  });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  udpClient.stop();
  tcpClient.disconnect();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
