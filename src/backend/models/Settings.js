class Settings {
  constructor({
    userId,
    theme = "dark",
    notificationsEnabled = true,
    callNotificationsEnabled = true,
    soundEnabled = true,
    accentColor = "#c7db94",
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
