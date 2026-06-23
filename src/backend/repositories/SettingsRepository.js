const BaseRepository = require("./BaseRepository");

class SettingsRepository extends BaseRepository {
  findByUserId(userId) {
    return this.prepare(`
      SELECT
        id,
        user_id AS userId,
        theme,
        notifications_enabled AS notificationsEnabled,
        call_notifications_enabled AS callNotificationsEnabled,
        sound_enabled AS soundEnabled,
        accent_color AS accentColor,
        updated_at AS updatedAt
      FROM settings
      WHERE user_id = ?
    `).get(userId);
  }

  update(userId, updates) {
    const current = this.findByUserId(userId);
    const asInteger = (value, fallback) => {
      const resolved = value ?? fallback;
      return resolved ? 1 : 0;
    };

    this.prepare(`
      UPDATE settings
      SET
        theme = ?,
        notifications_enabled = ?,
        call_notifications_enabled = ?,
        sound_enabled = ?,
        accent_color = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      updates.theme ?? current.theme,
      asInteger(
        updates.notificationsEnabled,
        current.notificationsEnabled,
      ),
      asInteger(
        updates.callNotificationsEnabled,
        current.callNotificationsEnabled,
      ),
      asInteger(updates.soundEnabled, current.soundEnabled),
      updates.accentColor ?? current.accentColor,
      userId,
    );

    return this.findByUserId(userId);
  }
}

module.exports = SettingsRepository;
