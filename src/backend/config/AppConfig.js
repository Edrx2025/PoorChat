const path = require("path");

class AppConfig {
  constructor() {
    const projectRoot = path.resolve(__dirname, "../../..");

    this.projectRoot = projectRoot;
    this.databasePath =
      process.env.CHAD_DATABASE_PATH ||
      path.join(projectRoot, "database", "chad.sqlite");
    this.storagePath =
      process.env.CHAD_STORAGE_PATH || path.join(projectRoot, "storage", "uploads");
    this.tcpHost = process.env.CHAD_TCP_HOST || "0.0.0.0";
    this.tcpPort = Number(process.env.CHAD_TCP_PORT || 5050);
    this.udpHost = process.env.CHAD_UDP_HOST || "0.0.0.0";
    this.udpPort = Number(process.env.CHAD_UDP_PORT || 5051);
    this.maxFileSize = Number(
      process.env.CHAD_MAX_FILE_SIZE || 20 * 1024 * 1024,
    );
    this.fileChunkSize = Number(process.env.CHAD_FILE_CHUNK_SIZE || 64 * 1024);
    this.mediaChunkSize = Number(process.env.CHAD_MEDIA_CHUNK_SIZE || 700);
    this.callTimeoutMs = Number(process.env.CHAD_CALL_TIMEOUT_MS || 30000);
  }

  static getInstance() {
    if (!AppConfig.instance) {
      AppConfig.instance = new AppConfig();
    }

    return AppConfig.instance;
  }
}

module.exports = AppConfig;
