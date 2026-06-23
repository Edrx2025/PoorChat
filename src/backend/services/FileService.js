const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  ensureDirectory,
  createStoredName,
  getFileCategory,
} = require("../utils/fileUtils");

class FileService {
  constructor(fileRepository, chatService, config) {
    this.fileRepository = fileRepository;
    this.chatService = chatService;
    this.config = config;
    this.transfers = new Map();
  }

  beginUpload(userId, payload) {
    const {
      contextType,
      contextId,
      originalName,
      mimeType = "application/octet-stream",
      size,
      replyToId = null,
    } = payload;

    this.chatService.assertContextAccess(userId, contextType, contextId);
    const reply = replyToId
      ? this.chatService.assertReplyTarget(
          contextType,
          contextId,
          Number(replyToId),
        )
      : null;

    const fileSize = Number(size);
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new Error("El tamaño del archivo es inválido");
    }
    if (fileSize > this.config.maxFileSize) {
      throw new Error("El archivo supera el límite permitido");
    }

    const transferId = crypto.randomUUID();
    this.transfers.set(transferId, {
      userId,
      contextType,
      contextId,
      originalName,
      mimeType,
      expectedSize: fileSize,
      replyToId: reply?.id || null,
      chunks: [],
      receivedSize: 0,
    });

    return { transferId };
  }

  appendChunk(userId, { transferId, chunkBase64 }) {
    const transfer = this.getOwnedTransfer(userId, transferId);
    const chunk = Buffer.from(chunkBase64, "base64");

    transfer.receivedSize += chunk.length;
    if (transfer.receivedSize > transfer.expectedSize) {
      this.transfers.delete(transferId);
      throw new Error("La transferencia excedió el tamaño declarado");
    }

    transfer.chunks.push(chunk);
    return {
      transferId,
      receivedSize: transfer.receivedSize,
      progress: Math.round(
        (transfer.receivedSize / transfer.expectedSize) * 100,
      ),
    };
  }

  finishUpload(userId, { transferId }) {
    const transfer = this.getOwnedTransfer(userId, transferId);
    const buffer = Buffer.concat(transfer.chunks);

    if (buffer.length !== transfer.expectedSize) {
      throw new Error("El archivo recibido está incompleto");
    }

    const fileType = getFileCategory(
      transfer.mimeType,
      transfer.originalName,
    ).replace("images", "image").replace("documents", "document");
    const category = getFileCategory(transfer.mimeType, transfer.originalName);
    const directory = path.join(this.config.storagePath, category);
    ensureDirectory(directory);

    const storedName = createStoredName(
      transfer.originalName,
      transfer.mimeType,
    );
    const filePath = path.join(directory, storedName);
    fs.writeFileSync(filePath, buffer);

    const file = this.fileRepository.create({
      originalName: transfer.originalName,
      storedName,
      filePath,
      fileType,
      mimeType: transfer.mimeType,
      size: buffer.length,
      uploadedBy: userId,
      chatId: transfer.contextType === "private" ? transfer.contextId : null,
      groupId: transfer.contextType === "group" ? transfer.contextId : null,
    });

    this.transfers.delete(transferId);
    const message = this.chatService.createFileMessage(
      userId,
      transfer.contextType,
      transfer.contextId,
      file,
      transfer.replyToId,
    );

    return { file, message };
  }

  download(userId, fileId) {
    const file = this.fileRepository.findById(fileId);
    if (!file) throw new Error("El archivo no existe");

    const contextType = file.chatId ? "private" : "group";
    const contextId = file.chatId || file.groupId;
    this.chatService.assertContextAccess(userId, contextType, contextId);

    if (!fs.existsSync(file.filePath)) {
      throw new Error("El archivo ya no está disponible en el servidor");
    }

    return {
      file: {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        size: file.size,
      },
      dataBase64: fs.readFileSync(file.filePath).toString("base64"),
    };
  }

  list(userId, payload) {
    this.chatService.assertContextAccess(
      userId,
      payload.contextType,
      payload.contextId,
    );

    return this.fileRepository.listForContext({
      chatId: payload.contextType === "private" ? payload.contextId : null,
      groupId: payload.contextType === "group" ? payload.contextId : null,
    });
  }

  getOwnedTransfer(userId, transferId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.userId !== userId) {
      throw new Error("Transferencia de archivo inválida");
    }
    return transfer;
  }
}

module.exports = FileService;
