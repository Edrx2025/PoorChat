const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

class LocalMessageCache {
  constructor(databasePath) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS cached_messages (
        server_key TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        context_type TEXT NOT NULL,
        context_id INTEGER NOT NULL,
        message_id INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT,
        PRIMARY KEY (
          server_key,
          user_id,
          context_type,
          context_id,
          message_id
        )
      );
      CREATE INDEX IF NOT EXISTS idx_cached_messages_context
        ON cached_messages (
          server_key,
          user_id,
          context_type,
          context_id,
          message_id DESC
        );
      CREATE TABLE IF NOT EXISTS cached_contexts (
        server_key TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        context_type TEXT NOT NULL,
        context_id INTEGER NOT NULL,
        initialized INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (server_key, user_id, context_type, context_id)
      );
    `);
    this.identity = null;
  }

  configure({ host, port, userId }) {
    const numericUserId = Number(userId);
    if (!host || !Number.isInteger(numericUserId) || numericUserId <= 0) {
      throw new Error("Identidad inválida para el caché local");
    }

    this.identity = {
      serverKey: `${String(host).trim()}:${Number(port)}`,
      userId: numericUserId,
    };
  }

  resetIdentity() {
    this.identity = null;
  }

  upsertMessages(contextType, contextId, messages) {
    if (!this.identity || !Array.isArray(messages) || !messages.length) return;
    this.assertContext(contextType, contextId);

    const statement = this.database.prepare(`
      INSERT INTO cached_messages (
        server_key,
        user_id,
        context_type,
        context_id,
        message_id,
        payload_json,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (
        server_key,
        user_id,
        context_type,
        context_id,
        message_id
      ) DO UPDATE SET
        payload_json = excluded.payload_json,
        created_at = excluded.created_at
    `);

    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const message of messages) {
        if (!message?.id) continue;
        const cacheable = this.toCacheableMessage(message);
        statement.run(
          this.identity.serverKey,
          this.identity.userId,
          contextType,
          Number(contextId),
          Number(message.id),
          JSON.stringify(cacheable),
          message.createdAt || null,
        );
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  getLatest(contextType, contextId, limit = 100) {
    if (!this.identity) return [];
    this.assertContext(contextType, contextId);

    return this.readMessages(
      `
        SELECT payload_json
        FROM (
          SELECT payload_json, message_id
          FROM cached_messages
          WHERE server_key = ?
            AND user_id = ?
            AND context_type = ?
            AND context_id = ?
          ORDER BY message_id DESC
          LIMIT ?
        )
        ORDER BY message_id ASC
      `,
      contextType,
      contextId,
      this.normalizeLimit(limit),
    );
  }

  getBefore(contextType, contextId, beforeMessageId, limit = 100) {
    if (!this.identity) return [];
    this.assertContext(contextType, contextId);

    return this.readMessages(
      `
        SELECT payload_json
        FROM (
          SELECT payload_json, message_id
          FROM cached_messages
          WHERE server_key = ?
            AND user_id = ?
            AND context_type = ?
            AND context_id = ?
            AND message_id < ?
          ORDER BY message_id DESC
          LIMIT ?
        )
        ORDER BY message_id ASC
      `,
      contextType,
      contextId,
      Number(beforeMessageId),
      this.normalizeLimit(limit),
    );
  }

  getNewestId(contextType, contextId) {
    return this.getBoundaryId(contextType, contextId, "MAX");
  }

  getOldestId(contextType, contextId) {
    return this.getBoundaryId(contextType, contextId, "MIN");
  }

  isInitialized(contextType, contextId) {
    if (!this.identity) return false;
    this.assertContext(contextType, contextId);

    const row = this.database.prepare(`
      SELECT initialized
      FROM cached_contexts
      WHERE server_key = ?
        AND user_id = ?
        AND context_type = ?
        AND context_id = ?
    `).get(
      this.identity.serverKey,
      this.identity.userId,
      contextType,
      Number(contextId),
    );

    return Boolean(row?.initialized);
  }

  markInitialized(contextType, contextId) {
    if (!this.identity) return;
    this.assertContext(contextType, contextId);

    this.database.prepare(`
      INSERT INTO cached_contexts (
        server_key,
        user_id,
        context_type,
        context_id,
        initialized
      )
      VALUES (?, ?, ?, ?, 1)
      ON CONFLICT (server_key, user_id, context_type, context_id)
      DO UPDATE SET initialized = 1
    `).run(
      this.identity.serverKey,
      this.identity.userId,
      contextType,
      Number(contextId),
    );
  }

  clearContext(contextType, contextId) {
    if (!this.identity) return;
    this.assertContext(contextType, contextId);

    const parameters = [
      this.identity.serverKey,
      this.identity.userId,
      contextType,
      Number(contextId),
    ];
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`
        DELETE FROM cached_messages
        WHERE server_key = ?
          AND user_id = ?
          AND context_type = ?
          AND context_id = ?
      `).run(...parameters);
      this.database.prepare(`
        DELETE FROM cached_contexts
        WHERE server_key = ?
          AND user_id = ?
          AND context_type = ?
          AND context_id = ?
      `).run(...parameters);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.identity = null;
    this.database.close();
  }

  readMessages(sql, contextType, contextId, ...parameters) {
    return this.database.prepare(sql)
      .all(
        this.identity.serverKey,
        this.identity.userId,
        contextType,
        Number(contextId),
        ...parameters,
      )
      .map((row) => {
        try {
          return JSON.parse(row.payload_json);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  }

  getBoundaryId(contextType, contextId, aggregate) {
    if (!this.identity) return 0;
    this.assertContext(contextType, contextId);

    const row = this.database.prepare(`
      SELECT COALESCE(${aggregate}(message_id), 0) AS id
      FROM cached_messages
      WHERE server_key = ?
        AND user_id = ?
        AND context_type = ?
        AND context_id = ?
    `).get(
      this.identity.serverKey,
      this.identity.userId,
      contextType,
      Number(contextId),
    );

    return Number(row.id);
  }

  toCacheableMessage(message) {
    const copy = structuredClone(message);
    if (copy.file) copy.file.previewData = null;
    return copy;
  }

  assertContext(contextType, contextId) {
    if (!["private", "group"].includes(contextType)) {
      throw new Error("Tipo de conversación inválido");
    }
    if (!Number.isInteger(Number(contextId)) || Number(contextId) <= 0) {
      throw new Error("ID de conversación inválido");
    }
  }

  normalizeLimit(limit) {
    const numericLimit = Number(limit);
    if (!Number.isFinite(numericLimit)) return 100;
    return Math.max(1, Math.min(Math.trunc(numericLimit), 100));
  }
}

module.exports = LocalMessageCache;
