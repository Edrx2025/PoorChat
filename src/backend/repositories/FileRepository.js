const BaseRepository = require("./BaseRepository");

class FileRepository extends BaseRepository {
  create({
    originalName,
    storedName,
    filePath,
    fileType,
    mimeType,
    size,
    uploadedBy,
    chatId = null,
    groupId = null,
  }) {
    const result = this.prepare(`
      INSERT INTO files (
        original_name,
        stored_name,
        file_path,
        file_type,
        mime_type,
        size,
        uploaded_by,
        chat_id,
        group_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      originalName,
      storedName,
      filePath,
      fileType,
      mimeType,
      size,
      uploadedBy,
      chatId,
      groupId,
    );

    return this.findById(Number(result.lastInsertRowid));
  }

  findById(fileId) {
    return this.prepare(`
      SELECT
        id,
        original_name AS originalName,
        stored_name AS storedName,
        file_path AS filePath,
        file_type AS fileType,
        mime_type AS mimeType,
        size,
        uploaded_by AS uploadedBy,
        chat_id AS chatId,
        group_id AS groupId,
        created_at AS createdAt
      FROM files
      WHERE id = ?
    `).get(fileId);
  }

  listForContext({ chatId = null, groupId = null }) {
    const column = chatId ? "f.chat_id" : "f.group_id";
    const id = chatId || groupId;

    return this.prepare(`
      SELECT
        f.id,
        f.original_name AS originalName,
        f.file_type AS fileType,
        f.mime_type AS mimeType,
        f.size,
        f.uploaded_by AS uploadedBy,
        f.created_at AS createdAt,
        u.username AS uploaderUsername,
        u.display_name AS uploaderDisplayName
      FROM files f
      JOIN users u ON u.id = f.uploaded_by
      WHERE ${column} = ?
      ORDER BY f.id DESC
    `).all(id);
  }
}

module.exports = FileRepository;
