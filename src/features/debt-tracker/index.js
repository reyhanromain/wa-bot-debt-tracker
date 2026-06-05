const { initSchema } = require('./schema');
const { handleDebt } = require('./commands/debt');
const { handleDebtOther } = require('./commands/debt_other');
const { handlePay } = require('./commands/pay');
const { handleSettle } = require('./commands/settle');
const { handlePayFor, handleSettleFor } = require('./commands/pay_for');
const { handleStatus } = require('./commands/status');
const { handleCancel } = require('./commands/cancel');
const { handleUbah } = require('./commands/ubah');
const { handleRegister } = require('./commands/register');
const { handleRename } = require('./commands/rename');
const { handleHelp } = require('./commands/help');
const { handleAi } = require('./commands/ai');
const config = require('../../config');

const commands = {
  daftar: { handler: handleRegister, requiresRegistration: false, rateLimit: null, help: '.daftar <nama> — Daftar ke bot' },
  rename: { handler: handleRename, requiresRegistration: true, rateLimit: null, help: '.rename <nama> — Ganti nama' },
  utang: { handler: handleDebt, requiresRegistration: true, rateLimit: null, help: '.utang @user <jumlah> [ket] — Catat utang' },
  utangnya: { handler: handleDebtOther, requiresRegistration: true, rateLimit: null, help: '.utangnya @user <jumlah> [ket] — Catat utang dari user' },
  bayar: { handler: handlePay, requiresRegistration: true, rateLimit: null, help: '.bayar @user <jumlah> [ket] — Bayar utang' },
  bayarin: { handler: handlePayFor, requiresRegistration: true, rateLimit: null, help: '.bayarin @userX ke @userY <jumlah> [ket] — Bayarkan utang user lain' },
  lunas: { handler: handleSettle, requiresRegistration: true, rateLimit: null, help: '.lunas @user — Lunas semua utang ke user' },
  lunasin: { handler: handleSettleFor, requiresRegistration: true, rateLimit: null, help: '.lunasin @userX ke @userY [ket] — Lunasi utang user lain' },
  status: { handler: handleStatus, requiresRegistration: true, rateLimit: null, help: '.status [@user] — Lihat status utang' },
  batal: { handler: handleCancel, requiresRegistration: true, rateLimit: null, help: '.batal <id> — Batalkan catatan (D1/P1)' },
  ubah: { handler: handleUbah, requiresRegistration: true, rateLimit: null, help: '.ubah <id> <jumlah> [ket] — Ubah jumlah' },
  help: { handler: handleHelp, requiresRegistration: false, rateLimit: { max: 1, windowMs: 60000 }, help: '.help — Tampilkan bantuan' },
};

// Register AI command only if enabled
if (config.ai.enabled && config.ai.apiUrl) {
  commands.ai = { handler: handleAi, requiresRegistration: true, rateLimit: null, help: '.ai <prompt> — Tanya AI seputar data utang' };
}

module.exports = {
  name: 'debt-tracker',
  description: 'Pencatat utang antar anggota grup',
  initSchema,
  commands,
  schedules: [],
};
