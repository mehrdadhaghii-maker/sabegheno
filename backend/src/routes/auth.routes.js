const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const { hashNationalId, generateOtpCode, hashOtp, verifyOtpHash } = require("../utils/crypto");
const sessions = require("../services/session.service");
const env = require("../config/env");
const logger = require("../utils/logger");
const { softDeleteBusiness, softDeleteUser } = require("../services/dataRetention.service");
const { sendOtpSms } = require("../services/otp.service");
const { verifyMobileMatchesNationalId } = require("../services/shahkar.service");
const { requireAuth } = require("../middleware/auth");

const OTP_TTL_SECONDS = 120;

const router = express.Router();

const maskMobile = (m) => `${m.slice(0, 4)}***${m.slice(-3)}`;
const audit = (role, identifier, success, reason, req) =>
  prisma.loginAttempt.create({ data: { role, identifier, success, reason, ip: req.ip || null } }).catch(() => {});

// Creates the DB session (revoking any previous one) and returns both tokens.
async function startSession(req, role, id, claims) {
  const { session, refreshToken } = await sessions.createSession({ role, id, ip: req.ip, userAgent: req.headers["user-agent"] });
  const at = new Date();
  if (role === "business") prisma.business.updateMany({ where: { id }, data: { lastActiveAt: at } }).catch(() => {});
  if (role === "user") prisma.endUser.updateMany({ where: { id }, data: { lastActiveAt: at } }).catch(() => {});
  return { token: sessions.accessTokenFor(session, claims), refreshToken };
}

const requestOtpSchema = z.object({
  mobile: z.string().regex(/^09\d{9}$/, "شماره موبایل باید ۱۱ رقم و با 09 شروع شود"),
  role: z.enum(["business", "user"]),
  // A business must REGISTER before it can LOG IN — they are two different intents.
  intent: z.enum(["login", "register"]).default("login"),
  businessName: z.string().trim().max(80).optional(),
});

// POST /auth/otp/request  { mobile, role, intent, businessName? }
// Sabegheno generates and owns the OTP code — api.ir's SmsOTP is only used
// for delivery, so this never depends on any single data-provider partner.
router.post("/otp/request", async (req, res, next) => {
  try {
    const { mobile, role, intent, businessName } = requestOtpSchema.parse(req.body);

    if (role === "business") {
      // Checked BEFORE any SMS is sent (no SMS cost, no code for a mobile that may not log in).
      const exists = await prisma.business.findUnique({ where: { mobile }, select: { id: true } });
      if (intent === "login" && !exists) return res.status(404).json({ error: "این شماره هنوز ثبت‌نام نشده است؛ ابتدا ثبت‌نام کنید و پس از آن وارد شوید", code: "NOT_REGISTERED" });
      if (intent === "register" && exists) return res.status(409).json({ error: "این شماره قبلاً ثبت‌نام شده است؛ از بخش ورود وارد شوید", code: "ALREADY_REGISTERED" });
      if (intent === "register" && (businessName || "").length < 2) return res.status(400).json({ error: "نام برند کسب‌وکار الزامی است", code: "BRAND_REQUIRED" });
    }
    const code = generateOtpCode();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000);

    await prisma.otpCode.create({ data: { mobile, codeHash, expiresAt } });
    await sendOtpSms(mobile, code);

    res.json({ ok: true, role, expiresInSeconds: OTP_TTL_SECONDS });
  } catch (err) {
    next(err);
  }
});

const verifyOtpSchema = z.object({
  mobile: z.string().regex(/^09\d{9}$/),
  code: z.string().length(6),
  role: z.enum(["business", "user"]),
  intent: z.enum(["login", "register"]).default("login"),
  // Only needed the first time a business registers:
  businessName: z.string().optional(),
  // Only needed for a "user" login, so we can key their report:
  nationalId: z.string().length(10).optional(),
});

