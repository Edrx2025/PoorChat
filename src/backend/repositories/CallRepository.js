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

  createParticipants(callId, callerId, recipientIds) {
    const insert = this.prepare(`
      INSERT OR REPLACE INTO call_participants (
        call_id,
        user_id,
        status,
        joined_at,
        left_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, NULL, CURRENT_TIMESTAMP)
    `);

    insert.run(callId, callerId, "joined", new Date().toISOString());
    for (const userId of recipientIds) {
      insert.run(callId, userId, "invited", null);
    }
  }

  listParticipants(callId) {
    return this.prepare(`
      SELECT
        cp.user_id AS id,
        cp.status,
        cp.joined_at AS joinedAt,
        cp.left_at AS leftAt,
        u.username,
        u.display_name AS displayName,
        u.profile_picture AS profilePicture
      FROM call_participants cp
      JOIN users u ON u.id = cp.user_id
      WHERE cp.call_id = ?
      ORDER BY
        CASE cp.status
          WHEN 'joined' THEN 0
          WHEN 'invited' THEN 1
          ELSE 2
        END,
        cp.joined_at,
        u.display_name COLLATE NOCASE
    `).all(callId);
  }

  findParticipant(callId, userId) {
    return this.prepare(`
      SELECT
        call_id AS callId,
        user_id AS userId,
        status,
        joined_at AS joinedAt,
        left_at AS leftAt
      FROM call_participants
      WHERE call_id = ? AND user_id = ?
    `).get(callId, userId);
  }

  updateParticipantStatus(callId, userId, status) {
    const joinedAt =
      status === "joined" ? "COALESCE(joined_at, CURRENT_TIMESTAMP)" : "joined_at";
    const leftAt = ["left", "rejected", "missed"].includes(status)
      ? "CURRENT_TIMESTAMP"
      : "NULL";

    this.prepare(`
      UPDATE call_participants
      SET
        status = ?,
        joined_at = ${joinedAt},
        left_at = ${leftAt},
        updated_at = CURRENT_TIMESTAMP
      WHERE call_id = ? AND user_id = ?
    `).run(status, callId, userId);

    return this.findParticipant(callId, userId);
  }

  upsertParticipantStatus(callId, userId, status) {
    this.prepare(`
      INSERT INTO call_participants (
        call_id,
        user_id,
        status,
        joined_at,
        left_at,
        updated_at
      )
      VALUES (?, ?, ?, CURRENT_TIMESTAMP, NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(call_id, user_id) DO UPDATE SET
        status = excluded.status,
        joined_at = COALESCE(call_participants.joined_at, CURRENT_TIMESTAMP),
        left_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    `).run(callId, userId, status);

    return this.findParticipant(callId, userId);
  }

  expireInvitations(callId) {
    this.prepare(`
      UPDATE call_participants
      SET
        status = 'missed',
        left_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE call_id = ? AND status = 'invited'
    `).run(callId);
  }

  countParticipantsByStatus(callId, status) {
    return this.prepare(`
      SELECT COUNT(*) AS total
      FROM call_participants
      WHERE call_id = ? AND status = ?
    `).get(callId, status).total;
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

  findActiveForGroup(groupId) {
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
        g.name AS groupName
      FROM calls c
      JOIN users caller ON caller.id = c.caller_id
      JOIN "groups" g ON g.id = c.group_id
      WHERE c.group_id = ? AND c.status IN ('started', 'in_progress')
      ORDER BY c.id DESC
      LIMIT 1
    `).get(groupId);
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
