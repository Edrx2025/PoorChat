const fs = require("fs");
const path = require("path");
const { dialog, ipcMain, shell } = require("electron");
const MessageTypes = require("../backend/network/MessageTypes");
const AppConfig = require("../backend/config/AppConfig");

function getMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".txt": "text/plain",
    ".doc": "application/msword",
    ".docx":
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx":
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
  };

  return mimeTypes[extension] || "application/octet-stream";
}

function registerIpcHandlers({
  tcpClient,
  udpClient,
  getWindow,
  sessionState,
}) {
  const config = AppConfig.getInstance();

  async function ensureConnected(payload = {}) {
    const host = payload.host || sessionState.host || "127.0.0.1";
    const port = Number(payload.port || sessionState.port || config.tcpPort);
    await tcpClient.connect(host, port);
    sessionState.host = host;
    sessionState.port = port;
  }

  async function uploadBuffer(payload, fileBuffer, originalName, mimeType) {
    const start = await tcpClient.request(MessageTypes.FILE_UPLOAD_START, {
      contextType: payload.contextType,
      contextId: payload.contextId,
      originalName,
      mimeType,
      size: fileBuffer.length,
    });

    for (
      let offset = 0;
      offset < fileBuffer.length;
      offset += config.fileChunkSize
    ) {
      const chunk = fileBuffer.subarray(offset, offset + config.fileChunkSize);
      const progress = await tcpClient.request(
        MessageTypes.FILE_UPLOAD_CHUNK,
        {
          transferId: start.transferId,
          chunkBase64: chunk.toString("base64"),
        },
        30000,
      );
      getWindow()?.webContents.send("file:progress", progress);
    }

    return tcpClient.request(
      MessageTypes.FILE_UPLOAD_END,
      { transferId: start.transferId },
      30000,
    );
  }

  ipcMain.handle("auth:register", async (_event, payload) => {
    await ensureConnected(payload);
    return tcpClient.request(MessageTypes.AUTH_REGISTER, payload);
  });

  ipcMain.handle("auth:login", async (_event, payload) => {
    await ensureConnected(payload);
    const result = await tcpClient.request(MessageTypes.AUTH_LOGIN, payload);
    sessionState.user = result.user;
    sessionState.udpPort = result.udpPort;

    udpClient.stop();
    udpClient.start({
      serverHost: sessionState.host,
      serverPort: result.udpPort,
      userId: result.user.id,
    });

    return result;
  });

  ipcMain.handle("auth:logout", async () => {
    try {
      if (sessionState.user) {
        await tcpClient.request(MessageTypes.AUTH_LOGOUT);
      }
    } finally {
      sessionState.user = null;
      udpClient.stop();
      tcpClient.disconnect();
    }
    return { loggedOut: true };
  });

  ipcMain.handle("app:bootstrap", () =>
    tcpClient.request(MessageTypes.APP_BOOTSTRAP),
  );
  ipcMain.handle("chat:open", (_event, payload) =>
    tcpClient.request(MessageTypes.CHAT_OPEN, payload),
  );
  ipcMain.handle("chat:get-messages", (_event, payload) =>
    tcpClient.request(MessageTypes.CHAT_MESSAGES, payload),
  );
  ipcMain.handle("chat:send", (_event, payload) =>
    tcpClient.request(MessageTypes.CHAT_SEND, payload),
  );
  ipcMain.handle("chat:delete-message", (_event, payload) =>
    tcpClient.request(MessageTypes.CHAT_DELETE, payload),
  );
  ipcMain.handle("chat:pin-message", (_event, payload) =>
    tcpClient.request(MessageTypes.CHAT_PIN, payload),
  );
  ipcMain.handle("group:create", (_event, payload) =>
    tcpClient.request(MessageTypes.GROUP_CREATE, payload),
  );
  ipcMain.handle("group:update", (_event, payload) =>
    tcpClient.request(MessageTypes.GROUP_UPDATE, payload),
  );
  ipcMain.handle("file:list", (_event, payload) =>
    tcpClient.request(MessageTypes.FILE_LIST, payload),
  );
  ipcMain.handle("call:start", (_event, payload) =>
    tcpClient.request(MessageTypes.CALL_START, payload),
  );
  ipcMain.handle("call:accept", (_event, payload) =>
    tcpClient.request(MessageTypes.CALL_ACCEPT, payload),
  );
  ipcMain.handle("call:reject", (_event, payload) =>
    tcpClient.request(MessageTypes.CALL_REJECT, payload),
  );
  ipcMain.handle("call:end", (_event, payload) =>
    tcpClient.request(MessageTypes.CALL_END, payload),
  );
  ipcMain.handle("settings:update", (_event, payload) =>
    tcpClient.request(MessageTypes.SETTINGS_UPDATE, payload),
  );
  ipcMain.handle("user:update-profile", (_event, payload) =>
    tcpClient.request(MessageTypes.PROFILE_UPDATE, payload),
  );
  ipcMain.handle("user:change-password", (_event, payload) =>
    tcpClient.request(MessageTypes.PASSWORD_CHANGE, payload),
  );

  ipcMain.handle("file:choose-and-upload", async (_event, payload) => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: "Seleccionar archivo",
      properties: ["openFile"],
      filters: [
        {
          name: "Archivos permitidos",
          extensions: [
            "pdf",
            "txt",
            "doc",
            "docx",
            "xls",
            "xlsx",
            "jpg",
            "jpeg",
            "png",
            "webp",
            "mp3",
            "wav",
            "ogg",
            "mp4",
            "webm",
            "mov",
          ],
        },
      ],
    });

    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const filePath = result.filePaths[0];
    const stats = fs.statSync(filePath);
    const originalName = path.basename(filePath);
    const mimeType = getMimeType(filePath);
    const fileBuffer = fs.readFileSync(filePath);
    if (stats.size !== fileBuffer.length) {
      throw new Error("No se pudo leer el archivo completo");
    }
    return uploadBuffer(
      payload,
      fileBuffer,
      originalName,
      mimeType,
    );
  });

  ipcMain.handle("file:upload-recorded-audio", async (_event, payload) => {
    const fileBuffer = Buffer.from(payload.dataBase64 || "", "base64");
    if (!fileBuffer.length) throw new Error("La nota de voz está vacía");

    return uploadBuffer(
      payload,
      fileBuffer,
      payload.originalName || `nota-voz-${Date.now()}.webm`,
      payload.mimeType || "audio/webm",
    );
  });

  ipcMain.handle("file:download", async (_event, payload) => {
    const download = await tcpClient.request(
      MessageTypes.FILE_DOWNLOAD,
      payload,
      30000,
    );
    const result = await dialog.showSaveDialog(getWindow(), {
      title: "Guardar archivo",
      defaultPath: download.file.originalName,
    });

    if (result.canceled || !result.filePath) return { canceled: true };

    fs.writeFileSync(
      result.filePath,
      Buffer.from(download.dataBase64, "base64"),
    );

    return {
      saved: true,
      filePath: result.filePath,
    };
  });

  ipcMain.handle("file:open", async (_event, { filePath }) => {
    return shell.openPath(filePath);
  });

  ipcMain.handle("user:choose-avatar", async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: "Seleccionar foto de perfil",
      properties: ["openFile"],
      filters: [
        {
          name: "Imágenes",
          extensions: ["jpg", "jpeg", "png", "webp"],
        },
      ],
    });

    if (result.canceled || !result.filePaths[0]) return { canceled: true };

    const filePath = result.filePaths[0];
    const buffer = fs.readFileSync(filePath);
    const mimeType = getMimeType(filePath);
    const updatedUser = await tcpClient.request(MessageTypes.PROFILE_AVATAR, {
      originalName: path.basename(filePath),
      mimeType,
      dataBase64: buffer.toString("base64"),
    });

    return {
      canceled: false,
      user: updatedUser,
    };
  });

  ipcMain.handle("media:send", (_event, payload) => {
    udpClient.sendMedia(payload);
    return { sent: true };
  });

  tcpClient.on("event", (message) => {
    getWindow()?.webContents.send("server:event", message);
  });
  tcpClient.on("disconnected", () => {
    getWindow()?.webContents.send("server:disconnected");
  });
  tcpClient.on("error", (error) => {
    getWindow()?.webContents.send("server:error", error.message);
  });
  udpClient.on("media", (media) => {
    getWindow()?.webContents.send("media:received", media);
  });
  udpClient.on("error", (error) => {
    getWindow()?.webContents.send("server:error", error.message);
  });
}

module.exports = registerIpcHandlers;
