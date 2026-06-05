const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use a separate test database to avoid touching production data
const TEST_DB_PATH = path.join(__dirname, 'data', 'tracker.test.db');

// Verify project structure
const requiredFiles = [
  'package.json',
  '.gitignore',
  'PRD.md',
  'src/index.js',
  'src/core/db.js',
  'src/core/feature-loader.js',
  'src/core/rate-limiter.js',
  'src/core/router.js',
  'src/core/scheduler.js',
  'src/core/logger.js',
  'src/config.js',
  'src/shared/parser.js',
  'src/utils/ai.js',
  'src/commands/assist.js',
  'src/features/debt-tracker/index.js',
  'src/features/debt-tracker/schema.js',
  'src/features/debt-tracker/utils.js',
  'src/features/debt-tracker/commands/ai.js',
  'src/features/debt-tracker/commands/help.js',
  'src/features/debt-tracker/commands/pay_for.js',
  'src/features/yt-subs-reminder/index.js',
  'src/features/yt-subs-reminder/schema.js',
];

let allPresent = true;
for (const file of requiredFiles) {
  const fullPath = path.join(__dirname, file);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing: ${file}`);
    allPresent = false;
  }
}

if (!allPresent) {
  console.error('❌ Beberapa file hilang!');
  process.exit(1);
}
console.log('✅ Semua file project ada.');

try {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

  const dataDir = path.dirname(TEST_DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

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
    CREATE INDEX IF NOT EXISTS idx_log_command ON command_log(command);
  `);

  require('./src/features/debt-tracker/schema').initSchema(db);
  require('./src/features/yt-subs-reminder/schema').initSchema(db);

  const expectedTables = [
    'command_log',
    'debts',
    'group_features',
    'groups',
    'payments',
    'scheduled_runs',
    'users',
    'yt_members',
    'yt_transactions',
  ];
  const actualTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
  for (const table of expectedTables) {
    if (!actualTables.includes(table)) throw new Error(`Table '${table}' tidak ditemukan!`);
  }
  console.log('✅ Database dan tabel berhasil dibuat.');

  const now = new Date().toISOString().replace(/\.\d{3}Z$/, '+07:00');
  db.prepare('INSERT INTO groups (wa_group_id, name, created_at) VALUES (?, ?, ?)').run('62812-test@g.us', 'Test Group', now);
  const groupId = db.prepare('SELECT id FROM groups WHERE wa_group_id = ?').get('62812-test@g.us').id;

  db.prepare('INSERT INTO users (wa_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('62812xxx@c.us', 'Test User', now, now);
  const userId = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get('62812xxx@c.us').id;

  db.prepare('INSERT INTO debts (group_id, debtor_id, creditor_id, amount, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(groupId, userId, userId, 10000, 'donat', 'active', now, now);
  db.prepare('INSERT INTO payments (group_id, payer_id, receiver_id, amount, description, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(groupId, userId, userId, 5000, 'pelunasan', now);
  console.log('✅ Test CRUD berhasil.');

  const outstanding = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM debts
    WHERE group_id = ? AND debtor_id = ? AND creditor_id = ? AND status = 'active'
  `).get(groupId, userId, userId).total - db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM payments
    WHERE group_id = ? AND payer_id = ? AND receiver_id = ?
  `).get(groupId, userId, userId).total;
  if (outstanding !== 5000) throw new Error(`Balance calculation incorrect! Expected 5000, got ${outstanding}`);
  console.log('✅ Balance calculation correct: Rp5.000 outstanding');

  const { RateLimiter } = require('./src/core/rate-limiter');
  const limiter = new RateLimiter();
  const key = 'user1:group1:help';
  if (!limiter.allow(key, 1, 60000)) throw new Error('Rate limiter first call should be allowed');
  if (limiter.allow(key, 1, 60000)) throw new Error('Rate limiter second call should be blocked');
  console.log('✅ Rate limiter berfungsi dengan benar.');

  const { parseCommand, parseAmountString, extractAmount, formatAmount } = require('./src/shared/parser');
  const parsed = parseCommand('.utang @reyhan 10000 donat');
  if (parsed.command !== 'utang') throw new Error('Parser command wrong');
  if (parsed.args.length !== 3) throw new Error('Parser args wrong');
  if (extractAmount(['10000', 'donat']).amount !== 10000) throw new Error('Plain integer failed');

  const amountCases = [
    ['1.000', 1000], ['10.000', 10000], ['1.000.500', 1000500],
    ['2k', 2000], ['10k', 10000], ['3rb', 3000], ['100rb', 100000],
    ['4jt', 4000000], ['5juta', 5000000], ['6m', 6000000], ['7M', 7000000],
    ['2mil', 2000000000], ['3miliar', 3000000000],
    ['1t', 1000000000000], ['2tr', 2000000000000], ['3triliun', 3000000000000],
    ['1,5rb', 1500], ['2,5jt', 2500000], ['0,5k', 500],
    ['gocap', 50000], ['cepek', 100000], ['nopek', 200], ['gopek', 500],
    ['seceng', 1000], ['ceceng', 1000], ['noceng', 2000], ['goceng', 5000],
    ['ceban', 10000], ['goban', 50000], ['cetiao', 1000000], ['cetiau', 1000000],
    ['gotiao', 5000000], ['gotiau', 5000000],
  ];
  for (const [input, expected] of amountCases) {
    const actual = parseAmountString(input);
    if (actual !== expected) throw new Error(`Amount parser failed for ${input}: expected ${expected}, got ${actual}`);
  }
  for (const input of ['', 'abc', '0', '-500']) {
    if (parseAmountString(input) !== null) throw new Error(`${input} should be null`);
  }
  const slangExtract = extractAmount(['goceng', 'donat']);
  if (slangExtract.amount !== 5000) throw new Error('extractAmount slang failed');
  if (slangExtract.rest.length !== 1 || slangExtract.rest[0] !== 'donat') throw new Error('extractAmount slang rest failed');
  if (formatAmount(10000) !== '10.000') throw new Error('Format amount wrong');
  console.log('✅ Parser berfungsi dengan benar.');

  db.prepare('INSERT INTO group_features (wa_group_id, feature_name, assigned_at) VALUES (?, ?, ?)').run('62812-test@g.us', 'debt-tracker', now);
  const feature = db.prepare('SELECT feature_name FROM group_features WHERE wa_group_id = ?').get('62812-test@g.us');
  if (!feature || feature.feature_name !== 'debt-tracker') throw new Error('group_features assignment failed');
  console.log('✅ Feature assignment berfungsi dengan benar.');

  const { getOutstandingBalance } = require('./src/features/debt-tracker/utils');
  db.prepare('INSERT INTO users (wa_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('62812yyy@c.us', 'User Dua', now, now);
  const userId2 = db.prepare('SELECT id FROM users WHERE wa_user_id = ?').get('62812yyy@c.us').id;
  db.prepare('INSERT INTO debts (group_id, debtor_id, creditor_id, amount, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(groupId, userId, userId2, 10000, 'utang test', 'active', now, now);
  const ubahDebtId = db.prepare("SELECT id FROM debts WHERE debtor_id = ? AND creditor_id = ? AND status = 'active' ORDER BY id DESC").get(userId, userId2).id;
  db.prepare('INSERT INTO payments (group_id, payer_id, receiver_id, amount, description, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(groupId, userId, userId2, 3000, 'bayar test', now);
  if (getOutstandingBalance(db, groupId, userId, userId2) !== 7000) throw new Error('Ubah initial balance wrong');
  db.prepare('UPDATE debts SET amount = ?, updated_at = ? WHERE id = ?').run(8000, now, ubahDebtId);
  if (getOutstandingBalance(db, groupId, userId, userId2) !== 5000) throw new Error('Ubah debt amount failed');
  console.log('✅ Ubah berfungsi dengan benar.');

  db.prepare(`
    INSERT INTO command_log (user_id, user_name, command, args, group_id, group_name, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run('62812xxx@c.us', 'Test User', 'test', 'arg1 arg2', '62812-test@g.us', 'Test Group', 'success', now);
  const logEntry = db.prepare('SELECT * FROM command_log ORDER BY id DESC LIMIT 1').get();
  if (logEntry.command !== 'test') throw new Error('Command log query failed');
  if (logEntry.status !== 'success') throw new Error('Command log status failed');
  if (logEntry.args !== 'arg1 arg2') throw new Error('Command log args failed');
  if (logEntry.error_msg !== null) throw new Error('Command log null error_msg failed');
  const indexNames = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='command_log'").all().map(i => i.name).sort();
  if (!indexNames.includes('idx_log_command')) throw new Error('Missing idx_log_command');
  if (!indexNames.includes('idx_log_created_at')) throw new Error('Missing idx_log_created_at');
  console.log('✅ Command log berfungsi dengan benar.');

  const { isReady } = require('./src/utils/ai');
  if (typeof isReady !== 'function') throw new Error('isReady should be a function');
  const { handleAi } = require('./src/features/debt-tracker/commands/ai');
  if (typeof handleAi !== 'function') throw new Error('handleAi should be a function');
  const debtFeature = require('./src/features/debt-tracker');
  if (!debtFeature.commands || typeof debtFeature.commands.help.handler !== 'function') throw new Error('debt feature commands should load');
  if (process.env.AI_ENABLED === 'true' && process.env.AI_API_URL && !debtFeature.commands.ai) {
    throw new Error('AI command should be registered when AI is enabled');
  }
  console.log('✅ AI module berfungsi dengan benar.');

  const { handlePayFor, handleSettleFor } = require('./src/features/debt-tracker/commands/pay_for');
  if (typeof handlePayFor !== 'function') throw new Error('handlePayFor should be a function');
  if (typeof handleSettleFor !== 'function') throw new Error('handleSettleFor should be a function');

  db.prepare('INSERT INTO users (wa_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('62812zzz@c.us', 'Zara', now, now);
  db.prepare('INSERT INTO users (wa_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('62812xxx2@c.us', 'Andi', now, now);
  db.prepare('INSERT INTO users (wa_user_id, display_name, created_at, updated_at) VALUES (?, ?, ?, ?)').run('62812yyy2@c.us', 'Budi', now, now);

  const senderZ = db.prepare('SELECT id, display_name FROM users WHERE wa_user_id = ?').get('62812zzz@c.us');
  const debtorX = db.prepare('SELECT id, display_name FROM users WHERE wa_user_id = ?').get('62812xxx2@c.us');
  const receiverY = db.prepare('SELECT id, display_name FROM users WHERE wa_user_id = ?').get('62812yyy2@c.us');

  db.prepare('INSERT INTO debts (group_id, debtor_id, creditor_id, amount, description, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(groupId, debtorX.id, receiverY.id, 50000, 'utang awal', 'active', now, now);

  const paymentCount = () => db.prepare('SELECT COUNT(*) AS total FROM payments WHERE group_id = ? AND payer_id = ? AND receiver_id = ?').get(groupId, debtorX.id, receiverY.id).total;
  const currentOutstanding = () => getOutstandingBalance(db, groupId, debtorX.id, receiverY.id);
  const makeMsg = (mentionedIds, mentions) => {
    const replies = [];
    return {
      mentionedIds,
      mentions,
      replies,
      reply(text) {
        replies.push(text);
      },
    };
  };

  let msg = makeMsg(['62812xxx2@c.us', '62812yyy2@c.us'], [{ pushname: 'Andi' }, { pushname: 'Budi' }]);
  handlePayFor(msg, ['@Andi', 'ke', '@Budi', '20rb', 'titip', 'bayar'], db, senderZ, groupId);
  if (paymentCount() !== 1) throw new Error('Bayarin happy path should insert one payment');
  const paymentRow = db.prepare('SELECT * FROM payments WHERE group_id = ? AND payer_id = ? AND receiver_id = ? ORDER BY id DESC LIMIT 1').get(groupId, debtorX.id, receiverY.id);
  if (paymentRow.payer_id !== debtorX.id) throw new Error('Bayarin payer_id should be debtorX.id');
  if (paymentRow.receiver_id !== receiverY.id) throw new Error('Bayarin receiver_id should be receiverY.id');
  if (paymentRow.amount !== 20000) throw new Error('Bayarin amount should be 20000');
  if (!paymentRow.description.includes('titip bayar')) throw new Error('Bayarin description should include titip bayar');
  if (!paymentRow.description.includes('Zara')) throw new Error('Bayarin description should include Zara');
  if (currentOutstanding() !== 30000) throw new Error('Bayarin outstanding should become 30000');
  if (!msg.replies[0].includes('#P')) throw new Error('Bayarin reply should include #P');
  if (!msg.replies[0].includes('Andi')) throw new Error('Bayarin reply should include Andi');
  if (!msg.replies[0].includes('Budi')) throw new Error('Bayarin reply should include Budi');
  if (!msg.replies[0].includes('Zara')) throw new Error('Bayarin reply should include Zara');
  if (!msg.replies[0].includes('Rp20.000')) throw new Error('Bayarin reply should include Rp20.000');

  msg = makeMsg(['62812xxx2@c.us', '62812yyy2@c.us'], [{ pushname: 'Andi' }, { pushname: 'Budi' }]);
  handlePayFor(msg, ['@Andi', '20rb', '@Budi'], db, senderZ, groupId);
  if (paymentCount() !== 1) throw new Error('Missing ke should not insert payment');
  if (!msg.replies[0].includes('Format tidak valid')) throw new Error('Missing ke should reply format invalid');

  msg = makeMsg(['62812xxx2@c.us'], [{ pushname: 'Andi' }]);
  handlePayFor(msg, ['@Andi', 'ke', '@Budi', '20rb'], db, senderZ, groupId);
  if (paymentCount() !== 1) throw new Error('Missing mentions should not insert payment');
  if (!msg.replies[0].includes('Gunakan: .bayarin')) throw new Error('Missing mentions should reply usage');

  msg = makeMsg(['62812xxx2@c.us', '62812yyy2@c.us'], [{ pushname: 'Andi' }, { pushname: 'Budi' }]);
  handlePayFor(msg, ['@Andi', 'ke', '@Budi', '100rb'], db, senderZ, groupId);
  if (paymentCount() !== 1) throw new Error('Overpay should not insert payment');
  if (!msg.replies[0].includes('melebihi sisa utang')) throw new Error('Overpay should be rejected');

  msg = makeMsg(['62812xxx2@c.us', '62812xxx2@c.us'], [{ pushname: 'Andi' }, { pushname: 'Andi' }]);
  handlePayFor(msg, ['@Andi', 'ke', '@Andi', '10rb'], db, senderZ, groupId);
  if (paymentCount() !== 1) throw new Error('Duplicate mentions should not insert payment');
  if (!msg.replies[0].includes('tidak boleh sama')) throw new Error('Duplicate mentions should be rejected');

  msg = makeMsg(['62812xxx2@c.us', '62812yyy2@c.us'], [{ pushname: 'Andi' }, { pushname: 'Budi' }]);
  handleSettleFor(msg, ['@Andi', 'ke', '@Budi', 'lunas'], db, senderZ, groupId);
  if (paymentCount() !== 2) throw new Error('Lunasin happy path should insert second payment');
  const settleRow = db.prepare('SELECT * FROM payments WHERE group_id = ? AND payer_id = ? AND receiver_id = ? ORDER BY id DESC LIMIT 1').get(groupId, debtorX.id, receiverY.id);
  if (settleRow.amount !== 30000) throw new Error('Lunasin amount should settle remaining 30000');
  if (currentOutstanding() !== 0) throw new Error('Lunasin outstanding should become 0');
  if (!msg.replies[0].includes('lunas')) throw new Error('Lunasin reply should include lunas');
  if (!msg.replies[0].includes('Andi')) throw new Error('Lunasin reply should include Andi');
  if (!msg.replies[0].includes('Budi')) throw new Error('Lunasin reply should include Budi');
  if (!msg.replies[0].includes('Zara')) throw new Error('Lunasin reply should include Zara');

  msg = makeMsg(['62812xxx2@c.us', '62812yyy2@c.us'], [{ pushname: 'Andi' }, { pushname: 'Budi' }]);
  handleSettleFor(msg, ['@Andi', 'ke', '@Budi', '10rb'], db, senderZ, groupId);
  if (paymentCount() !== 2) throw new Error('Lunasin nominal rejection should not insert payment');
  if (!msg.replies[0].includes('.lunasin tidak menerima nominal')) throw new Error('Lunasin nominal rejection should mention nominal restriction');

  console.log('✅ Bayarin/Lunasin command tests passed.');

  db.close();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);

  console.log('\n🎉 Semua test lulus! Bot siap dijalankan.');
  console.log('   Jalankan: npm start');
} catch (err) {
  console.error('❌ Test gagal:', err.message);
  try {
    if (global.db && global.db.open) global.db.close();
  } catch (_) {}
  process.exit(1);
}
