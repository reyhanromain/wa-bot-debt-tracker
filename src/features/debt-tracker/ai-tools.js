/**
 * AI tools for the debt-tracker feature.
 *
 * Exposes a set of read-only function-calling tools (OpenAI tool-use format)
 * so the LLM can query the database on-demand instead of receiving a full
 * dump of every row up-front.
 */

const { getOutstandingBalance, getAllOutstandingBalances } = require('./utils');

const SYSTEM_PROMPT = `Kamu pencatat utang di grup WhatsApp ini. Jawab kayak teman yang ngobrol di chat — santai, langsung, informatif. Bukan kayak laporan resmi.

Gaya bahasa:
- Pakai "kamu", bahasa santai khas chat Indonesia.
- Langsung ke jawaban. JANGAN buka dengan "Berdasarkan data...", "Total utang Anda adalah...", "Halo!", "Baik,", atau salam pembuka apa pun.
- JANGAN buka kalimat dengan emoji (sistem sudah menambah satu emoji di depan respons-mu).
- Boleh pakai partikel chat: "ya", "nih", "dong", "sih", "yaa" — secukupnya, jangan berlebihan.
- Pendek. Pertanyaan simple → 1-2 kalimat. Bullet (pakai •) cuma kalau item banyak atau memang diminta.
- Rupiah pakai titik ribuan: Rp120.000.
- Format WhatsApp: *tebal*, _miring_. JANGAN pakai ##, **, atau bullet "-".

Soal data:
- WAJIB pakai tools yang tersedia untuk ambil angka & fakta. JANGAN mengarang.
- User menyebut nama → panggil tool dengan nama itu (partial match). Kalau ambigu, tool balikkan kandidat — tanya user untuk klarifikasi dengan santai, contoh: "Maksud kamu si Alice apa si Albert?".
- Pilih tool minimal yang dibutuhkan; jangan over-fetch.
- Kalau di luar scope (cuaca, code, pengetahuan umum), jawab santai: "Hmm itu di luar bantuanku — aku cuma pegang catatan utang grup ini ya."`;

