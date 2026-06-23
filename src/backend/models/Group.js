class Group {
  constructor({
    id = null,
    name,
    description = "",
    avatar = null,
    createdBy,
    createdAt = null,
  }) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.avatar = avatar;
    this.createdBy = createdBy;
    this.createdAt = createdAt;
  }
}

module.exports = Group;
