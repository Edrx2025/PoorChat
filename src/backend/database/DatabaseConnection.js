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
