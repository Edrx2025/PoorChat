const path = require("path");
const fs = require("fs");
const {
  validateUsername,
  validateDisplayName,
  validatePassword,
  validateTheme,
  validateStatus,
} = require("../utils/validators");
const { verifyPassword, hashPassword } = require("../utils/password");
const {
  ensureDirectory,
  createStoredName,
  fileToDataUrl,
} = require("../utils/fileUtils");
const { publicUser } = require("../utils/presenters");

class SettingsService {
  constructor(userRepository, settingsRepository, config, notificationService) {
    this.userRepository = userRepository;
    this.settingsRepository = settingsRepository;
    this.config = config;
    this.notificationService = notificationService;
  }

  get(userId) {
    return this.settingsRepository.findByUserId(userId);
  }

  updateSettings(userId, updates) {
    const normalized = {
      ...updates,
      theme: updates.theme ? validateTheme(updates.theme) : undefined,
    };

    const settings = this.settingsRepository.update(userId, normalized);
    this.userRepository.updateProfile(userId, { theme: settings.theme });
    this.notificationService.notify("settings:updated", [userId], settings);
    return settings;
  }

  updateProfile(userId, updates) {
    const current = this.userRepository.findById(userId);
    const username = updates.username
      ? validateUsername(updates.username)
      : current.username;
    const displayName = updates.displayName
      ? validateDisplayName(updates.displayName)
      : current.displayName;
    const status = updates.status
      ? validateStatus(updates.status)
      : current.status;

    const usernameOwner = this.userRepository.findByUsername(username);
    if (usernameOwner && usernameOwner.id !== userId) {
      throw new Error("El username ya está registrado");
    }

    const user = this.userRepository.updateProfile(userId, {
      username,
      displayName,
      status,
    });
    const presented = publicUser(user);

    this.notificationService.notify("user:updated", [userId], presented);
    return presented;
  }

  async changePassword(userId, { currentPassword, newPassword }) {
    const user = this.userRepository.findById(userId);
    const valid = await verifyPassword(currentPassword, user.passwordHash);

    if (!valid) throw new Error("La contraseña actual es incorrecta");

    const cleanPassword = validatePassword(newPassword);
    this.userRepository.updatePassword(userId, await hashPassword(cleanPassword));
    return { changed: true };
  }

  updateAvatar(userId, { originalName, mimeType, dataBase64 }) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
      throw new Error("La foto debe ser JPG, PNG o WebP");
    }

    const buffer = Buffer.from(dataBase64, "base64");
    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error("La foto de perfil no puede superar 5 MB");
    }

    const avatarDirectory = path.join(this.config.storagePath, "avatars");
    ensureDirectory(avatarDirectory);
    const storedName = createStoredName(originalName, mimeType);
    const filePath = path.join(avatarDirectory, storedName);
    fs.writeFileSync(filePath, buffer);

    const user = this.userRepository.updateProfile(userId, {
      profilePicture: filePath,
    });
    const presented = publicUser(user);
    presented.avatarData = fileToDataUrl(filePath, mimeType);

    this.notificationService.notify("user:updated", [userId], presented);
    return presented;
  }
}

module.exports = SettingsService;
