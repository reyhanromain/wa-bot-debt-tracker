function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS yt_members (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      display_name TEXT NOT NULL UNIQUE,
      wa_user_id   TEXT,
      balance      INTEGER NOT NULL DEFAULT 0,
      active       INTEGER NOT NULL DEFAULT 1,
      created_at   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS yt_transactions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id     INTEGER NOT NULL REFERENCES yt_members(id),
      type          TEXT NOT NULL CHECK(type IN ('topup', 'deduction', 'adjustment')),
      amount        INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      description   TEXT,
      created_at    TEXT NOT NULL
    );
  `);

  // Seed only if yt_members is empty
  const count = db.prepare('SELECT COUNT(*) AS c FROM yt_members').get().c;
  if (count > 0) return;

  // Insert members with current saldo from PDF (as of 18-May-2026)
  const members = [
    { name: 'massup', balance: 93000 },
    { name: 'reyhan', balance: 989579999 },
    { name: 'iqbal', balance: 31000 },
    { name: 'doi', balance: 31000 },
    { name: 'fernando', balance: 0 },
  ];

  const insertMember = db.prepare('INSERT INTO yt_members (display_name, balance, active, created_at) VALUES (?, ?, 1, ?)');
  for (const m of members) {
    const createdAt = m.name === 'fernando' ? '2025-08-14T09:00:00.000+07:00' : '2021-11-08T00:00:00.000+07:00';
    insertMember.run(m.name, m.balance, createdAt);
  }

  // Seed full transaction history from PDF
  // Column order: massup, reyhan, iqbal, doi, fernando(from Aug-2025)
  // We work backwards from current saldo to compute balance_after for each transaction
  // Instead, we insert transactions and trust current balance as final state.
  const memberIds = {};
  for (const row of db.prepare('SELECT id, display_name FROM yt_members').all()) {
    memberIds[row.display_name] = row.id;
  }

  // Full transaction history extracted from PDF
  // Format: [date, massup, reyhan, iqbal, doi, fernando?]
  // Negative = deduction (billing), Positive = topup
  const history = [
    ['2021-11-08', 20000, 19600, 20000, 20000],
    ['2021-11-13', -19600, -19600, -19600, -19600],
    ['2021-12-11', 100000, 19600, 40000, 40000],
    ['2021-12-13', -19600, -19600, -19600, -19600],
    ['2022-01-11', 0, 19600, 0, 0],
    ['2022-01-13', -19600, -19600, -19600, -19600],
    ['2022-01-20', 0, 0, 0, 0],
    ['2022-02-12', 0, 19600, 60000, 60000],
    ['2022-02-13', -19600, -19600, -19600, -19600],
    ['2022-03-12', 0, 19600, 0, 0],
    ['2022-03-13', -19600, -19600, -19600, -19600],
    ['2022-04-14', 0, 19600, 0, 0],
    ['2022-04-14b', -19600, -19600, -19600, -19600],
    ['2022-04-16', 0, 0, 0, 0],
    ['2022-05-13', 0, 19600, 0, 0],
    ['2022-05-14', -19600, -19600, -19600, -19600],
    ['2022-05-14b', 160000, 0, 60000, 60000],
    ['2022-05-15', 0, 0, 0, 0],
    ['2022-06-14', 0, 19600, 0, 0],
    ['2022-06-14b', -19600, -19600, -19600, -19600],
    ['2022-07-14', 0, 19600, 0, 0],
    ['2022-07-14b', -19600, -19600, -19600, -19600],
    ['2022-07-17', 0, 0, 0, 0],
    ['2022-08-14', -19600, -19600, -19600, -19600],
    ['2022-08-14b', 0, 19600, 60000, 60000],
    ['2022-09-14', -19600, -19600, -19600, -19600],
    ['2022-09-14b', 0, 19600, 0, 0],
    ['2022-10-14', -19600, -19600, -19600, -19600],
    ['2022-10-14b', 0, 19600, 0, 0],
    ['2022-10-15', 0, 0, 0, 0],
    ['2022-11-14', -19600, -19600, -19600, -19600],
    ['2022-11-14b', 0, 19600, 0, 0],
    ['2022-11-15', 0, 0, 20000, 20000],
    ['2022-12-14', -22000, -22000, -22000, -22000],
    ['2022-12-14b', 220000, 22000, 66000, 66000],
    ['2023-01-14', -22000, -22000, -22000, -22000],
    ['2023-01-14b', 0, 99999999, 0, 0],
    ['2023-02-14', -22000, -22000, -22000, -22000],
    ['2023-02-22', 0, 0, 0, 0],
    ['2023-03-14', -22000, -22000, -22000, -22000],
    ['2023-04-05', 0, 0, 66000, 66000],
    ['2023-04-14', -22000, -22000, -22000, -22000],
    ['2023-05-14', -22000, -22000, -22000, -22000],
    ['2023-06-14', -22000, -22000, -22000, -22000],
    ['2023-06-17', 0, 0, 22000, 22000],
    ['2023-07-05', 0, 0, 66000, 66000],
    ['2023-07-14', -22000, -22000, -22000, -22000],
    ['2023-07-22', 0, 0, 0, 0],
    ['2023-08-14', -22000, -22000, -22000, -22000],
    ['2023-09-14', -22000, -22000, -22000, -22000],
    ['2023-10-14', -22000, -22000, -22000, -22000],
    ['2023-10-19', 0, 0, 44000, 44000],
    ['2023-11-14', -22000, -22000, -22000, -22000],
    ['2023-11-14b', 110000, 0, 0, 0],
    ['2023-12-14', -22000, -22000, -22000, -22000],
    ['2023-12-14b', 0, 0, 44000, 44000],
    ['2024-01-14', -22000, -22000, -22000, -22000],
    ['2024-02-14', -22000, -22000, -22000, -22000],
    ['2024-02-15', 0, 0, 44000, 44000],
    ['2024-03-14', -22000, -22000, -22000, -22000],
    ['2024-04-14', -22000, -22000, -22000, -22000],
    ['2024-04-14b', 18800, 0, 16800, 16800],
    ['2024-04-16', 0, 0, 0, 0],
    ['2024-05-14', -22000, -22000, -22000, -22000],
    ['2024-05-14b', 0, 0, 22000, 22000],
    ['2024-05-27', 22000, 0, 0, 0],
    ['2024-06-14', -22000, -22000, -22000, -22000],
    ['2024-07-01', 44000, 0, 0, 0],
    ['2024-07-05', 0, 0, 66000, 66000],
    ['2024-07-14', -22000, -22000, -22000, -22000],
    ['2024-08-14', -22000, -22000, -22000, -22000],
    ['2024-08-14b', 66000, 0, 0, 0],
    ['2024-09-14', -22000, -22000, -22000, -22000],
    ['2024-09-16', 0, 0, 44000, 44000],
    ['2024-09-21', 0, 0, 0, 0],
    ['2024-10-14', -22000, -22000, -22000, -22000],
    ['2024-11-14', -31000, -31000, -31000, -31000],
    ['2024-11-14b', 0, 0, 62000, 62000],
    ['2024-12-14', -31000, -31000, -31000, -31000],
    ['2024-12-18', 62000, 0, 0, 0],
    ['2025-01-14', -31000, -31000, -31000, -31000],
    ['2025-02-14', -31000, -31000, -31000, -31000],
    ['2025-02-14b', 0, 0, 124000, 124000],
    ['2025-03-02', 100000, 0, 0, 0],
    ['2025-03-14', -31000, -31000, -31000, -31000],
    ['2025-04-14', -31000, -31000, -31000, -31000],
    ['2025-05-14', -31000, -31000, -31000, -31000],
    ['2025-05-14b', 100000, 0, 62000, 62000],
    ['2025-06-14', -31000, -31000, -31000, -31000],
    ['2025-07-14', -31000, -31000, -31000, -31000],
    ['2025-07-25', 0, 0, 62000, 62000],
    ['2025-08-14', -31000, -62000, -31000, -31000, -31000],
    ['2025-08-16', 0, 0, 0, 0, 31000],
    ['2025-09-01', 100000, 0, 0, 0, 0],
    ['2025-09-14', -31000, -31000, -31000, -31000, -31000],
    ['2025-09-15', 0, 0, 62000, 62000, 31000],
    ['2025-10-14', -31000, -31000, -31000, -31000, -31000],
    ['2025-10-15', 103000, 0, 0, 0, 31000],
    ['2025-11-14', -31000, -31000, -31000, -31000, -31000],
    ['2025-11-14b', 0, 0, 31000, 31000, 0],
    ['2025-11-15', 0, 0, 0, 0, 31000],
    ['2025-12-05', 0, 0, 31000, 31000, 0],
    ['2025-12-14', -31000, -31000, -31000, -31000, -31000],
    ['2025-12-16', 0, 0, 0, 0, 31000],
    ['2026-01-14', -31000, -31000, -31000, -31000, -31000],
    ['2026-01-15', 0, 0, 0, 0, 31000],
    ['2026-01-16', 0, 0, 31000, 31000, 0],
    ['2026-02-14', -31000, -31000, -31000, -31000, -31000],
    ['2026-02-20', 0, 0, 31000, 31000, 31000],
    ['2026-03-02', 155000, 0, 0, 0, 0],
    ['2026-03-14', -31000, -31000, -31000, -31000, -31000],
    ['2026-03-19', 31000, 31000, 31000, 31000, 31000],
    ['2026-04-05', 0, 0, 62000, 62000, 0],
    ['2026-04-14', -31000, -31000, -31000, -31000, -31000],
    ['2026-04-20', 0, 0, 0, 0, 31000],
    ['2026-05-14', -31000, -31000, -31000, -31000, -31000],
  ];

  const insertTx = db.prepare(
    'INSERT INTO yt_transactions (member_id, type, amount, balance_after, description, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const memberOrder = ['massup', 'reyhan', 'iqbal', 'doi', 'fernando'];
  // We'll compute balance_after by working forward, but since we only know final balance,
  // we work backwards to find starting balance, then forward to fill balance_after.

  // First, compute net change per member from all history
  const netChange = { massup: 0, reyhan: 0, iqbal: 0, doi: 0, fernando: 0 };
  for (const row of history) {
    for (let i = 0; i < row.length - 1 && i < 5; i++) {
      netChange[memberOrder[i]] += row[i + 1];
    }
  }

  // Starting balance = current - netChange
  const startBalance = {};
  const currentBalance = { massup: 93000, reyhan: 989579999, iqbal: 31000, doi: 31000, fernando: 0 };
  for (const name of memberOrder) {
    startBalance[name] = currentBalance[name] - netChange[name];
  }

  // Now insert transactions forward, tracking running balance
  const running = { ...startBalance };

  const insertAll = db.transaction(() => {
    for (const row of history) {
      const dateRaw = row[0].replace(/b$/, ''); // remove 'b' suffix used for same-day entries
      const ts = `${dateRaw}T09:00:00.000+07:00`;

      for (let i = 0; i < row.length - 1 && i < 5; i++) {
        const amount = row[i + 1];
        if (amount === 0) continue;
        const name = memberOrder[i];
        const mid = memberIds[name];
        running[name] += amount;
        const type = amount < 0 ? 'deduction' : 'topup';
        const desc = amount < 0 ? 'billing' : 'topup';
        insertTx.run(mid, type, amount, running[name], desc, ts);
      }
    }
  });

  insertAll();
}

module.exports = { initSchema };
