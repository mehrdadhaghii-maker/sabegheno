const crypto = require("crypto");
const bcrypt = require("bcryptjs");

// National IDs are sensitive — we never store them in plaintext, only a
// salted hash. Use the SAME hash everywhere a national ID needs to be
// looked up (ProviderEvent, CreditCheck, EndUser) so records line up.
function hashNationalId(nationalId) {
  const salt = process.env.NATIONAL_ID_SALT || "sabegheno-static-salt-change-me";
  return crypto.createHash("sha256").update(`${salt}:${nationalId}`).digest("hex");
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 1000000)); // 6 digits, CSPRNG
}

async function hashOtp(code) {
  return bcrypt.hash(code, 8);
}

async function verifyOtpHash(code, hash) {
  return bcrypt.compare(code, hash);
}

// Same bcrypt mechanics as OTP hashing, just named for what they're really
// used for: admin-panel account passwords.
// security.md: bcrypt cost factor 12.
const BCRYPT_COST = 12;
async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_COST);
}

// Hashes created before the cost-12 rule (cost 10) are upgraded on next login.
function needsRehash(hash) {
  try { return bcrypt.getRounds(hash) < BCRYPT_COST; } catch { return true; }
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

// Stable dummy hash so "unknown username" costs the same time as "wrong password".
const DUMMY_HASH = bcrypt.hashSync("sabegheno-timing-equaliser", BCRYPT_COST);

module.exports = { hashNationalId, generateOtpCode, hashOtp, verifyOtpHash, hashPassword, verifyPassword, needsRehash, DUMMY_HASH, BCRYPT_COST };
