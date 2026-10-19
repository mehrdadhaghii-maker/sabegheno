// auth.md §3 + security.md §2 — DB-backed sessions.
//  • one ACTIVE session per account (a new login revokes the previous one)
//  • idle timeout (default 30 min) enforced on every authenticated request
//  • opaque refresh token, stored only as a SHA-256 hash, rotated on every use
const crypto = require("crypto");
const prisma = require("../db/prisma");
const env = require("../config/env");
const { signToken } = require("../utils/jwt");

const sha256 = (v) => crypto.createHash("sha256").update(v).digest("hex");
const newRefreshToken = () => crypto.randomBytes(48).toString("base64url");
const idleMs = () => env.auth.idleMinutes * 60_000;

// Machine-readable codes the front-ends switch on.
const REVOKE_MESSAGES = {
  new_login: ["SESSION_REPLACED", "با ورود جدید از یک دستگاه دیگر، نشست قبلی شما بسته شد"],
  idle: ["SESSION_IDLE", `به دلیل ${env.auth.idleMinutes} دقیقه بی‌فعالیتی از حساب خارج شدید`],
  password_change: ["SESSION_ENDED", "رمز عبور تغییر کرد؛ دوباره وارد شوید"],
  account_deleted: ["SESSION_ENDED", "این حساب حذف شده است"],
  logout: ["SESSION_ENDED", "نشست بسته شده است؛ دوباره وارد شوید"],
  admin: ["SESSION_ENDED", "نشست شما توسط مدیر سیستم بسته شد"],
};
const revokeInfo = (reason) => REVOKE_MESSAGES[reason] || REVOKE_MESSAGES.logout;

async function createSession({ role, id, ip, userAgent }) {
  const refreshToken = newRefreshToken();
  const now = new Date();
  const [, session] = await prisma.$transaction([
    // single-session rule: kick every other active session of this account
    prisma.session.updateMany({
      where: { subjectRole: role, subjectId: id, revokedAt: null },
      data: { revokedAt: now, revokedReason: "new_login" },
    }),
    prisma.session.create({
      data: {
        subjectRole: role, subjectId: id, refreshHash: sha256(refreshToken),
        ip: ip || null, userAgent: (userAgent || "").slice(0, 300) || null,
        expiresAt: new Date(now.getTime() + env.auth.refreshDays * 86400_000),
      },
    }),
  ]);
  return { session, refreshToken };
}

const accessTokenFor = (session, claims) => signToken({ ...claims, sid: session.id });

// Exchanges a refresh token for a new pair. Does NOT count as user activity, so
// background polling can never keep an abandoned session alive.
async function rotate(refreshToken) {
  const fail = (code, message) => Object.assign(new Error(message), { status: 401, publicMessage: message, code });
  if (!refreshToken || typeof refreshToken !== "string") throw fail("SESSION_INVALID", "نشست نامعتبر است");
  const session = await prisma.session.findUnique({ where: { refreshHash: sha256(refreshToken) } });
  if (!session) throw fail("SESSION_INVALID", "نشست نامعتبر است؛ دوباره وارد شوید");
  const now = Date.now();
  if (session.revokedAt) { const [c, m] = revokeInfo(session.revokedReason); throw fail(c, m); }
  if (now - session.lastActivityAt.getTime() > idleMs()) {
    await revoke(session.id, "idle");
    throw fail(...revokeInfo("idle"));
  }
  if (session.expiresAt.getTime() < now) {
    await revoke(session.id, "logout");
    throw fail("SESSION_ENDED", "نشست منقضی شده است؛ دوباره وارد شوید");
  }
  const next = newRefreshToken();
  const updated = await prisma.session.update({ where: { id: session.id }, data: { refreshHash: sha256(next) } });
  return { session: updated, refreshToken: next };
}

const revoke = (id, reason = "logout") =>
  prisma.session.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });

const revokeAllFor = (role, id, reason) =>
  prisma.session.updateMany({ where: { subjectRole: role, subjectId: id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: reason } });

// Validates the session behind an access token. Returns null when valid,
// otherwise { code, message } for a 401.
async function check(sid, role, subjectId, { background = false } = {}) {
  const s = await prisma.session.findUnique({ where: { id: sid } });
  if (!s || s.subjectRole !== role || s.subjectId !== subjectId) return { code: "SESSION_INVALID", message: "نشست نامعتبر است" };
  if (s.revokedAt) { const [code, message] = revokeInfo(s.revokedReason); return { code, message }; }
  const now = Date.now();
  if (now - s.lastActivityAt.getTime() > idleMs()) {
    await revoke(s.id, "idle");
    const [code, message] = revokeInfo("idle");
    return { code, message };
  }
  if (s.expiresAt.getTime() < now) { await revoke(s.id, "logout"); return { code: "SESSION_ENDED", message: "نشست منقضی شده است" }; }
  // Real user activity only; throttled to one write per 30 s per session.
  if (!background && now - s.lastActivityAt.getTime() > 30_000) {
    const at = new Date();
    prisma.session.update({ where: { id: s.id }, data: { lastActivityAt: at } }).catch(() => {});
    if (role === "business") prisma.business.updateMany({ where: { id: subjectId }, data: { lastActiveAt: at } }).catch(() => {});
    if (role === "user") prisma.endUser.updateMany({ where: { id: subjectId }, data: { lastActiveAt: at } }).catch(() => {});
  }
  return null;
}

module.exports = { createSession, accessTokenFor, rotate, revoke, revokeAllFor, check, sha256, revokeInfo };
