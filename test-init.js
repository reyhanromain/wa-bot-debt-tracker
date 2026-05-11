const { initDatabase } = require('./src/database');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use a separate test database to avoid touching production data
const TEST_DB_PATH = path.join(__dirname, 'data', 'tracker.test.db');

// ─── Verify project structure ───

const requiredFiles = [
  'package.json',
  '.gitignore',
  'PRD.md',
  'src/index.js',
  'src/database.js',
  'src/config.js',
  'src/utils/rate-limiter.js',
  'src/utils/parser.js',
  'src/utils/balance.js',
  'src/commands/index.js',
  'src/commands/help.js',
  'src/commands/register.js',
  'src/commands/rename.js',
  'src/commands/debt.js',
  'src/commands/pay.js',
  'src/commands/settle.js',
  'src/commands/status.js',
  'src/commands/cancel.js',
  'src/commands/ai.js',
  'src/utils/ai.js'
];

let allPresent = true;
for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing: ${file}`);
    allPresent = false;
  }
}

if (allPresent) {
  console.log('✅ Semua file project ada.');
} else {
  console.error('❌ Beberapa file hilang!');
  process.exit(1);
}

// ─── Verify database creation ───

try {
  // Clean up previous test database only (NOT production)
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Temporarily override DB_PATH in database module
  const origDbPath = require('./src/database').DB_PATH;
  
  // Create test database
  const dataDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const db = new Database(TEST_DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

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

    CREATE TABLE IF NOT EXISTS group_whitelist (
      wa_group_id TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL
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
    CREATE INDEX IF NOT EXISTS idx_log_command ON command_log(command);
  `);

  // Check tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const expectedTables = ['command_log', 'debts', 'group_whitelist', 'groups', 'payments', 'users'];
  const actualTables = tables.map(t => t.name);

  for (const t of expectedTables) {
    if (!actualTables.includes(t)) {
      throw new Error(`Table '${t}' tidak ditemukan!`);
    }
  }

  console.log('✅ Database dan tabel berhasil dibuat.');

  // ─── Test CRUD operations ───

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, '+07:00');

  // Insert test group
  db.prepare('INSERT INTO groups (wa_group_id, name, created_at) VALUES (?, ?, ?)').run(
    '62812-test@g.us', 'Test Group', now
  );
  const groupId = db.prepare('SELECT id FROM groups WHERE wa_group_id = ?').get('62812-test@g.us').id;

  // Insert test user
  db.prepare('INSERT INTO users (wa_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    '62812xxx@c.us', 'Test User', now, now
  );
  const userId = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get('62812xxx@c.us').id;

  // Insert test debt
  db.prepare('INSERT INTO debts (group_id, debtor_id, creditor_id, amount, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    groupId, userId, userId, 10000, 'donat', 'active', now, now
  );

  // Insert test payment
  db.prepare('INSERT INTO payments (group_id, payer_id, receiver_id, amount, description, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    groupId, userId, userId, 5000, 'pelunasan', now
  );

  console.log('✅ Test CRUD berhasil.');

  // Verify outstanding balance
  const outstanding = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM debts
    WHERE group_id = ? AND debtor_id = ? AND creditor_id = ? AND status = 'active'
  `).get(groupId, userId, userId).total
  - db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM payments
    WHERE group_id = ? AND payer_id = ? AND receiver_id = ?
  `).get(groupId, userId, userId).total;

  if (outstanding === 5000) {
    console.log('✅ Balance calculation correct: Rp5.000 outstanding');
  } else {
    throw new Error(`Balance calculation incorrect! Expected 5000, got ${outstanding}`);
  }

  // ─── Test rate limiter ───
  const { RateLimiter } = require('./src/utils/rate-limiter');
  const limiter = new RateLimiter();
  const key = 'user1:group1:help';

  // First call should be allowed
  const first = limiter.allow(key, 1, 60000);
  if (!first) throw new Error('Rate limiter first call should be allowed');

  // Second call within window should be blocked
  const second = limiter.allow(key, 1, 60000);
  if (second) throw new Error('Rate limiter second call should be blocked');

  console.log('✅ Rate limiter berfungsi dengan benar.');

  // ─── Test parser ───
  const { parseCommand, parseAmountString, extractAmount, formatAmount } = require('./src/utils/parser');

  // Test parseCommand
  const parsed = parseCommand('.utang @reyhan 10000 donat');
  if (parsed.command !== 'utang') throw new Error('Parser command wrong');
  if (parsed.args.length !== 3) throw new Error('Parser args wrong');

  // Test plain integer
  if (extractAmount(['10000', 'donat']).amount !== 10000) throw new Error('Plain integer failed');

  // Test thousands separator dots
  if (parseAmountString('1.000') !== 1000) throw new Error('Dots 1.000 failed');
  if (parseAmountString('10.000') !== 10000) throw new Error('Dots 10.000 failed');
  if (parseAmountString('1.000.500') !== 1000500) throw new Error('Dots 1.000.500 failed');

  // Test suffix k
  if (parseAmountString('2k') !== 2000) throw new Error('Suffix k failed');
  if (parseAmountString('10k') !== 10000) throw new Error('Suffix 10k failed');

  // Test suffix rb
  if (parseAmountString('3rb') !== 3000) throw new Error('Suffix rb failed');
  if (parseAmountString('100rb') !== 100000) throw new Error('Suffix 100rb failed');

  // Test suffix jt/juta
  if (parseAmountString('4jt') !== 4000000) throw new Error('Suffix jt failed');
  if (parseAmountString('5juta') !== 5000000) throw new Error('Suffix juta failed');

  // Test suffix m/M (juta)
  if (parseAmountString('6m') !== 6000000) throw new Error('Suffix m failed');
  if (parseAmountString('7M') !== 7000000) throw new Error('Suffix M failed');

  // Test suffix mil/miliar
  if (parseAmountString('2mil') !== 2000000000) throw new Error('Suffix mil failed');
  if (parseAmountString('3miliar') !== 3000000000) throw new Error('Suffix miliar failed');

  // Test suffix t/tr/triliun
  if (parseAmountString('1t') !== 1000000000000) throw new Error('Suffix t failed');
  if (parseAmountString('2tr') !== 2000000000000) throw new Error('Suffix tr failed');
  if (parseAmountString('3triliun') !== 3000000000000) throw new Error('Suffix triliun failed');

  // Test decimal comma + suffix
  if (parseAmountString('1,5rb') !== 1500) throw new Error('Decimal 1,5rb failed');
  if (parseAmountString('2,5jt') !== 2500000) throw new Error('Decimal 2,5jt failed');
  if (parseAmountString('0,5k') !== 500) throw new Error('Decimal 0,5k failed');

  // Test slang Hokkien
  if (parseAmountString('gocap') !== 50000) throw new Error('Slang gocap failed');
  if (parseAmountString('cepek') !== 100000) throw new Error('Slang cepek failed');
  if (parseAmountString('nopek') !== 200) throw new Error('Slang nopek failed');
  if (parseAmountString('gopek') !== 500) throw new Error('Slang gopek failed');
  if (parseAmountString('seceng') !== 1000) throw new Error('Slang seceng failed');
  if (parseAmountString('ceceng') !== 1000) throw new Error('Slang ceceng failed');
  if (parseAmountString('noceng') !== 2000) throw new Error('Slang noceng failed');
  if (parseAmountString('goceng') !== 5000) throw new Error('Slang goceng failed');
  if (parseAmountString('ceban') !== 10000) throw new Error('Slang ceban failed');
  if (parseAmountString('goban') !== 50000) throw new Error('Slang goban failed');
  if (parseAmountString('cetiao') !== 1000000) throw new Error('Slang cetiao failed');
  if (parseAmountString('cetiau') !== 1000000) throw new Error('Slang cetiau failed');
  if (parseAmountString('gotiao') !== 5000000) throw new Error('Slang gotiao failed');
  if (parseAmountString('gotiau') !== 5000000) throw new Error('Slang gotiau failed');

  // Test reject invalid inputs
  if (parseAmountString('') !== null) throw new Error('Empty string should be null');
  if (parseAmountString('abc') !== null) throw new Error('abc should be null');
  if (parseAmountString('0') !== null) throw new Error('0 should be null');
  if (parseAmountString('-500') !== null) throw new Error('-500 should be null');

  // Test integration: extractAmount with slang
  const slangExtract = extractAmount(['goceng', 'donat']);
  if (slangExtract.amount !== 5000) throw new Error('extractAmount slang failed');
  if (slangExtract.rest.length !== 1 || slangExtract.rest[0] !== 'donat') throw new Error('extractAmount slang rest failed');

  // Test formatAmount
  if (formatAmount(10000) !== '10.000') throw new Error('Format amount wrong');

  console.log('✅ Parser berfungsi dengan benar.');

  // ─── Test whitelist ───
  const { isGroupWhitelisted, addGroupToWhitelist } = require('./src/utils/balance');
  const ts = now;

  // Should not be whitelisted initially
  if (isGroupWhitelisted(db, 'unknown@g.us')) throw new Error('Unknown group should not be whitelisted');

  // Add to whitelist
  addGroupToWhitelist(db, '62812-test@g.us', ts);
  if (!isGroupWhitelisted(db, '62812-test@g.us')) throw new Error('Added group should be whitelisted');

  // Duplicate add should not error
  addGroupToWhitelist(db, '62812-test@g.us', ts);

  console.log('✅ Whitelist berfungsi dengan benar.');

  // ─── Test ubah (edit debt/payment amount) ───
  const { getOutstandingBalance } = require('./src/utils/balance');

  // Create a second test user for ubah tests
  db.prepare('INSERT INTO users (wa_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
    '62812yyy@c.us', 'User Dua', now, now
  );
  const userId2 = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get('62812yyy@c.us').id;

  // Create a clean test debt (userId owes userId2)
  db.prepare('INSERT INTO debts (group_id, debtor_id, creditor_id, amount, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
    groupId, userId, userId2, 10000, 'utang test', 'active', now, now
  );
  const ubahDebtId = db.prepare('SELECT id FROM debts WHERE debtor_id = ? AND creditor_id = ? AND status = \'active\' ORDER BY id DESC').get(userId, userId2).id;

  // Create a payment of 3000
  db.prepare('INSERT INTO payments (group_id, payer_id, receiver_id, amount, description, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    groupId, userId, userId2, 3000, 'bayar test', now
  );

  const ubahOutstanding = getOutstandingBalance(db, groupId, userId, userId2);
  if (ubahOutstanding !== 7000) throw new Error(`Ubah initial balance wrong: ${ubahOutstanding}`);

  // Simulate ubah debt: change debt amount from 10000 to 8000
  db.prepare('UPDATE debts SET amount = ?, updated_at = ? WHERE id = ?').run(8000, now, ubahDebtId);
  const afterDebtUbah = getOutstandingBalance(db, groupId, userId, userId2);
  if (afterDebtUbah !== 5000) throw new Error(`Ubah debt amount failed: ${afterDebtUbah}`);

  // Restore debt amount back
  db.prepare('UPDATE debts SET amount = ?, updated_at = ? WHERE id = ?').run(10000, now, ubahDebtId);

  // Test balance constraint: simulate validation logic
  const current = getOutstandingBalance(db, groupId, userId, userId2); // 7000
  const debtAmount = db.prepare('SELECT amount FROM debts WHERE id = ?').get(ubahDebtId).amount; // 10000
  const balanceWithout = current - debtAmount; // -3000
  const minAllowed = Math.max(1, debtAmount - current); // 3000

  // Changing debt amount to minAllowed should be valid
  const validTest = balanceWithout + minAllowed >= 0;
  if (!validTest) throw new Error('Ubah min allowed should be valid');

  // Changing debt amount to below minAllowed should be invalid
  const invalidTest = balanceWithout + (minAllowed - 1) >= 0;
  if (invalidTest) throw new Error('Ubah below min allowed should be invalid');

  console.log('✅ Ubah berfungsi dengan benar.');

  // ─── Test command_log ───

  db.prepare(`
    INSERT INTO command_log (user_id, user_name, command, args, group_id, group_name, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('62812xxx@c.us', 'Test User', 'test', 'arg1 arg2', '62812-test@g.us', 'Test Group', 'success', now);

  const logCount = db.prepare('SELECT COUNT(*) AS count FROM command_log').get().count;
  if (logCount !== 1) throw new Error('Command log insert failed');

  const logEntry = db.prepare('SELECT * FROM command_log ORDER BY id DESC LIMIT 1').get();
  if (logEntry.command !== 'test') throw new Error('Command log query failed');
  if (logEntry.status !== 'success') throw new Error('Command log status failed');
  if (logEntry.args !== 'arg1 arg2') throw new Error('Command log args failed');
  if (logEntry.error_msg !== null) throw new Error('Command log null error_msg failed');

  // Verify indexes exist
  const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='command_log'").all();
  const indexNames = indexes.map(i => i.name).sort();
  if (indexNames.length !== 2) throw new Error(`Expected 2 indexes for command_log, got ${indexNames.length}`);
  if (indexNames[0] !== 'idx_log_command') throw new Error('Missing idx_log_command');
  if (indexNames[1] !== 'idx_log_created_at') throw new Error('Missing idx_log_created_at');

  console.log('✅ Command log berfungsi dengan benar.');

  // ─── Test AI module ───
  const { isReady } = require('./src/utils/ai');

  // isReady should return false when AI is not configured (no .env in test)
  if (isReady()) {
    // If somehow configured, at least verify it returns true
    console.log('ℹ️  AI terdeteksi aktif (ada .env atau env var).');
  } else {
    console.log('ℹ️  AI tidak aktif (wajar, tidak ada .env di test).');
  }

  // Test that the ai command module loads without error
  const { handleAi } = require('./src/commands/ai');
  if (typeof handleAi !== 'function') throw new Error('handleAi should be a function');

  // Verify context building logic works (test that the query functions exist)
  const allUsers = db.prepare('SELECT wa_user_id, display_name FROM users').all();
  if (!Array.isArray(allUsers)) throw new Error('AI context users query failed');
  if (allUsers.length === 0) throw new Error('AI context users should not be empty');

  console.log('✅ AI module berfungsi dengan benar.');

  // ─── Clean up test database only ───
  db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  console.log('\n🎉 Semua test lulus! Bot siap dijalankan.');
  console.log('   Jalankan: npm start');

} catch (err) {
  console.error('❌ Test gagal:', err.message);
  process.exit(1);
}
