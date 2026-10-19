const { verifyToken } = require("../utils/jwt");
const prisma = require("../db/prisma");
const sessions = require("../services/session.service");
const logger = require("../utils/logger");

const deny = (res, status, code, error) => res.status(status).json({ error, code });

// Verifies the access JWT AND the DB session behind it, then attaches
// { id, role, mobile, sid, … } to req.auth. role: business | user | admin.
// Clients flag background polling with `X-Background-Poll: 1` so it does not
// count as activity for the 30-minute idle timeout.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return deny(res, 401, "NO_TOKEN", "توکن احراز هویت ارسال نشده");
  let payload;
  try {
    payload = verifyToken(token);
  } catch (e) {
    return e.name === "TokenExpiredError"
      ? deny(res, 401, "TOKEN_EXPIRED", "توکن منقضی شده است")
      : deny(res, 401, "TOKEN_INVALID", "توکن نامعتبر است");
  }
  if (!payload.sid) return deny(res, 401, "SESSION_INVALID", "نشست قدیمی است؛ دوباره وارد شوید");
  try {
    const bad = await sessions.check(payload.sid, payload.role, payload.id, { background: req.headers["x-background-poll"] === "1" });
    if (bad) return deny(res, 401, bad.code, bad.message);
    req.auth = payload;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(role) {
  const guard = (req, res, next) => {
    if (!req.auth || req.auth.role !== role) {
      logger.warn("🔐 دسترسی غیرمجاز به مسیر محافظت‌شده", { route: req.originalUrl.split("?")[0], method: req.method, userId: req.auth?.id, role: req.auth?.role, wanted: role });
      return res.status(403).json({ error: "دسترسی غیرمجاز برای این نقش" });
    }
    next();
  };
  Object.defineProperty(guard, "name", { value: `requireRole:${role}` }); // lets scripts/audit-routes.js see the role
  return guard;
}

// monitoring spec §2 — admin-only guard (alias of requireRole("admin")).
const isAdmin = requireRole("admin");

// A business must have finished KYC + signed the contract before it can use
// anything beyond auth.
async function requireApprovedBusiness(req, res, next) {
  try {
    const business = await prisma.business.findUnique({ where: { id: req.auth?.id }, select: { status: true, isVerified: true, deletedAt: true } });
    if (!business || business.deletedAt || business.status !== "approved" || business.isVerified === false) {
      return res.status(403).json({ error: "حساب کسب‌وکار هنوز تأیید نهایی نشده است" });
    }
    req.auth.businessStatus = business.status;
    req.auth.isVerified = business.isVerified;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, requireRole, requireApprovedBusiness, isAdmin };