// POST /auth/otp/verify  { mobile, code, role, businessName?, nationalId? }
router.post("/otp/verify", async (req, res, next) => {
  try {
    const body = verifyOtpSchema.parse(req.body);

    const candidate = await prisma.otpCode.findFirst({
      where: { mobile: body.mobile, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!candidate) return res.status(400).json({ error: "کدی برای این شماره یافت نشد یا منقضی شده است" });

    // Each code survives at most N wrong guesses — then it is burned and a new one must be requested.
    if (candidate.attempts >= env.auth.otpMaxAttempts) {
      audit(body.role, maskMobile(body.mobile), false, "otp_burned", req);
      return res.status(429).json({ error: "تعداد تلاش‌های ناموفق زیاد بود؛ کد جدید دریافت کنید", code: "OTP_BURNED" });
    }
    const valid = await verifyOtpHash(body.code, candidate.codeHash);
    if (!valid) {
      await prisma.otpCode.update({ where: { id: candidate.id }, data: { attempts: { increment: 1 } } });
      audit(body.role, maskMobile(body.mobile), false, "bad_otp", req);
      return res.status(400).json({ error: "کد وارد شده نادرست است" });
    }

    await prisma.otpCode.update({ where: { id: candidate.id }, data: { consumedAt: new Date() } });

    if (body.role === "business") {
      let business = await prisma.business.findUnique({ where: { mobile: body.mobile } });
      if (body.intent === "login" && !business) return res.status(404).json({ error: "این شماره هنوز ثبت‌نام نشده است؛ ابتدا ثبت‌نام کنید", code: "NOT_REGISTERED" });
      if (body.intent === "register" && business) return res.status(409).json({ error: "این شماره قبلاً ثبت‌نام شده است؛ از بخش ورود وارد شوید", code: "ALREADY_REGISTERED" });
      if (!business) {
        // Brand name is mandatory at registration. (This also ends the old quirk where "login" with an
        // unknown mobile silently created an anonymous business.)
        const brand = (body.businessName || "").trim();
        if (brand.length < 2) {
          return res.status(400).json({ error: "این شماره هنوز ثبت‌نام نشده است؛ برای ثبت‌نام، نام برند کسب‌وکار را وارد کنید", code: "BRAND_REQUIRED" });
        }
        business = await prisma.business.create({ data: { mobile: body.mobile, name: brand, brandName: brand } });
      }
      const tokens = await startSession(req, "business", business.id, { id: business.id, role: "business", mobile: business.mobile, businessStatus: business.status, isVerified: business.isVerified });
      audit("business", maskMobile(body.mobile), true, "ok", req);
      return res.json({ ...tokens, business });
    }

    // role === "user" — this is a person checking THEIR OWN report, so
    // before trusting the national ID they typed, confirm via Shahkar that
    // this exact mobile number actually belongs to that national ID.
    // Otherwise anyone who knows a stranger's national ID could view their
    // report just by verifying a code on their own, unrelated phone.
    if (!body.nationalId) return res.status(400).json({ error: "کد ملی برای ورود کاربر الزامی است" });

    try {
      const shahkar = await verifyMobileMatchesNationalId(body.nationalId, body.mobile);
      if (shahkar.source === "ok" && shahkar.matched === false) {
        return res.status(403).json({ error: "این شماره موبایل با کد ملی واردشده مطابقت ندارد" });
      }
      if (shahkar.source === "unavailable" && process.env.NODE_ENV === "production") {
        return res.status(503).json({ error: "سرویس احراز هویت شاهکار در دسترس نیست" });
      }
    } catch (err) {
      console.error("Shahkar verification failed:", err.message);
      if (process.env.NODE_ENV === "production") {
        return res.status(503).json({ error: "احراز هویت شاهکار موقتاً در دسترس نیست" });
      }
    }

    const nationalIdHash = hashNationalId(body.nationalId);
    let user = await prisma.endUser.findUnique({ where: { mobile: body.mobile } });
    if (!user) {
      user = await prisma.endUser.create({ data: { mobile: body.mobile, nationalIdHash, nationalIdEnc: require("../utils/nid").sealNid(body.nationalId) } });
    } else if (user.nationalIdHash !== nationalIdHash) {
      return res.status(403).json({ error: "این شماره موبایل قبلاً به کد ملی دیگری متصل شده است" });
    } else if (!user.nationalIdEnc) {
      // accounts created before the encrypted copy existed: fill it in now that the person has proven the ID again
      user = await prisma.endUser.update({ where: { id: user.id }, data: { nationalIdEnc: require("../utils/nid").sealNid(body.nationalId) } });
    }
    const tokens = await startSession(req, "user", user.id, { id: user.id, role: "user", mobile: user.mobile, nationalIdHash: user.nationalIdHash });
    audit("user", maskMobile(body.mobile), true, "ok", req);
    res.json({ ...tokens, user: { id: user.id, mobile: user.mobile } });
  } catch (err) {
    next(err);
  }
});

// GET /auth/me — refreshes mutable approval state after an admin decision.
router.get("/me", requireAuth, async (req, res, next) => {
  try {
    if (req.auth.role === "business") {
      const business = await prisma.business.findUnique({ where: { id: req.auth.id } });
      if (!business) return res.status(404).json({ error: "حساب کسب‌وکار یافت نشد" });
      return res.json({ role: "business", entity: business, mobile: business.mobile });
    }
    const user = await prisma.endUser.findUnique({ where: { id: req.auth.id }, select: { id: true, mobile: true } });
    if (!user) return res.status(404).json({ error: "حساب کاربر یافت نشد" });
    return res.json({ role: "user", entity: user, mobile: user.mobile });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh { refreshToken } — rotates the refresh token, returns a new access token.
// Fails (401 + code) if the session was replaced by a newer login or sat idle > 30 min.
router.post("/refresh", async (req, res, next) => {
  try {
    const { session, refreshToken } = await sessions.rotate(req.body?.refreshToken);
    let claims = null;
    if (session.subjectRole === "business") {
      const b = await prisma.business.findUnique({ where: { id: session.subjectId } });
      if (b && !b.deletedAt) claims = { id: b.id, role: "business", mobile: b.mobile, businessStatus: b.status, isVerified: b.isVerified };
    } else if (session.subjectRole === "user") {
      const u = await prisma.endUser.findUnique({ where: { id: session.subjectId } });
      if (u && !u.deletedAt) claims = { id: u.id, role: "user", mobile: u.mobile, nationalIdHash: u.nationalIdHash };
    } else if (session.subjectRole === "admin") {
      const a = await prisma.adminUser.findUnique({ where: { id: session.subjectId } });
      if (a) claims = { id: a.id, role: "admin", username: a.username };
    }
    if (!claims) { await sessions.revoke(session.id, "account_deleted"); return res.status(401).json({ error: "حساب یافت نشد", code: "SESSION_INVALID" }); }
    res.json({ token: sessions.accessTokenFor(session, claims), refreshToken });
  } catch (err) {
    if (err.code && err.status === 401) return res.status(401).json({ error: err.publicMessage, code: err.code });
    next(err);
  }
});

// POST /auth/logout — closes THIS session on the server (not just in the browser).
router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    await sessions.revoke(req.auth.sid, "logout");
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /auth/sessions — the account's own session list (normally exactly one).
router.get("/sessions", requireAuth, async (req, res, next) => {
  try {
    const rows = await prisma.session.findMany({
      where: { subjectRole: req.auth.role, subjectId: req.auth.id, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, ip: true, userAgent: true, createdAt: true, lastActivityAt: true },
    });
    res.json(rows.map((r) => ({ ...r, current: r.id === req.auth.sid })));
  } catch (err) { next(err); }
});

// POST /auth/logout-all — manually closes every session of this account.
router.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    const r = await sessions.revokeAllFor(req.auth.role, req.auth.id, "logout");
    res.json({ ok: true, closed: r.count });
  } catch (err) { next(err); }
});

// DELETE /auth/account { confirm: "حذف" } — data.md: personal data is wiped immediately,
// the tombstone row is hard-deleted after 30 days.
router.delete("/account", requireAuth, async (req, res, next) => {
  try {
    if (req.auth.role === "admin") return res.status(403).json({ error: "حساب مدیر از این مسیر قابل حذف نیست" });
    if (req.body?.confirm !== "حذف") return res.status(400).json({ error: "برای تأیید، عبارت «حذف» را ارسال کنید" });
    const done = req.auth.role === "business" ? await softDeleteBusiness(req.auth.id, "user") : await softDeleteUser(req.auth.id, "user");
    logger.security(`حذف حساب توسط کاربر (${req.auth.role})`, { userId: req.auth.id });
    res.json({ ok: !!done, hardDeleteAfterDays: env.retention.hardDeleteAfterDays });
  } catch (err) { next(err); }
});

module.exports = router;
