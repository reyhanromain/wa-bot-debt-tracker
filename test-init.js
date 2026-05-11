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
  'src/commands/cancel.js'
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
  `);

  // Check tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
  const expectedTables = ['debts', 'groups', 'payments', 'users'];
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
