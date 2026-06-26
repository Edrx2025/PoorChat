const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const AppConfig = require("../config/AppConfig");
const { ensureDirectory } = require("../utils/fileUtils");

class DatabaseConnection {
  constructor(databasePath) {
    ensureDirectory(path.dirname(databasePath));
    this.databasePath = databasePath;
    this.connection = new DatabaseSync(databasePath);
    this.connection.exec("PRAGMA foreign_keys = ON;");
    this.connection.exec("PRAGMA journal_mode = WAL;");
  }

  initialize() {
    const migrationPath = path.join(
      __dirname,
      "migrations",
      "001_initial.sql",
    );
    const sql = fs.readFileSync(migrationPath, "utf8");
    this.connection.exec(sql);
    this.ensureMessageColumns();
    this.ensureCallHistoryStateTable();
    this.connection.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id);
      CREATE INDEX IF NOT EXISTS idx_messages_pinned_chat ON messages(chat_id, is_pinned);
      CREATE INDEX IF NOT EXISTS idx_messages_pinned_group ON messages(group_id, is_pinned);
      CREATE INDEX IF NOT EXISTS idx_call_participants_status
        ON call_participants(call_id, status);
      CREATE INDEX IF NOT EXISTS idx_call_history_states_user
        ON call_history_states(user_id, hidden);
      UPDATE group_members
      SET role = 'owner'
      WHERE user_id = (
        SELECT g.created_by
        FROM "groups" g
        WHERE g.id = group_members.group_id
      );
      UPDATE settings
      SET accent_color = '#c7db94'
      WHERE accent_color IN ('#2f8f73', '#43b993');
    `);
  }

  ensureMessageColumns() {
    const columns = new Set(
      this.connection
        .prepare("PRAGMA table_info(messages)")
        .all()
        .map((column) => column.name),
    );
    const additions = [
      ["reply_to_id", "INTEGER REFERENCES messages(id) ON DELETE SET NULL"],
      ["is_pinned", "INTEGER NOT NULL DEFAULT 0"],
      ["pinned_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL"],
      ["pinned_at", "TEXT"],
      ["deleted_at", "TEXT"],
      ["deleted_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL"],
      ["deletion_reason", "TEXT"],
    ];

    for (const [name, definition] of additions) {
      if (!columns.has(name)) {
        this.connection.exec(
          `ALTER TABLE messages ADD COLUMN ${name} ${definition};`,
        );
      }
    }
  }

  ensureCallHistoryStateTable() {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS call_history_states (
        call_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        hidden INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY(call_id, user_id),
        FOREIGN KEY(call_id) REFERENCES calls(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);
  }

  prepare(sql) {
    return this.connection.prepare(sql);
  }

  exec(sql) {
    return this.connection.exec(sql);
  }

  transaction(callback) {
    this.connection.exec("BEGIN IMMEDIATE");

    try {
      const result = callback();
      this.connection.exec("COMMIT");
      return result;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }

  close() {
    this.connection.close();
  }

  static getInstance(databasePath = AppConfig.getInstance().databasePath) {
    if (!DatabaseConnection.instance) {
      DatabaseConnection.instance = new DatabaseConnection(databasePath);
    }

    return DatabaseConnection.instance;
  }

  static resetForTests() {
    if (DatabaseConnection.instance) {
      DatabaseConnection.instance.close();
      DatabaseConnection.instance = null;
    }
  }
}

module.exports = DatabaseConnection;
