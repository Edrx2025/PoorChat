const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

class LocalMessageCache {
  constructor(databasePath) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);

    // 1. AÑADIDO: busy_timeout es obligatorio para evitar "database is locked" en alta concurrencia
    // synchronous = NORMAL optimiza la escritura en disco al usar el modo WAL
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;
      
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
    // 2. AÑADIDO: Cola global para serializar las escrituras que llegan desde el socket TCP
    this.writeQueue = Promise.resolve();
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

  // 3. AÑADIDO: Se envuelve la lógica síncrona en la cola de promesas
  upsertMessages(contextType, contextId, messages) {
    if (!this.identity || !Array.isArray(messages) || !messages.length)
      return Promise.resolve();
    this.assertContext(contextType, contextId);

    this.writeQueue = this.writeQueue
      .then(() => {
        return new Promise((resolve, reject) => {
          try {
            this.database.exec("BEGIN IMMEDIATE");

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
            resolve();
          } catch (error) {
            if (this.database) this.database.exec("ROLLBACK");
            reject(error);
          }
        });
      })
      .catch((error) => {
        console.error("Error crítico guardando mensajes en caché:", error);
      });

    return this.writeQueue;
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

    const row = this.database
      .prepare(
        `
      SELECT initialized
      FROM cached_contexts
      WHERE server_key = ?
        AND user_id = ?
        AND context_type = ?
        AND context_id = ?
    `,
      )
      .get(
        this.identity.serverKey,
        this.identity.userId,
        contextType,
        Number(contextId),
      );

    return Boolean(row?.initialized);
  }

  // 4. AÑADIDO: Serializada también para evitar colisiones con upsertMessages
  markInitialized(contextType, contextId) {
    if (!this.identity) return Promise.resolve();
    this.assertContext(contextType, contextId);

    this.writeQueue = this.writeQueue
      .then(() => {
        return new Promise((resolve, reject) => {
          try {
            this.database
              .prepare(
                `
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
          `,
              )
              .run(
                this.identity.serverKey,
                this.identity.userId,
                contextType,
                Number(contextId),
              );
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      })
      .catch(console.error);

    return this.writeQueue;
  }

  // 5. AÑADIDO: Serializada para proteger la eliminación en bloque
  clearContext(contextType, contextId) {
    if (!this.identity) return Promise.resolve();
    this.assertContext(contextType, contextId);

    const parameters = [
      this.identity.serverKey,
      this.identity.userId,
      contextType,
      Number(contextId),
    ];

    this.writeQueue = this.writeQueue
      .then(() => {
        return new Promise((resolve, reject) => {
          try {
            this.database.exec("BEGIN IMMEDIATE");
            this.database
              .prepare(
                `
            DELETE FROM cached_messages
            WHERE server_key = ?
              AND user_id = ?
              AND context_type = ?
              AND context_id = ?
          `,
              )
              .run(...parameters);

            this.database
              .prepare(
                `
            DELETE FROM cached_contexts
            WHERE server_key = ?
              AND user_id = ?
              AND context_type = ?
              AND context_id = ?
          `,
              )
              .run(...parameters);

            this.database.exec("COMMIT");
            resolve();
          } catch (error) {
            if (this.database) this.database.exec("ROLLBACK");
            reject(error);
          }
        });
      })
      .catch(console.error);

    return this.writeQueue;
  }

  close() {
    this.identity = null;
    this.database.close();
  }

  readMessages(sql, contextType, contextId, ...parameters) {
    return this.database
      .prepare(sql)
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

    const row = this.database
      .prepare(
        `
      SELECT COALESCE(${aggregate}(message_id), 0) AS id
      FROM cached_messages
      WHERE server_key = ?
        AND user_id = ?
        AND context_type = ?
        AND context_id = ?
    `,
      )
      .get(
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
