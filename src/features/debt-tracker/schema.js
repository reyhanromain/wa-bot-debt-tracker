function initSchema(db) {
  db.exec(`
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
}

module.exports = { initSchema };
