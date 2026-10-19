// Server-to-server authentication for the public API (/v1). Header:  X-API-Key: sbg_live_…
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");
const prisma = require("../db/prisma");

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const KEY_RE = /^sbg_(live|test)_[A-Za-z0-9_-]{24,64}$/;
const deny = (res, status, code, error) => res.status(status).json({ error, code });

const generateKey = () => `sbg_live_${crypto.randomBytes(24).toString("base64url")}`;

async function requireApiKey(req, res, next) {
  try {
    const raw = req.headers["x-api-key"] || ((req.headers.authorization || "").startsWith("ApiKey ") ? req.headers.authorization.slice(7) : "");
    if (!raw || !KEY_RE.test(raw)) return deny(res, 401, "API_KEY_MISSING", "کلید API ارسال نشده یا قالب آن نادرست است (هدر X-API-Key)");
    const key = await prisma.apiKey.findUnique({
      where: { keyHash: sha256(raw) },
      include: { business: { select: { id: true, status: true, isVerified: true, deletedAt: true } } },
    });
    if (!key || key.revokedAt) return deny(res, 401, "API_KEY_INVALID", "کلید API نامعتبر یا باطل شده است");
    const b = key.business;
    if (!b || b.deletedAt || b.status !== "approved" || b.isVerified === false) return deny(res, 403, "BUSINESS_NOT_APPROVED", "حساب کسب‌وکار هنوز تأیید نهایی نشده است");
    if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    req.auth = { id: b.id, role: "business", via: "api", apiKeyId: key.id };
    next();
  } catch (err) { next(err); }
}

// 120 calls / minute / key (keyed by the key, not the IP — one customer server = one IP).
const apiKeyLimiter = rateLimit({
  windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.auth?.apiKeyId || "anon",
  handler: (req, res) => res.status(429).json({ error: "سقف ۱۲۰ درخواست در دقیقه برای این کلید پر شده است", code: "RATE_LIMITED" }),
});

module.exports = { requireApiKey, apiKeyLimiter, generateKey, sha256 };
