class User {
  constructor({
    id = null,
    username,
    displayName,
    profilePicture = null,
    status = "offline",
    theme = "dark",
    createdAt = null,
  }) {
    this.id = id;
    this.username = username;
    this.displayName = displayName;
    this.profilePicture = profilePicture;
    this.status = status;
    this.theme = theme;
    this.createdAt = createdAt;
  }
}

module.exports = User;
