const BaseRepository = require("./BaseRepository");

class GroupRepository extends BaseRepository {
  create({ name, description, avatar, createdBy, memberIds }) {
    return this.database.transaction(() => {
      const result = this.prepare(`
        INSERT INTO "groups" (name, description, avatar, created_by)
        VALUES (?, ?, ?, ?)
      `).run(name, description, avatar, createdBy);

      const groupId = Number(result.lastInsertRowid);
      const insertMember = this.prepare(`
        INSERT INTO group_members (group_id, user_id, role)
        VALUES (?, ?, ?)
      `);

      const uniqueMembers = new Set([createdBy, ...memberIds]);

      for (const userId of uniqueMembers) {
        insertMember.run(
          groupId,
          userId,
          userId === createdBy ? "owner" : "member",
        );
      }

      return this.findById(groupId);
    });
  }

  findById(groupId) {
    return this.prepare(`
      SELECT
        id,
        name,
        description,
        avatar,
        created_by AS createdBy,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM "groups"
      WHERE id = ?
    `).get(groupId);
  }

  isMember(groupId, userId) {
    return Boolean(
      this.prepare(`
        SELECT 1
        FROM group_members
        WHERE group_id = ? AND user_id = ?
      `).get(groupId, userId),
    );
  }

  isAdmin(groupId, userId) {
    return Boolean(
      this.prepare(`
        SELECT 1
        FROM group_members
        WHERE group_id = ? AND user_id = ? AND role IN ('owner', 'admin')
      `).get(groupId, userId),
    );
  }

  getMember(groupId, userId) {
    return this.prepare(`
      SELECT
        group_id AS groupId,
        user_id AS userId,
        role,
        joined_at AS joinedAt
      FROM group_members
      WHERE group_id = ? AND user_id = ?
    `).get(groupId, userId);
  }

  getMemberIds(groupId) {
    return this.prepare(`
      SELECT user_id AS userId
      FROM group_members
      WHERE group_id = ?
    `)
      .all(groupId)
      .map((row) => row.userId);
  }

  listMembers(groupId) {
    return this.prepare(`
      SELECT
        u.id,
        u.username,
        u.display_name AS displayName,
        u.profile_picture AS profilePicture,
        u.status,
        gm.role,
        gm.joined_at AS joinedAt
      FROM group_members gm
      JOIN users u ON u.id = gm.user_id
      WHERE gm.group_id = ?
      ORDER BY
        CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
        gm.joined_at,
        u.display_name
    `).all(groupId);
  }

  listForUser(userId) {
    const groups = this.prepare(`
      SELECT
        g.id,
        g.name,
        g.description,
        g.avatar,
        g.created_by AS createdBy,
        g.created_at AS createdAt,
        gm.role,
        (
          SELECT m.id
          FROM messages m
          WHERE m.group_id = g.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastMessageId,
        (
          SELECT CASE
            WHEN m.deleted_at IS NOT NULL THEN 'Mensaje borrado'
            ELSE m.content
          END
          FROM messages m
          WHERE m.group_id = g.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastMessage,
        (
          SELECT m.message_type
          FROM messages m
          WHERE m.group_id = g.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastMessageType,
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.group_id = g.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastMessageAt
      FROM group_members gm
      JOIN "groups" g ON g.id = gm.group_id
      WHERE gm.user_id = ?
      ORDER BY COALESCE(lastMessageAt, g.created_at) DESC
    `).all(userId);

    return groups.map((group) => ({
      ...group,
      members: this.listMembers(group.id),
    }));
  }

  update(groupId, { name, description, avatar }) {
    const current = this.findById(groupId);

    this.prepare(`
      UPDATE "groups"
      SET
        name = ?,
        description = ?,
        avatar = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name ?? current.name,
      description ?? current.description,
      avatar ?? current.avatar,
      groupId,
    );

    return this.findById(groupId);
  }

  addMembers(groupId, memberIds) {
    const insert = this.prepare(`
      INSERT OR IGNORE INTO group_members (group_id, user_id, role)
      VALUES (?, ?, 'member')
    `);
    const addedIds = [];

    for (const userId of memberIds) {
      const result = insert.run(groupId, userId);
      if (result.changes) addedIds.push(userId);
    }

    return addedIds;
  }

  updateMemberRole(groupId, userId, role) {
    this.prepare(`
      UPDATE group_members
      SET role = ?
      WHERE group_id = ? AND user_id = ?
    `).run(role, groupId, userId);

    return this.getMember(groupId, userId);
  }

  removeMember(groupId, userId) {
    return this.prepare(`
      DELETE FROM group_members
      WHERE group_id = ? AND user_id = ?
    `).run(groupId, userId).changes > 0;
  }

  findOwnershipSuccessor(groupId, excludedUserId) {
    return this.prepare(`
      SELECT user_id AS userId, role
      FROM group_members
      WHERE group_id = ? AND user_id != ?
      ORDER BY
        CASE role WHEN 'admin' THEN 0 ELSE 1 END,
        joined_at,
        user_id
      LIMIT 1
    `).get(groupId, excludedUserId);
  }

  transferOwnership(groupId, fromUserId, toUserId) {
    return this.database.transaction(() => {
      this.updateMemberRole(groupId, fromUserId, "member");
      this.updateMemberRole(groupId, toUserId, "owner");
      this.prepare(`
        UPDATE "groups"
        SET created_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(toUserId, groupId);
      return this.findById(groupId);
    });
  }

  delete(groupId) {
    return this.prepare(`
      DELETE FROM "groups"
      WHERE id = ?
    `).run(groupId).changes > 0;
  }
}

module.exports = GroupRepository;
