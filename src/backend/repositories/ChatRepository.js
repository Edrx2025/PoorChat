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
          SELECT m.content
          FROM messages m
          WHERE m.chat_id = pc.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastMessage,
        (
          SELECT m.message_type
          FROM messages m
          WHERE m.chat_id = pc.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastMessageType,
        (
          SELECT m.created_at
          FROM messages m
          WHERE m.chat_id = pc.id
          ORDER BY m.id DESC
          LIMIT 1
        ) AS lastMessageAt
      FROM private_chats pc
      JOIN users peer
        ON peer.id = CASE
          WHEN pc.user_one_id = ? THEN pc.user_two_id
          ELSE pc.user_one_id
        END
      WHERE pc.user_one_id = ? OR pc.user_two_id = ?
      ORDER BY COALESCE(lastMessageAt, pc.created_at) DESC
    `).all(userId, userId, userId);
  }

  createMessage({
    chatId = null,
    groupId = null,
    senderId,
    content,
    messageType,
    fileId = null,
  }) {
    const result = this.prepare(`
      INSERT INTO messages (
        chat_id,
        group_id,
        sender_id,
        content,
        message_type,
        file_id
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(chatId, groupId, senderId, content, messageType, fileId);

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
        m.created_at AS createdAt,
        u.username AS senderUsername,
        u.display_name AS senderDisplayName,
        u.profile_picture AS senderProfilePicture,
        f.original_name AS fileOriginalName,
        f.file_path AS filePath,
        f.file_type AS fileType,
        f.mime_type AS fileMimeType,
        f.size AS fileSize
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      LEFT JOIN files f ON f.id = m.file_id
      WHERE m.id = ?
    `).get(messageId);
  }

  listMessages({ chatId = null, groupId = null, limit = 100 }) {
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
          m.created_at AS createdAt,
          u.username AS senderUsername,
          u.display_name AS senderDisplayName,
          u.profile_picture AS senderProfilePicture,
          f.original_name AS fileOriginalName,
          f.file_path AS filePath,
          f.file_type AS fileType,
          f.mime_type AS fileMimeType,
          f.size AS fileSize
        FROM messages m
        JOIN users u ON u.id = m.sender_id
        LEFT JOIN files f ON f.id = m.file_id
        WHERE ${contextColumn} = ?
        ORDER BY m.id DESC
        LIMIT ?
      )
      ORDER BY id ASC
    `).all(contextId, limit);
  }
}

module.exports = ChatRepository;
