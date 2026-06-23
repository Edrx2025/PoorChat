class SessionRegistry {
  constructor() {
    this.connectionsByUserId = new Map();
  }

  add(userId, connection) {
    if (this.connectionsByUserId.has(userId)) {
      throw new Error("La cuenta ya tiene una sesión activa");
    }
    this.connectionsByUserId.set(userId, connection);
  }

  remove(userId) {
    this.connectionsByUserId.delete(userId);
  }

  sendToUsers(userIds, eventName, data) {
    for (const userId of new Set(userIds)) {
      const connection = this.connectionsByUserId.get(userId);
      if (connection) connection.sendEvent(eventName, data);
    }
  }

  broadcast(eventName, data) {
    for (const connection of this.connectionsByUserId.values()) {
      connection.sendEvent(eventName, data);
    }
  }

  getConnectedUserIds() {
    return [...this.connectionsByUserId.keys()];
  }
}

module.exports = SessionRegistry;