const tools = [
  {
    type: 'function',
    function: {
      name: 'list_users',
      description: 'Daftar user yang pernah terlibat utang/pembayaran di grup ini.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_group_summary',
      description: 'Ringkasan grup: total utang aktif, total dibayar, sisa outstanding, jumlah transaksi & user.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_outstanding_balance',
      description:
        'Saldo utang per pasangan (debtor → creditor). Tanpa argumen: semua pasangan grup. Hanya debtor_name: semua kreditur dari debitur itu. Hanya creditor_name: semua debitur ke kreditur itu. Keduanya: saldo pasangan tsb.',
      parameters: {
        type: 'object',
        properties: {
          debtor_name: { type: 'string', description: 'Nama debitur (case-insensitive partial match)' },
          creditor_name: { type: 'string', description: 'Nama kreditur (case-insensitive partial match)' },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_debts',
      description: 'Cari catatan utang dengan filter opsional. Default limit 20, max 100. Hasil diurutkan terbaru dulu.',
      parameters: {
        type: 'object',
        properties: {
          debtor_name: { type: 'string' },
          creditor_name: { type: 'string' },
          status: { type: 'string', enum: ['active', 'cancelled', 'all'], description: 'Default: active' },
          since: { type: 'string', description: 'YYYY-MM-DD; hanya debts mulai tanggal ini' },
          until: { type: 'string', description: 'YYYY-MM-DD; hanya debts sampai tanggal ini' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_payments',
      description: 'Cari catatan pembayaran dengan filter opsional. Default limit 20, max 100. Hasil diurutkan terbaru dulu.',
      parameters: {
        type: 'object',
        properties: {
          payer_name: { type: 'string' },
          receiver_name: { type: 'string' },
          since: { type: 'string', description: 'YYYY-MM-DD' },
          until: { type: 'string', description: 'YYYY-MM-DD' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_activity',
      description: 'Log perintah terbaru di grup ini (siapa pakai command apa, status, kapan). Default limit 20, max 100.',
      parameters: {
        type: 'object',
        properties: {
          user_name: { type: 'string', description: 'Filter user tertentu (partial match)' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
        },
        additionalProperties: false,
      },
    },
  },
];

function resolveUser(db, name) {
  if (!name || typeof name !== 'string') return { error: 'name kosong' };
  const trimmed = name.trim().replace(/^@/, '');
  if (!trimmed) return { error: 'name kosong' };
  const exact = db.prepare(
    'SELECT id, wa_user_id, display_name FROM users WHERE LOWER(display_name) = LOWER(?)'
  ).all(trimmed);
  if (exact.length === 1) return { user: exact[0] };
  if (exact.length > 1) return { ambiguous: exact };
  const partial = db.prepare(
    'SELECT id, wa_user_id, display_name FROM users WHERE LOWER(display_name) LIKE LOWER(?)'
  ).all(`%${trimmed}%`);
  if (partial.length === 1) return { user: partial[0] };
  if (partial.length === 0) return { notFound: true };
  return { ambiguous: partial };
}

function clampLimit(value, def, max) {
  const n = Number.isInteger(value) ? value : def;
  return Math.max(1, Math.min(max, n));
}

function listUsers(db, groupId) {
  const users = db.prepare(`
    SELECT u.id, u.display_name FROM users u
    WHERE u.id IN (
      SELECT debtor_id FROM debts WHERE group_id = ?
      UNION SELECT creditor_id FROM debts WHERE group_id = ?
      UNION SELECT payer_id FROM payments WHERE group_id = ?
      UNION SELECT receiver_id FROM payments WHERE group_id = ?
    )
    ORDER BY u.display_name
  `).all(groupId, groupId, groupId, groupId);
  return { users };
}

function getGroupSummary(db, groupId) {
  const totalActive = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS v FROM debts WHERE group_id=? AND status='active'`
  ).get(groupId).v;
  const totalCancelled = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS v FROM debts WHERE group_id=? AND status='cancelled'`
  ).get(groupId).v;
  const totalPayments = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS v FROM payments WHERE group_id=?`
  ).get(groupId).v;
  const activeDebtCount = db.prepare(
    `SELECT COUNT(*) AS v FROM debts WHERE group_id=? AND status='active'`
  ).get(groupId).v;
  const paymentCount = db.prepare(
    `SELECT COUNT(*) AS v FROM payments WHERE group_id=?`
  ).get(groupId).v;
  const userCount = listUsers(db, groupId).users.length;
  return {
    total_active_debt: totalActive,
    total_cancelled_debt: totalCancelled,
    total_payments: totalPayments,
    outstanding_estimate: Math.max(0, totalActive - totalPayments),
    active_debt_count: activeDebtCount,
    payment_count: paymentCount,
    user_count: userCount,
  };
}

function resolveOrReport(db, name, fieldKey) {
  if (!name) return { value: null };
  const r = resolveUser(db, name);
  if (r.error) return { abort: { error: r.error } };
  if (r.notFound) return { abort: { error: `User tidak ditemukan untuk ${fieldKey}: ${name}` } };
  if (r.ambiguous) return { abort: { error: `Nama ambigu untuk ${fieldKey}: ${name}`, candidates: r.ambiguous.map(u => u.display_name) } };
  return { value: r.user };
}

function getOutstandingBalanceTool(db, groupId, args) {
  const debtorResult = resolveOrReport(db, args.debtor_name, 'debtor_name');
  if (debtorResult.abort) return debtorResult.abort;
  const creditorResult = resolveOrReport(db, args.creditor_name, 'creditor_name');
  if (creditorResult.abort) return creditorResult.abort;
  const debtor = debtorResult.value;
  const creditor = creditorResult.value;

  if (debtor && creditor) {
    const outstanding = getOutstandingBalance(db, groupId, debtor.id, creditor.id);
    return { balances: [{ debtor: debtor.display_name, creditor: creditor.display_name, outstanding }] };
  }

  const all = getAllOutstandingBalances(db, groupId);
  const userMap = {};
  for (const u of db.prepare('SELECT id, display_name FROM users').all()) {
    userMap[u.id] = u.display_name;
  }
  let filtered = all;
  if (debtor) filtered = filtered.filter(b => b.debtor_id === debtor.id);
  if (creditor) filtered = filtered.filter(b => b.creditor_id === creditor.id);
  const balances = filtered.map(b => ({
    debtor: userMap[b.debtor_id] || `user#${b.debtor_id}`,
    creditor: userMap[b.creditor_id] || `user#${b.creditor_id}`,
    outstanding: b.outstanding,
  }));
  return { balances, count: balances.length };
}

function searchDebts(db, groupId, args) {
  const where = ['d.group_id = ?'];
  const params = [groupId];

  if (args.debtor_name) {
    const r = resolveOrReport(db, args.debtor_name, 'debtor_name');
    if (r.abort) return r.abort;
    where.push('d.debtor_id = ?');
    params.push(r.value.id);
  }
  if (args.creditor_name) {
    const r = resolveOrReport(db, args.creditor_name, 'creditor_name');
    if (r.abort) return r.abort;
    where.push('d.creditor_id = ?');
    params.push(r.value.id);
  }
  const status = (args.status || 'active').toLowerCase();
  if (status !== 'all') {
    if (!['active', 'cancelled'].includes(status)) {
      return { error: `status tidak valid: ${status}. Pilih active/cancelled/all.` };
    }
    where.push('d.status = ?');
    params.push(status);
  }
  if (args.since) {
    where.push('d.created_at >= ?');
    params.push(args.since);
  }
  if (args.until) {
    where.push('d.created_at <= ?');
    params.push(`${args.until}T23:59:59+07:00`);
  }

  const limit = clampLimit(args.limit, 20, 100);
  const rows = db.prepare(`
    SELECT d.id, d.amount, d.description, d.status, d.created_at,
           u1.display_name AS debtor, u2.display_name AS creditor
    FROM debts d
    JOIN users u1 ON d.debtor_id = u1.id
    JOIN users u2 ON d.creditor_id = u2.id
    WHERE ${where.join(' AND ')}
    ORDER BY d.created_at DESC
    LIMIT ${limit}
  `).all(...params);

  return { debts: rows, count: rows.length, limit };
}

function searchPayments(db, groupId, args) {
  const where = ['p.group_id = ?'];
  const params = [groupId];

  if (args.payer_name) {
    const r = resolveOrReport(db, args.payer_name, 'payer_name');
    if (r.abort) return r.abort;
    where.push('p.payer_id = ?');
    params.push(r.value.id);
  }
  if (args.receiver_name) {
    const r = resolveOrReport(db, args.receiver_name, 'receiver_name');
    if (r.abort) return r.abort;
    where.push('p.receiver_id = ?');
    params.push(r.value.id);
  }
  if (args.since) {
    where.push('p.created_at >= ?');
    params.push(args.since);
  }
  if (args.until) {
    where.push('p.created_at <= ?');
    params.push(`${args.until}T23:59:59+07:00`);
  }

  const limit = clampLimit(args.limit, 20, 100);
  const rows = db.prepare(`
    SELECT p.id, p.amount, p.description, p.created_at,
           u1.display_name AS payer, u2.display_name AS receiver
    FROM payments p
    JOIN users u1 ON p.payer_id = u1.id
    JOIN users u2 ON p.receiver_id = u2.id
    WHERE ${where.join(' AND ')}
    ORDER BY p.created_at DESC
    LIMIT ${limit}
  `).all(...params);

  return { payments: rows, count: rows.length, limit };
}

function getRecentActivity(db, waGroupId, args) {
  const where = ['group_id = ?'];
  const params = [waGroupId];
  if (args.user_name) {
    where.push('LOWER(user_name) LIKE LOWER(?)');
    params.push(`%${args.user_name.replace(/^@/, '').trim()}%`);
  }
  const limit = clampLimit(args.limit, 20, 100);
  const rows = db.prepare(`
    SELECT user_name, command, args, status, error_msg, created_at
    FROM command_log
    WHERE ${where.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `).all(...params);
  return { activity: rows, count: rows.length, limit };
}

function executeTool(name, args, ctx) {
  const { db, groupId, waGroupId } = ctx;
  const safeArgs = args && typeof args === 'object' ? args : {};
  try {
    switch (name) {
      case 'list_users': return listUsers(db, groupId);
      case 'get_group_summary': return getGroupSummary(db, groupId);
      case 'get_outstanding_balance': return getOutstandingBalanceTool(db, groupId, safeArgs);
      case 'search_debts': return searchDebts(db, groupId, safeArgs);
      case 'search_payments': return searchPayments(db, groupId, safeArgs);
      case 'get_recent_activity': return getRecentActivity(db, waGroupId, safeArgs);
      default: return { error: `Tool tidak dikenal: ${name}` };
    }
  } catch (err) {
    return { error: `Tool ${name} gagal: ${err.message}` };
  }
}

module.exports = { tools, executeTool, SYSTEM_PROMPT };
