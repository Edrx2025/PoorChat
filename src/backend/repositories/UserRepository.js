const BaseRepository = require("./BaseRepository");

class UserRepository extends BaseRepository {
  create({ username, displayName, passwordHash }) {
    const result = this.prepare(`
      INSERT INTO users (username, display_name, password_hash, status)
      VALUES (?, ?, ?, 'offline')
    `).run(username, displayName, passwordHash);

    const userId = Number(result.lastInsertRowid);
    this.prepare(`
      INSERT INTO settings (user_id, theme)
      VALUES (?, 'dark')
    `).run(userId);

    return this.findById(userId);
  }

  findById(id) {
    return this.prepare(`
      SELECT
        id,
        username,
        display_name AS displayName,
        password_hash AS passwordHash,
        profile_picture AS profilePicture,
        status,
        theme,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM users
      WHERE id = ?
    `).get(id);
  }

  findByUsername(username) {
    return this.prepare(`
      SELECT
        id,
        username,
        display_name AS displayName,
        password_hash AS passwordHash,
        profile_picture AS profilePicture,
        status,
        theme,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM users
      WHERE username = ? COLLATE NOCASE
    `).get(username);
  }

  listExcept(userId) {
    return this.prepare(`
      SELECT
        id,
        username,
        display_name AS displayName,
        profile_picture AS profilePicture,
        status,
        theme,
        created_at AS createdAt
      FROM users
      WHERE id != ?
      ORDER BY
        CASE status WHEN 'online' THEN 0 WHEN 'busy' THEN 1 WHEN 'in_call' THEN 2 ELSE 3 END,
        display_name COLLATE NOCASE
    `).all(userId);
  }

  updateStatus(userId, status) {
    this.prepare(`
      UPDATE users
      SET status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, userId);

    return this.findById(userId);
  }

  updateProfile(userId, { username, displayName, profilePicture, status, theme }) {
    const current = this.findById(userId);

    this.prepare(`
      UPDATE users
      SET
        username = ?,
        display_name = ?,
        profile_picture = ?,
        status = ?,
        theme = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      username ?? current.username,
      displayName ?? current.displayName,
      profilePicture ?? current.profilePicture,
      status ?? current.status,
      theme ?? current.theme,
      userId,
    );

    return this.findById(userId);
  }

  updatePassword(userId, passwordHash) {
    this.prepare(`
      UPDATE users
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, userId);
  }
}

module.exports = UserRepository;
