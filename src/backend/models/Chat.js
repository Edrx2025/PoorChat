class Chat {
  constructor({ id = null, createdAt = null }) {
    this.id = id;
    this.createdAt = createdAt;
  }
}

class PrivateChat extends Chat {
  constructor({ id = null, userOneId, userTwoId, createdAt = null }) {
    super({ id, createdAt });
    this.userOneId = userOneId;
    this.userTwoId = userTwoId;
  }
}

module.exports = {
  Chat,
  PrivateChat,
};
