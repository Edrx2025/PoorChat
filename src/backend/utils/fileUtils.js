const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const MIME_EXTENSION_MAP = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/webm": ".webm",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "application/pdf": ".pdf",
};

function ensureDirectory(directoryPath) {
  fs.mkdirSync(directoryPath, { recursive: true });
}

function sanitizeFileName(fileName) {
  const baseName = path.basename(String(fileName || "archivo"));
  return baseName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function getFileCategory(mimeType = "", fileName = "") {
  if (mimeType.startsWith("image/")) return "images";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";

  const extension = path.extname(fileName).toLowerCase();
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) return "images";
  if ([".mp3", ".wav", ".ogg", ".webm"].includes(extension)) return "audio";
  if ([".mp4", ".mov", ".mkv"].includes(extension)) return "video";

  return "documents";
}

function createStoredName(originalName, mimeType) {
  const safeName = sanitizeFileName(originalName);
  let extension = path.extname(safeName);

  if (!extension) {
    extension = MIME_EXTENSION_MAP[mimeType] || "";
  }

  return `${crypto.randomUUID()}${extension.toLowerCase()}`;
}

function fileToDataUrl(filePath, mimeType = "image/png") {
  if (!filePath || !fs.existsSync(filePath)) return null;

  const data = fs.readFileSync(filePath).toString("base64");
  return `data:${mimeType};base64,${data}`;
}

module.exports = {
  ensureDirectory,
  sanitizeFileName,
  getFileCategory,
  createStoredName,
  fileToDataUrl,
};
