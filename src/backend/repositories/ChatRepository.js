const BaseRepository = require("./BaseRepository");

class ChatRepository extends BaseRepository {
  findOrCreatePrivateChat(firstUserId, secondUserId) {
    const userOneId = Math.min(firstUserId, secondUserId);
    const userTwoId = Math.max(firstUserId, secondUserId);

    let chat = this.prepare(`
      SELECT
        id,
        user_one_id AS userOneId,
        user_two_id AS userTwoId,
        created_at AS createdAt
      FROM private_chats
      WHERE user_one_id = ? AND user_two_id = ?
    `).get(userOneId, userTwoId);

    if (!chat) {
      const result = this.prepare(`
        INSERT INTO private_chats (user_one_id, user_two_id)
        VALUES (?, ?)
      `).run(userOneId, userTwoId);

      chat = this.findPrivateChatById(Number(result.lastInsertRowid));
    }

    return chat;
  }

  findPrivateChatById(chatId) {
    return this.prepare(`
      SELECT
        id,
        user_one_id AS userOneId,
        user_two_id AS userTwoId,
        created_at AS createdAt
      FROM private_chats
      WHERE id = ?
    `).get(chatId);
  }

  isPrivateChatMember(chatId, userId) {
    return Boolean(
      this.prepare(`
        SELECT 1
        FROM private_chats
        WHERE id = ? AND (user_one_id = ? OR user_two_id = ?)
      `).get(chatId, userId, userId),
    );
  }

  getPrivateChatMemberIds(chatId) {
    const chat = this.findPrivateChatById(chatId);
    return chat ? [chat.userOneId, chat.userTwoId] : [];
  }

  listPrivateChatsForUser(userId) {
    return this.prepare(`
      SELECT
        pc.id,
        pc.created_at AS createdAt,
        peer.id AS peerId,
        peer.username AS peerUsername,
        peer.display_name AS peerDisplayName,
        peer.profile_picture AS peerProfilePicture,
        peer.status AS peerStatus,
        (
          SELECT CASE
            WHEN m.deleted_at IS NOT NULL THEN 'Mensaje borrado'
            ELSE m.content
          END
          FROM messages m
          WHERE m.chat_id = pc.id
            AND m.id > COALESCE(pcs.cleared_through_message_id, 0)
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastMessage,
        (
          SELECT m.message_type
          FROM messages m
          WHERE m.chat_id = pc.id
            AND m.id > COALESCE(pcs.cleared_through_message_id, 0)
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastMessageType,
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.chat_id = pc.id
            AND m.id > COALESCE(pcs.cleared_through_message_id, 0)
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastMessageAt
      FROM private_chats pc
      JOIN users peer
        ON peer.id = CASE
          WHEN pc.user_one_id = ? THEN pc.user_two_id
          ELSE pc.user_one_id
        END
      LEFT JOIN private_chat_states pcs
        ON pcs.chat_id = pc.id AND pcs.user_id = ?
      WHERE (pc.user_one_id = ? OR pc.user_two_id = ?)
        AND COALESCE(pcs.hidden, 0) = 0
      ORDER BY COALESCE(lastMessageAt, pc.created_at) DESC
    `).all(userId, userId, userId, userId);
  }

