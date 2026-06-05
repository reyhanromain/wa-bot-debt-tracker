const { extractAmount, parseAmountString, nowWIB, formatAmount } = require('../../../shared/parser');
const { ensureUser, getOutstandingBalance } = require('../utils');

function getUsage(commandName) {
  if (commandName === 'bayarin') {
    return '❌ Gunakan: .bayarin @userX ke @userY <jumlah> [keterangan]\nContoh: .bayarin @reyhan ke @udin 5000';
  }

  return '❌ Gunakan: .lunasin @userX ke @userY [keterangan]\nContoh: .lunasin @reyhan ke @udin';
}

function getMentionDisplayName(msg, index, mentionedId) {
  return msg.mentions?.[index]?.pushname || mentionedId.split('@')[0];
}

function parsePayForArgs(msg, args, db, { commandName, requireAmount }) {
  const usage = getUsage(commandName);
  const mentionedIds = msg.mentionedIds || [];

  if (mentionedIds.length !== 2) {
    msg.reply(usage);
    return null;
  }

  if (
    args.length < 3 ||
    !args[0]?.startsWith('@') ||
    args[1]?.toLowerCase() !== 'ke' ||
    !args[2]?.startsWith('@')
  ) {
    msg.reply('❌ Format tidak valid. Gunakan kata "ke" di antara dua mention.');
    return null;
  }

  const debtorMentionedId = mentionedIds[0];
  const receiverMentionedId = mentionedIds[1];

  if (debtorMentionedId === receiverMentionedId) {
    msg.reply('❌ User yang berutang dan penerima tidak boleh sama.');
    return null;
  }

  const ts = nowWIB();
  const debtor = ensureUser(db, debtorMentionedId, getMentionDisplayName(msg, 0, debtorMentionedId), ts);
  const receiver = ensureUser(db, receiverMentionedId, getMentionDisplayName(msg, 1, receiverMentionedId), ts);

  if (!debtor || !receiver) {
    msg.reply('❌ Gagal memproses user yang disebut.');
    return null;
  }

  if (requireAmount) {
    const { amount, rest } = extractAmount(args.slice(3));
    if (!amount) {
      msg.reply(`❌ Jumlah harus berupa angka positif.\nContoh: .bayarin @userX ke @userY 5000`);
      return null;
    }

    return {
      debtor,
      receiver,
      amount,
      note: rest.join(' ').trim() || null,
      ts,
    };
  }

  const tail = args.slice(3);
  if (tail.length > 0 && parseAmountString(tail[0]) !== null) {
    msg.reply('❌ .lunasin tidak menerima nominal. Gunakan: .lunasin @userX ke @userY [keterangan]');
    return null;
  }

  return {
    debtor,
    receiver,
    amount: null,
    note: tail.join(' ').trim() || null,
    ts,
  };
}

function handlePayFor(msg, args, db, sender, groupId) {
  const parsed = parsePayForArgs(msg, args, db, { commandName: 'bayarin', requireAmount: true });
  if (!parsed) return;

  const { debtor, receiver, amount, note, ts } = parsed;
  const outstanding = getOutstandingBalance(db, groupId, debtor.id, receiver.id);

  if (outstanding <= 0) {
    msg.reply(`ℹ️ Tidak ada utang tersisa dari @${debtor.display_name} ke @${receiver.display_name}.`);
    return;
  }

  if (amount > outstanding) {
    msg.reply(`❌ Jumlah pembayaran (Rp${formatAmount(amount)}) melebihi sisa utang (Rp${formatAmount(outstanding)}).`);
    return;
  }

  const description = note
    ? `${note} — dibayarkan oleh ${sender.display_name}`
    : `dibayarkan oleh ${sender.display_name}`;

  const insertPayment = db.transaction(() => {
    return db.prepare(
      'INSERT INTO payments (group_id, payer_id, receiver_id, amount, description, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(groupId, debtor.id, receiver.id, amount, description, ts);
  });

  const result = insertPayment();
  const payId = result.lastInsertRowid;
  const remaining = outstanding - amount;

  msg.reply(
    `🟢 Bayar #P${payId} *Rp${formatAmount(amount)}* dari @${debtor.display_name} ke @${receiver.display_name} oleh @${sender.display_name} berhasil dicatat\n` +
    `📝 Sisa utang dari @${debtor.display_name} ke @${receiver.display_name}: *Rp${formatAmount(remaining)}*\n` +
    `💡 untuk membatalkan, kirim *.batal P${payId}*\n` +
    `💡 untuk mengubah, kirim *.ubah P${payId} <jumlah>*`
  );
}

function handleSettleFor(msg, args, db, sender, groupId) {
  const parsed = parsePayForArgs(msg, args, db, { commandName: 'lunasin', requireAmount: false });
  if (!parsed) return;

  const { debtor, receiver, note, ts } = parsed;
  const outstanding = getOutstandingBalance(db, groupId, debtor.id, receiver.id);

  if (outstanding <= 0) {
    msg.reply(`ℹ️ Tidak ada utang tersisa dari @${debtor.display_name} ke @${receiver.display_name}.`);
    return;
  }

  const description = note
    ? `${note} — semua utang lunas — dibayarkan oleh ${sender.display_name}`
    : `semua utang lunas — dibayarkan oleh ${sender.display_name}`;

  const insertPayment = db.transaction(() => {
    return db.prepare(
      'INSERT INTO payments (group_id, payer_id, receiver_id, amount, description, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(groupId, debtor.id, receiver.id, outstanding, description, ts);
  });

  const result = insertPayment();
  const settleId = result.lastInsertRowid;

  msg.reply(
    `🟢 Bayar #P${settleId} *Rp${formatAmount(outstanding)}* dari @${debtor.display_name} ke @${receiver.display_name} oleh @${sender.display_name} berhasil dicatat\n` +
    `✅ Semua utang @${debtor.display_name} ke @${receiver.display_name} lunas\n` +
    `💡 untuk membatalkan, kirim *.batal P${settleId}*\n` +
    `💡 untuk mengubah, kirim *.ubah P${settleId} <jumlah>*`
  );
}

module.exports = { handlePayFor, handleSettleFor };
