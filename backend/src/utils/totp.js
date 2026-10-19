// RFC 6238 TOTP (SHA-1, 6 digits, 30 s) — dependency-free so 2FA works offline.
const crypto = require("crypto");

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(buf) {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(str) {
  let bits = 0, value = 0; const out = [];
  for (const ch of String(str).replace(/=+$/, "").toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const generateSecret = () => base32Encode(crypto.randomBytes(20));

function hotp(secret, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const code = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

const stepOf = (ms = Date.now()) => Math.floor(ms / 1000 / 30);

// Returns the matched time-step (so the caller can refuse a replay) or null.
// Accepts ±1 step to tolerate clock drift between server and phone.
function verifyTotp(secret, token, now = Date.now()) {
  const t = String(token ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(t)) return null;
  const cur = stepOf(now);
  for (const d of [0, -1, 1]) {
    const a = Buffer.from(hotp(secret, cur + d)), b = Buffer.from(t);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return cur + d;
  }
  return null;
}

const otpauthUri = (secret, account, issuer = "Sabegheno") =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;

module.exports = { generateSecret, verifyTotp, otpauthUri, hotp, stepOf, base32Encode, base32Decode };
