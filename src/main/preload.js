const { contextBridge, ipcRenderer } = require("electron");

function on(channel, callback) {
  const listener = (_event, data) => callback(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld("chad", {
  auth: {
    register: (payload) => ipcRenderer.invoke("auth:register", payload),
    login: (payload) => ipcRenderer.invoke("auth:login", payload),
    logout: () => ipcRenderer.invoke("auth:logout"),
  },
  app: {
    bootstrap: () => ipcRenderer.invoke("app:bootstrap"),
  },
  chat: {
    open: (payload) => ipcRenderer.invoke("chat:open", payload),
    getMessages: (payload) =>
      ipcRenderer.invoke("chat:get-messages", payload),
    getCachedMessages: (payload) =>
      ipcRenderer.invoke("chat:get-cached-messages", payload),
    syncMessages: (payload) =>
      ipcRenderer.invoke("chat:sync-messages", payload),
    loadOlder: (payload) => ipcRenderer.invoke("chat:load-older", payload),
    send: (payload) => ipcRenderer.invoke("chat:send", payload),
    deleteMessage: (payload) =>
      ipcRenderer.invoke("chat:delete-message", payload),
    pinMessage: (payload) => ipcRenderer.invoke("chat:pin-message", payload),
    clear: (payload) => ipcRenderer.invoke("chat:clear", payload),
    remove: (payload) => ipcRenderer.invoke("chat:remove", payload),
  },
  group: {
    create: (payload) => ipcRenderer.invoke("group:create", payload),
    update: (payload) => ipcRenderer.invoke("group:update", payload),
    promote: (payload) => ipcRenderer.invoke("group:promote", payload),
    removeMember: (payload) =>
      ipcRenderer.invoke("group:remove-member", payload),
    leave: (payload) => ipcRenderer.invoke("group:leave", payload),
    clear: (payload) => ipcRenderer.invoke("group:clear", payload),
  },
  file: {
    chooseAndUpload: (payload) =>
      ipcRenderer.invoke("file:choose-and-upload", payload),
    uploadRecordedAudio: (payload) =>
      ipcRenderer.invoke("file:upload-recorded-audio", payload),
    list: (payload) => ipcRenderer.invoke("file:list", payload),
    getPreview: (payload) => ipcRenderer.invoke("file:get-preview", payload),
    download: (payload) => ipcRenderer.invoke("file:download", payload),
    onProgress: (callback) => on("file:progress", callback),
  },
  call: {
    start: (payload) => ipcRenderer.invoke("call:start", payload),
    accept: (payload) => ipcRenderer.invoke("call:accept", payload),
    join: (payload) => ipcRenderer.invoke("call:join", payload),
    reject: (payload) => ipcRenderer.invoke("call:reject", payload),
    end: (payload) => ipcRenderer.invoke("call:end", payload),
    deleteRecord: (payload) =>
      ipcRenderer.invoke("call:delete-record", payload),
    clearHistory: () => ipcRenderer.invoke("call:clear-history"),
  },
  settings: {
    update: (payload) => ipcRenderer.invoke("settings:update", payload),
    updateProfile: (payload) =>
      ipcRenderer.invoke("user:update-profile", payload),
    changePassword: (payload) =>
      ipcRenderer.invoke("user:change-password", payload),
    chooseAvatar: () => ipcRenderer.invoke("user:choose-avatar"),
  },
  media: {
    send: (payload) => ipcRenderer.invoke("media:send", payload),
    onReceived: (callback) => on("media:received", callback),
  },
  events: {
    onServerEvent: (callback) => on("server:event", callback),
    onDisconnected: (callback) => on("server:disconnected", callback),
    onError: (callback) => on("server:error", callback),
  },
});
