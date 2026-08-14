const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'tracker.db');

/**
 * Timestamp WIB, sama format dengan nowWIB() di shared/parser.js.
 * Sengaja diduplikasi (bukan di-import) supaya db.js tidak menyeret
 * shared/parser → config, yang meng-instantiate WhatsApp Client saat load.
 * Jangan pakai toISOString() lalu ditempel "+07:00": itu jam UTC berlabel WIB.
 * @returns {string} "YYYY-MM-DDTHH:mm:ss.SSS+07:00"
 */
function nowWIB() {
  const now = new Date();
  const dateStr = now.toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const ms = String(now.getMilliseconds()).padStart(3, '0');
  return `${dateStr.replace(' ', 'T')}.${ms}+07:00`;
}

function initDatabase() {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Shared tables
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

    CREATE TABLE IF NOT EXISTS group_features (
      wa_group_id  TEXT PRIMARY KEY,
      feature_name TEXT NOT NULL,
      assigned_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduled_runs (
      job_name    TEXT PRIMARY KEY,
      last_run_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS command_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT    NOT NULL,
      user_name   TEXT,
      command     TEXT    NOT NULL,
      args        TEXT,
      group_id    TEXT    NOT NULL,
      group_name  TEXT,
      status      TEXT    NOT NULL,
      error_msg   TEXT,
      created_at  TEXT    NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_log_created_at ON command_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_log_command    ON command_log(command);
  `);

  // Migration: auto-assign existing groups to debt-tracker
  const now = nowWIB();
  db.exec(`
    INSERT OR IGNORE INTO group_features (wa_group_id, feature_name, assigned_at)
    SELECT g.wa_group_id, 'debt-tracker', '${now}'
    FROM groups g
    WHERE g.id IN (
      SELECT DISTINCT group_id FROM debts
      UNION
      SELECT DISTINCT group_id FROM payments
    );
  `);

  // Migration: also migrate from group_whitelist if it exists
  const hasWhitelist = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='group_whitelist'"
  ).get();
  if (hasWhitelist) {
    db.exec(`
      INSERT OR IGNORE INTO group_features (wa_group_id, feature_name, assigned_at)
      SELECT wa_group_id, 'debt-tracker', created_at FROM group_whitelist;
    `);
  }

  return db;
}

module.exports = { initDatabase, DB_PATH };
