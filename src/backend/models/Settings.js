class Settings {
  constructor({
    userId,
    theme = "dark",
    notificationsEnabled = true,
    callNotificationsEnabled = true,
    soundEnabled = true,
    accentColor = "#2f8f73",
  }) {
    this.userId = userId;
    this.theme = theme;
    this.notificationsEnabled = notificationsEnabled;
    this.callNotificationsEnabled = callNotificationsEnabled;
    this.soundEnabled = soundEnabled;
    this.accentColor = accentColor;
  }
}

module.exports = Settings;
