const BaseRepository = require("./BaseRepository");

class CallRepository extends BaseRepository {
  create({ callType, callerId, receiverId = null, groupId = null, status }) {
    const result = this.prepare(`
      INSERT INTO calls (
        call_type,
        caller_id,
        receiver_id,
        group_id,
        status
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(callType, callerId, receiverId, groupId, status);

    return this.findById(Number(result.lastInsertRowid));
  }

  findById(callId) {
    return this.prepare(`
      SELECT
        c.id,
        c.call_type AS callType,
        c.caller_id AS callerId,
        c.receiver_id AS receiverId,
        c.group_id AS groupId,
        c.status,
        c.started_at AS startedAt,
        c.ended_at AS endedAt,
        c.created_at AS createdAt,
        caller.username AS callerUsername,
        caller.display_name AS callerDisplayName,
        caller.profile_picture AS callerProfilePicture,
        receiver.username AS receiverUsername,
        receiver.display_name AS receiverDisplayName,
        receiver.profile_picture AS receiverProfilePicture,
        g.name AS groupName
      FROM calls c
      JOIN users caller ON caller.id = c.caller_id
      LEFT JOIN users receiver ON receiver.id = c.receiver_id
      LEFT JOIN "groups" g ON g.id = c.group_id
      WHERE c.id = ?
    `).get(callId);
  }

  updateStatus(callId, status) {
    const startedAt =
      status === "in_progress" ? "COALESCE(started_at, CURRENT_TIMESTAMP)" : "started_at";
    const endedAt = ["ended", "rejected", "missed"].includes(status)
      ? "CURRENT_TIMESTAMP"
      : "ended_at";

    this.prepare(`
      UPDATE calls
      SET
        status = ?,
        started_at = ${startedAt},
        ended_at = ${endedAt}
      WHERE id = ?
    `).run(status, callId);

    return this.findById(callId);
  }

  listForUser(userId) {
    return this.prepare(`
      SELECT
        c.id,
        c.call_type AS callType,
        c.caller_id AS callerId,
        c.receiver_id AS receiverId,
        c.group_id AS groupId,
        c.status,
        c.started_at AS startedAt,
        c.ended_at AS endedAt,
        c.created_at AS createdAt,
        caller.username AS callerUsername,
        caller.display_name AS callerDisplayName,
        receiver.username AS receiverUsername,
        receiver.display_name AS receiverDisplayName,
        g.name AS groupName
      FROM calls c
      JOIN users caller ON caller.id = c.caller_id
      LEFT JOIN users receiver ON receiver.id = c.receiver_id
      LEFT JOIN "groups" g ON g.id = c.group_id
      LEFT JOIN group_members gm ON gm.group_id = c.group_id AND gm.user_id = ?
      WHERE c.caller_id = ? OR c.receiver_id = ? OR gm.user_id = ?
      ORDER BY c.id DESC
      LIMIT 100
    `).all(userId, userId, userId, userId);
  }
}

module.exports = CallRepository;
