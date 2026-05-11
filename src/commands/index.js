/**
 * Command routing map.
 * Maps command name (without prefix) to handler function and metadata.
 */

const { handleHelp } = require('./help');
const { handleRegister } = require('./register');
const { handleRename } = require('./rename');
const { handleDebt } = require('./debt');
const { handleDebtOther } = require('./debt_other');
const { handlePay } = require('./pay');
const { handleSettle } = require('./settle');
const { handleStatus } = require('./status');
const { handleCancel } = require('./cancel');
const { handleUbah } = require('./ubah');

/**
 * Command registry.
 * Each entry: { handler, requiresRegistration, isPublic, rateLimit }
 *
 * - requiresRegistration: true = user must have .daftar'd before using
 * - isPublic: true = accessible without registration
 * - rateLimit: { max, windowMs } or null for no limit
 */
const commands = {
  help: {
    handler: handleHelp,
    requiresRegistration: false,
    isPublic: true,
    rateLimit: { max: 1, windowMs: 60_000 }
  },
  daftar: {
    handler: handleRegister,
    requiresRegistration: false,
    isPublic: false,
    rateLimit: null
  },
  rename: {
    handler: handleRename,
    requiresRegistration: true,
    isPublic: false,
    rateLimit: null
  },
  utang: {
    handler: handleDebt,
    requiresRegistration: true,
    isPublic: false,
    rateLimit: null
  },
  utangnya: {
    handler: handleDebtOther,
    requiresRegistration: true,
    isPublic: false,
    rateLimit: null
  },
  bayar: {
    handler: handlePay,
    requiresRegistration: true,
    isPublic: false,
    rateLimit: null
  },
  lunas: {
    handler: handleSettle,
    requiresRegistration: true,
    isPublic: false,
    rateLimit: null
  },
  status: {
    handler: handleStatus,
    requiresRegistration: true,
    isPublic: false,
    rateLimit: null
  },
  batal: {
    handler: handleCancel,
    requiresRegistration: true,
    isPublic: false,
    rateLimit: null
  },
  ubah: {
    handler: handleUbah,
    requiresRegistration: true,
    isPublic: false,
    rateLimit: null
  }
};

function getCommand(name) {
  return commands[name] || null;
}

function getAllCommandNames() {
  return Object.keys(commands);
}

module.exports = { getCommand, getAllCommandNames };