  createMessage({
    chatId = null,
    groupId = null,
    senderId,
    content,
    messageType,
    fileId = null,
    replyToId = null,
  }) {
    const result = this.prepare(`
      INSERT INTO messages (
        chat_id,
        group_id,
        sender_id,
        content,
        message_type,
        file_id,
        reply_to_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      chatId,
      groupId,
      senderId,
      content,
      messageType,
      fileId,
      replyToId,
    );

    return this.findMessageById(Number(result.lastInsertRowid));
  }

  findMessageById(messageId) {
    return this.prepare(`
      SELECT
        m.id,
        m.chat_id AS chatId,
        m.group_id AS groupId,
        m.sender_id AS senderId,
        m.content,
        m.message_type AS messageType,
        m.file_id AS fileId,
        m.reply_to_id AS replyToId,
        m.is_pinned AS isPinned,
        m.pinned_by AS pinnedBy,
        m.pinned_at AS pinnedAt,
        m.deleted_at AS deletedAt,
        m.created_at AS createdAt,
        u.username AS senderUsername,
        u.display_name AS senderDisplayName,
        u.profile_picture AS senderProfilePicture,
        f.original_name AS fileOriginalName,
        f.file_path AS filePath,
        f.file_type AS fileType,
        f.mime_type AS fileMimeType,
        f.size AS fileSize,
        replied.content AS replyContent,
        replied.message_type AS replyMessageType,
        replied.deleted_at AS replyDeletedAt,
        reply_user.display_name AS replySenderDisplayName
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN files f ON f.id = m.file_id
      LEFT JOIN messages replied ON replied.id = m.reply_to_id
      LEFT JOIN users reply_user ON reply_user.id = replied.sender_id
      WHERE m.id = ?
    `).get(messageId);
  }

  listMessages({
    chatId = null,
    groupId = null,
    limit = 100,
    afterMessageId = 0,
  }) {
    const contextColumn = chatId ? "m.chat_id" : "m.group_id";
    const contextId = chatId || groupId;

    return this.prepare(`
      SELECT *
      FROM (
        SELECT
          m.id,
          m.chat_id AS chatId,
          m.group_id AS groupId,
          m.sender_id AS senderId,
          m.content,
          m.message_type AS messageType,
          m.file_id AS fileId,
          m.reply_to_id AS replyToId,
          m.is_pinned AS isPinned,
          m.pinned_by AS pinnedBy,
          m.pinned_at AS pinnedAt,
          m.deleted_at AS deletedAt,
          m.created_at AS createdAt,
          u.username AS senderUsername,
          u.display_name AS senderDisplayName,
          u.profile_picture AS senderProfilePicture,
          f.original_name AS fileOriginalName,
          f.file_path AS filePath,
          f.file_type AS fileType,
          f.mime_type AS fileMimeType,
          f.size AS fileSize,
          replied.content AS replyContent,
          replied.message_type AS replyMessageType,
          replied.deleted_at AS replyDeletedAt,
          reply_user.display_name AS replySenderDisplayName
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN files f ON f.id = m.file_id
        LEFT JOIN messages replied ON replied.id = m.reply_to_id
        LEFT JOIN users reply_user ON reply_user.id = replied.sender_id
        WHERE ${contextColumn} = ? AND m.id > ?
        ORDER BY m.id DESC
        LIMIT ?
      )
      ORDER BY id ASC
    `).all(contextId, afterMessageId, limit);
  }

  showPrivateChatForUser(chatId, userId) {
    this.prepare(`
      INSERT INTO private_chat_states (chat_id, user_id, hidden)
      VALUES (?, ?, 0)
      ON CONFLICT(chat_id, user_id) DO UPDATE SET
        hidden = 0,
        updated_at = CURRENT_TIMESTAMP
    `).run(chatId, userId);
  }

  revealPrivateChatForMembers(chatId) {
    const memberIds = this.getPrivateChatMemberIds(chatId);
    for (const userId of memberIds) {
      this.showPrivateChatForUser(chatId, userId);
    }
  }

  getClearedThroughMessageId(chatId, userId) {
    return (
      this.prepare(`
        SELECT cleared_through_message_id AS messageId
        FROM private_chat_states
        WHERE chat_id = ? AND user_id = ?
      `).get(chatId, userId)?.messageId || 0
    );
  }

  clearPrivateChatForUser(chatId, userId, hidden = false) {
    const lastMessageId =
      this.prepare(`
        SELECT COALESCE(MAX(id), 0) AS id
        FROM messages
        WHERE chat_id = ?
      `).get(chatId).id || 0;

    this.prepare(`
      INSERT INTO private_chat_states (
        chat_id,
        user_id,
        cleared_through_message_id,
        hidden,
        updated_at
      )
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(chat_id, user_id) DO UPDATE SET
        cleared_through_message_id = excluded.cleared_through_message_id,
        hidden = excluded.hidden,
        updated_at = CURRENT_TIMESTAMP
    `).run(chatId, userId, lastMessageId, hidden ? 1 : 0);

    return { chatId, clearedThroughMessageId: lastMessageId, hidden };
  }

  softDeleteMessage(messageId) {
    this.prepare(`
      UPDATE messages
      SET
        content = '',
        message_type = 'deleted',
        file_id = NULL,
        is_pinned = 0,
        pinned_by = NULL,
        pinned_at = NULL,
        deleted_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(messageId);

    return this.findMessageById(messageId);
  }

  setMessagePinned(messageId, pinned, userId) {
    this.prepare(`
      UPDATE messages
      SET
        is_pinned = ?,
        pinned_by = ?,
        pinned_at = ${pinned ? "CURRENT_TIMESTAMP" : "NULL"}
      WHERE id = ?
    `).run(pinned ? 1 : 0, pinned ? userId : null, messageId);

    return this.findMessageById(messageId);
  }
}

module.exports = ChatRepository;
