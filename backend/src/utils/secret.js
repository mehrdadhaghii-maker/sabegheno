const crypto = require("crypto");

// AES-256-GCM for third-party API keys. The key is derived from ENCRYPTION_KEY
// (preferred) or JWT_SECRET so existing deployments keep working; set a
// dedicated ENCRYPTION_KEY in production.
const material = () => process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || "sabegheno-dev-encryption-key";
const key = () => crypto.createHash("sha256").update(material()).digest();

function encrypt(plain) {
  if (!plain) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

function decrypt(blob) {
  if (!blob) return null;
  try {
    const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
    const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
  } catch {
    return null; // key rotated / corrupted — treated as "no key"
  }
}

const mask = (blob) => (blob ? "••••••••" : null);

module.exports = { encrypt, decrypt, mask };
