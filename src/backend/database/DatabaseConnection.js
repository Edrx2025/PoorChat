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
    this.connection.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_reply ON messages(reply_to_id);
      CREATE INDEX IF NOT EXISTS idx_messages_pinned_chat ON messages(chat_id, is_pinned);
      CREATE INDEX IF NOT EXISTS idx_messages_pinned_group ON messages(group_id, is_pinned);
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
    ];

    for (const [name, definition] of additions) {
      if (!columns.has(name)) {
        this.connection.exec(
          `ALTER TABLE messages ADD COLUMN ${name} ${definition};`,
        );
      }
    }
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
