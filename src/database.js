const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', 'data', 'tracker.db');

/**
 * Initialize database and create tables if they don't exist.
 * Returns the database instance.
 */
function initDatabase() {
  // Ensure data directory exists
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS groups (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_group_id TEXT    NOT NULL UNIQUE,
      name        TEXT,
      created_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      wa_user_id   TEXT    NOT NULL UNIQUE,
      display_name TEXT    NOT NULL,
      created_at   TEXT    NOT NULL,
      updated_at   TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS debts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id    INTEGER NOT NULL REFERENCES groups(id),
      debtor_id   INTEGER NOT NULL REFERENCES users(id),
      creditor_id INTEGER NOT NULL REFERENCES users(id),
      amount      INTEGER NOT NULL CHECK(amount > 0),
      description TEXT,
      status      TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'cancelled')),
      created_at  TEXT    NOT NULL,
      updated_at  TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      group_id    INTEGER NOT NULL REFERENCES groups(id),
      payer_id    INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      amount      INTEGER NOT NULL CHECK(amount > 0),
      description TEXT,
      created_at  TEXT    NOT NULL
    );
  `);

  return db;
}

module.exports = { initDatabase, DB_PATH };
