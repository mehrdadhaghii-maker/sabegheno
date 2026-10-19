const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { hashPassword, verifyPassword, needsRehash, DUMMY_HASH } = require("../utils/crypto");
const { encrypt, decrypt, mask } = require("../utils/secret");
const sessions = require("../services/session.service");
const env = require("../config/env");
const logger = require("../utils/logger");
const { listForPerson } = require("../services/facility.service");
const rating = require("../services/rating.service");
const { adminView, maskNid, openNid } = require("../utils/nid");
const attachments = require("../services/attachments.service");
const { isLocked, lockDecision, LOCK_MESSAGE } = require("../services/lockout");
const { checkPasswordPolicy, policyMessage } = require("../utils/password");
const { generateSecret, verifyTotp, otpauthUri } = require("../utils/totp");
const { performCall, hydrate } = require("../services/externalServices.service");
const { windowStart, buildSeries, summarize, scoreBuckets, isAlert } = require("../services/analytics.service");

const router = express.Router();

/* ------------------------------ admin auth ------------------------------- */

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
  totp: z.string().max(10).optional(),
});

const authCfg = env.auth;
const auditAdmin = (identifier, success, reason, req) =>
  prisma.loginAttempt.create({ data: { role: "admin", identifier: String(identifier).slice(0, 100), success, reason, ip: req.ip || null } }).catch(() => {});

// Records a failed password / 2FA attempt and locks the account at the 5th (auth.md §2).
async function registerFailure(admin, reason, req) {
  const updated = await prisma.adminUser.update({ where: { id: admin.id }, data: { failedLogins: { increment: 1 } } });
  auditAdmin(admin.username, false, reason, req);
  const d = lockDecision(updated.failedLogins, authCfg);
  if (d.lock) {
    await prisma.adminUser.update({ where: { id: admin.id }, data: { lockedUntil: d.lockedUntil, failedLogins: 0 } });
    await sessions.revokeAllFor("admin", admin.id, "admin");
    logger.security(`قفل اکانت ادمین «${admin.username}» پس از ${authCfg.maxFailedLogins} تلاش ناموفق`, { ip: req.ip });
    return { locked: true, lockedUntil: d.lockedUntil };
  }
  return { locked: false };
}
const lockedResponse = (res, lockedUntil) => res.status(423).json({ error: LOCK_MESSAGE, code: "ACCOUNT_LOCKED", lockedUntil });

// POST /admin/login { username, password, totp? } — separate from the OTP-based
// business/user login; this is Sabegheno's own platform-admin account.
router.post("/login", async (req, res, next) => {
  try {
    const { username, password, totp } = loginSchema.parse(req.body);
    let admin = await prisma.adminUser.findUnique({ where: { username } });
    const now = new Date();

    // A lock refuses even the CORRECT password.
    if (admin && isLocked(admin.lockedUntil, now)) {
      auditAdmin(username, false, "locked", req);
      return lockedResponse(res, admin.lockedUntil);
    }
    // An expired lock starts a fresh counter.
    if (admin && admin.lockedUntil) admin = await prisma.adminUser.update({ where: { id: admin.id }, data: { lockedUntil: null, failedLogins: 0 } });

    // Same bcrypt work whether or not the username exists (no timing oracle).
    const ok = await verifyPassword(password, admin?.passwordHash || DUMMY_HASH);
    if (!admin || !ok) {
      if (!admin) { auditAdmin(username, false, "bad_password", req); return res.status(401).json({ error: "نام کاربری یا رمز عبور نادرست است" }); }
      const r = await registerFailure(admin, "bad_password", req);
      return r.locked ? lockedResponse(res, r.lockedUntil) : res.status(401).json({ error: "نام کاربری یا رمز عبور نادرست است" });
    }

    if (admin.twoFactorEnabled) {
      if (!totp) return res.status(401).json({ error: "کد احراز هویت دومرحله‌ای را وارد کنید", code: "TOTP_REQUIRED", twoFactorRequired: true });
      const secret = decrypt(admin.twoFactorSecretEnc);
      const step = secret ? verifyTotp(secret, totp) : null;
      if (step === null || (admin.twoFactorLastStep != null && step <= admin.twoFactorLastStep)) {
        const r = await registerFailure(admin, "bad_2fa", req);
        return r.locked ? lockedResponse(res, r.lockedUntil) : res.status(401).json({ error: "کد دومرحله‌ای نادرست است", code: "TOTP_INVALID", twoFactorRequired: true });
      }
      await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorLastStep: step } });
    }

    // Success: clear counters, upgrade an old cost-10 hash to cost 12, open a fresh single session.
    const data = { failedLogins: 0, lockedUntil: null };
    if (needsRehash(admin.passwordHash)) data.passwordHash = await hashPassword(password);
    await prisma.adminUser.update({ where: { id: admin.id }, data });
    const { session, refreshToken } = await sessions.createSession({ role: "admin", id: admin.id, ip: req.ip, userAgent: req.headers["user-agent"] });
    auditAdmin(username, true, "ok", req);
    res.json({
      token: sessions.accessTokenFor(session, { id: admin.id, role: "admin", username: admin.username }),
      refreshToken,
      admin: { id: admin.id, username: admin.username, twoFactorEnabled: admin.twoFactorEnabled },
    });
  } catch (err) {
    next(err);
  }
});

// Everything below requires a valid admin token.
router.use(requireAuth, requireRole("admin"));

/* ------------------- admin account security (v15) ------------------- */

// GET /admin/security — 2FA state, own sessions, recent logins, retention reports.
router.get("/security", async (req, res, next) => {
  try {
    const [admin, sess, attempts, reports] = await Promise.all([
      prisma.adminUser.findUnique({ where: { id: req.auth.id }, select: { username: true, twoFactorEnabled: true, passwordChangedAt: true, createdAt: true } }),
      prisma.session.findMany({ where: { subjectRole: "admin", subjectId: req.auth.id, revokedAt: null }, orderBy: { createdAt: "desc" }, select: { id: true, ip: true, userAgent: true, createdAt: true, lastActivityAt: true } }),
      prisma.loginAttempt.findMany({ where: { role: "admin" }, orderBy: { createdAt: "desc" }, take: 20, select: { identifier: true, success: true, reason: true, ip: true, createdAt: true } }),
      prisma.cleanupReport.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    ]);
    res.json({
      admin, idleMinutes: env.auth.idleMinutes, maxFailedLogins: env.auth.maxFailedLogins, lockHours: env.auth.lockHours,
      sessions: sess.map((x) => ({ ...x, current: x.id === req.auth.sid })), attempts, cleanupReports: reports,
    });
  } catch (err) { next(err); }
});

// POST /admin/password { currentPassword, newPassword } — policy + bcrypt-12, then every session is closed.
router.post("/password", async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) }).parse(req.body);
    const pol = checkPasswordPolicy(newPassword);
    if (!pol.ok) return res.status(400).json({ error: policyMessage(pol.problems), code: "WEAK_PASSWORD" });
    const admin = await prisma.adminUser.findUnique({ where: { id: req.auth.id } });
    if (!admin || !(await verifyPassword(currentPassword, admin.passwordHash))) return res.status(400).json({ error: "رمز فعلی نادرست است" });
    await prisma.adminUser.update({ where: { id: admin.id }, data: { passwordHash: await hashPassword(newPassword), passwordChangedAt: new Date() } });
    await sessions.revokeAllFor("admin", admin.id, "password_change"); // security.md §2
    logger.security(`رمز ادمین «${admin.username}» تغییر کرد؛ همهٔ نشست‌ها بسته شد`);
    res.json({ ok: true, relogin: true });
  } catch (err) { next(err); }
});

// 2FA: setup → enable (verify first code) → disable (password + code).
router.post("/2fa/setup", async (req, res, next) => {
  try {
    const admin = await prisma.adminUser.findUnique({ where: { id: req.auth.id } });
    if (admin.twoFactorEnabled) return res.status(400).json({ error: "احراز هویت دومرحله‌ای از قبل فعال است" });
    const secret = generateSecret();
    await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorSecretEnc: encrypt(secret), twoFactorLastStep: null } });
    res.json({ secret, otpauthUri: otpauthUri(secret, admin.username) });
  } catch (err) { next(err); }
});

router.post("/2fa/enable", async (req, res, next) => {
  try {
    const { code } = z.object({ code: z.string().min(6).max(10) }).parse(req.body);
    const admin = await prisma.adminUser.findUnique({ where: { id: req.auth.id } });
    const secret = decrypt(admin.twoFactorSecretEnc);
    const step = secret ? verifyTotp(secret, code) : null;
    if (step === null) return res.status(400).json({ error: "کد نادرست است؛ ساعت گوشی را بررسی و دوباره تلاش کنید" });
    await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorEnabled: true, twoFactorLastStep: step } });
    logger.security(`احراز هویت دومرحله‌ای برای «${admin.username}» فعال شد`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/2fa/disable", async (req, res, next) => {
  try {
    const { password, code } = z.object({ password: z.string().min(1).max(200), code: z.string().min(6).max(10) }).parse(req.body);
    const admin = await prisma.adminUser.findUnique({ where: { id: req.auth.id } });
    const secret = decrypt(admin.twoFactorSecretEnc);
    if (!(await verifyPassword(password, admin.passwordHash)) || !secret || verifyTotp(secret, code) === null) return res.status(400).json({ error: "رمز یا کد نادرست است" });
    await prisma.adminUser.update({ where: { id: admin.id }, data: { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorLastStep: null } });
    logger.security(`احراز هویت دومرحله‌ای برای «${admin.username}» غیرفعال شد`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /admin/data-retention/run — manual trigger of the daily cleanup (also returns the report).
router.post("/data-retention/run", async (req, res, next) => {
  try {
    const { runRetention } = require("../services/dataRetention.service");
    res.json(await runRetention());
  } catch (err) { next(err); }
});

/* ------------------- advanced validation (manual review queue, v16) ------------------- */

const reviewDecision = z.object({
  decision: z.enum(["approve", "decline"]),
  note: z.string().trim().max(1000).optional(),
  limit: z.number().int().min(0).optional(), // optional approved limit (toman)
}).refine((v) => v.decision === "approve" || (v.note && v.note.length >= 3), { message: "برای رد، دلیل را بنویسید", path: ["note"] });

// GET /admin/reviews?status=pending|done — inquiries whose decision is "review"
router.get("/reviews", async (req, res, next) => {
  try {
    const done = req.query.status === "done";
    const rows = await prisma.creditCheck.findMany({
      where: { decision: "review", reviewedDecision: done ? { not: null } : null },
      orderBy: done ? { reviewedAt: "desc" } : { createdAt: "asc" }, // oldest waiting first
      take: 200,
      include: { business: { select: { id: true, name: true, brandName: true, logoUrl: true } } },
    });
    res.json(rows.map((c) => ({
      id: c.id, nationalIdMasked: maskNid(openNid(c.nationalIdEnc)), createdAt: c.createdAt, score: c.score, grade: rating.gradeFor(c.score).code, requestedAmount: c.requestedAmount, termMonths: c.termMonths,
      recommendedLimit: c.recommendedLimit, overrideReason: c.overrideReason, concurrentProviders: c.concurrentProviders, via: c.via,
      reviewedDecision: c.reviewedDecision, reviewedAt: c.reviewedAt, reviewNote: c.reviewNote, business: c.business,
      waitingHours: Math.round((Date.now() - c.createdAt.getTime()) / 3600_000),
    })));
  } catch (err) { next(err); }
});

// GET /admin/reviews/:id — everything an analyst needs to decide
router.get("/reviews/:id", async (req, res, next) => {
  try {
    const c = await prisma.creditCheck.findUnique({ where: { id: req.params.id }, include: { business: { select: { id: true, name: true, brandName: true, logoUrl: true } } } });
    if (!c) return res.status(404).json({ error: "استعلام یافت نشد" });
    const [facilities, others] = await Promise.all([
      listForPerson(c.nationalIdHash),
      prisma.creditCheck.findMany({ where: { nationalIdHash: c.nationalIdHash, id: { not: c.id } }, orderBy: { createdAt: "desc" }, take: 10, include: { business: { select: { name: true, brandName: true } } } }),
    ]);
    const src = c.sources || {};
    res.json({
      check: adminView({ ...c, sources: undefined }),
      grade: rating.gradeFor(c.score), band: rating.bandFor(c.score),
      loans: src.loans || null, checks: src.checks || null, services: src.services || [], ruleHits: src.ruleHits || [],
      overlaps: src.exposure?.overlaps || [], facilities, totals: rating.totals(facilities),
      otherInquiries: others.map((o) => ({ id: o.id, brand: o.business?.brandName || o.business?.name, score: o.score, decision: o.decision, requestedAmount: o.requestedAmount, createdAt: o.createdAt })),
    });
  } catch (err) { next(err); }
});

// POST /admin/reviews/:id/decide — the business is notified and its panel stops saying "waiting"
router.post("/reviews/:id/decide", async (req, res, next) => {
  try {
    const body = reviewDecision.parse(req.body);
    const c = await prisma.creditCheck.findUnique({ where: { id: req.params.id } });
    if (!c || c.decision !== "review") return res.status(404).json({ error: "استعلام در صف بررسی یافت نشد" });
    if (c.reviewedDecision) return res.status(409).json({ error: "برای این استعلام قبلاً تصمیم ثبت شده است" });
    // atomic: two admins pressing the button at once → exactly one wins
    const won = await prisma.creditCheck.updateMany({
      where: { id: c.id, reviewedDecision: null },
      data: {
        reviewedDecision: body.decision, reviewNote: body.note || null, reviewedAt: new Date(),
        recommendedLimit: body.decision === "decline" ? 0 : body.limit ?? c.recommendedLimit,
      },
    });
    if (!won.count) return res.status(409).json({ error: "برای این استعلام قبلاً تصمیم ثبت شده است" });
    await prisma.notification.create({
      data: {
        businessId: c.businessId,
        title: body.decision === "approve" ? "اعتبارسنجی پیشرفته: تأیید شد" : "اعتبارسنجی پیشرفته: رد شد",
        body: `نتیجهٔ بررسی تکمیلی استعلام شما (امتیاز ${c.score}) ${body.decision === "approve" ? "مثبت بود" : "منفی بود"}.${body.note ? ` توضیح: ${body.note}` : ""}`,
        level: body.decision === "approve" ? "success" : "danger",
        kind: "inquiry_reviewed", refId: c.id,
      },
    });
    require("../services/webhook.service").enqueue(c.businessId, "inquiry.reviewed", { inquiryId: c.id, decision: body.decision, note: body.note || null });
    logger.security(`بررسی تکمیلی ${c.id}: ${body.decision}`, { userId: req.auth.id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PATCH /admin/businesses/:id/landing { show } — opt a business in/out of the "companies that trust us" strip
router.patch("/businesses/:id/landing", async (req, res, next) => {
  try {
    const { show } = z.object({ show: z.boolean() }).parse(req.body);
    const b = await prisma.business.findUnique({ where: { id: req.params.id }, select: { status: true, logoUrl: true } });
    if (!b) return res.status(404).json({ error: "کسب‌وکار یافت نشد" });
    if (show && b.status !== "approved") return res.status(400).json({ error: "فقط کسب‌وکارِ تأییدشده در لندینگ نمایش داده می‌شود" });
    await prisma.business.update({ where: { id: req.params.id }, data: { showOnLanding: show } });
    res.json({ ok: true, showOnLanding: show, hasLogo: !!b.logoUrl });
  } catch (err) { next(err); }
});

/* --------------------------- business approval --------------------------- */

// GET /admin/businesses?status=pending_docs — the approval queue.
router.get("/businesses", async (req, res, next) => {
  try {
    const { status } = req.query;
    const [businesses, byDecision, agg] = await Promise.all([
      prisma.business.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: "desc" },
        include: { providerLink: true, _count: { select: { creditChecks: true } } }, // logoUrl is a plain column
      }),
      prisma.creditCheck.groupBy({ by: ["businessId", "decision"], _count: true }),
      prisma.creditCheck.groupBy({ by: ["businessId"], _avg: { score: true }, _sum: { requestedAmount: true }, _max: { createdAt: true } }),
    ]);
    // Per-business performance snapshot so the admin list can be sorted/filtered
    // by real activity instead of only by registration data.
    const stats = new Map();
    for (const a of agg) {
      stats.set(a.businessId, { approve: 0, review: 0, decline: 0, avgScore: a._avg.score ? Math.round(a._avg.score) : null, totalRequested: a._sum.requestedAmount || 0, lastCheckAt: a._max.createdAt });
    }
    for (const d of byDecision) {
      const st = stats.get(d.businessId);
      if (st) st[d.decision] = d._count;
    }
    res.json(businesses.map((b) => ({ ...b, stats: stats.get(b.id) || { approve: 0, review: 0, decline: 0, avgScore: null, totalRequested: 0, lastCheckAt: null } })));
  } catch (err) {
    next(err);
  }
});

const updateBusinessSchema = z.object({
  status: z.enum(["pending_docs", "pending_contract", "approved", "suspended", "rejected"]).optional(),
  contractSigned: z.boolean().optional(),
  rejectionReason: z.string().trim().max(500).optional(),
}).refine((b) => b.status !== "rejected" || (b.rejectionReason && b.rejectionReason.length >= 3), { message: "برای رد کردن کسب‌وکار، دلیل رد الزامی است", path: ["rejectionReason"] });

const STATUS_NOTICE = {
  approved: ["حساب شما فعال شد", "مدارک و قرارداد شما تأیید شد. از همین حالا می‌توانید استعلام ثبت کنید.", "success"],
  suspended: ["حساب شما تعلیق شد", "دسترسی حساب شما موقتاً محدود شده است. برای پیگیری با پشتیبانی تماس بگیرید.", "danger"],
  rejected: ["درخواست شما رد شد", "", "danger"],
  pending_contract: ["مدارک شما تأیید شد", "مرحلهٔ بعد: امضای قرارداد.", "info"],
};

// PATCH /admin/businesses/:id — approve, suspend, mark contract signed, etc.
router.patch("/businesses/:id", async (req, res, next) => {
  try {
    const body = updateBusinessSchema.parse(req.body);
    const data = { ...body };
    if (body.status === "approved") { data.isVerified = true; data.rejectionReason = null; }
    if (["suspended", "pending_docs", "rejected"].includes(body.status)) data.isVerified = false;
    if (body.status && body.status !== "rejected" && body.rejectionReason === undefined) data.rejectionReason = null;
    const business = await prisma.business.update({
      where: { id: req.params.id },
      data,
      include: { providerLink: true },
    });
    if (body.status && STATUS_NOTICE[body.status]) {
      const [title, text, level] = STATUS_NOTICE[body.status];
      await prisma.notification.create({ data: { businessId: business.id, title, body: body.status === "rejected" ? `دلیل رد: ${body.rejectionReason}` : text, level } });
    }
    // An approved business is a first-class reporting Provider. Provision the
    // link automatically so the business can submit events immediately after
    // approval; admins may still edit its name/status later.
    if (body.status === "approved" && !business.providerLink) {
      await prisma.provider.create({
        data: {
          name: business.name,
          integrationType: "realtime",
          status: "connected",
          businessId: business.id,
        },
      });
    }
    const result = await prisma.business.findUnique({
      where: { id: business.id },
      include: { providerLink: true },
    });
    res.json(result);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "کسب‌وکار یافت نشد" });
    next(err);
  }
});

/* ------------------------- system-wide credit checks ---------------------- */

// GET /admin/credit-checks?decision=review&businessId=... — every inquiry
// across every business, for oversight (the "وضعیت استعلام‌ها" view).
router.get("/credit-checks", async (req, res, next) => {
  try {
    const { decision, businessId } = req.query;
    const checks = await prisma.creditCheck.findMany({
      where: {
        decision: decision || undefined,
        businessId: businessId || undefined,
      },
      include: { business: { select: { name: true, mobile: true, logoUrl: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    res.json(checks.map((c) => adminView(c)));
  } catch (err) {
    next(err);
  }
});

// POST /admin/national-id/reveal { kind: check|facility|cheque, id } — the FULL national ID; every reveal is audit-logged
router.post("/national-id/reveal", async (req, res, next) => {
  try {
    const { kind, id } = z.object({ kind: z.enum(["check", "facility", "cheque", "defaulter", "event"]), id: z.string().min(5).max(40) }).parse(req.body);
    const model = { check: prisma.creditCheck, facility: prisma.facility, cheque: prisma.issuedCheque, defaulter: prisma.defaulter, event: prisma.providerEvent }[kind];
    const row = await model.findUnique({ where: { id }, select: kind === "defaulter" ? { nationalIdEnc: true, reportedByBusinessId: true } : kind === "event" ? { nationalIdEnc: true, providerId: true } : { nationalIdEnc: true, businessId: true } });
    if (!row) return res.status(404).json({ error: "رکورد یافت نشد" });
    const nid = openNid(row.nationalIdEnc);
    if (!nid) return res.status(404).json({ error: "کد ملی این رکورد ذخیره نشده است (ثبت‌شده پیش از نسخهٔ جدید)" });
    logger.security(`ادمین کد ملی کامل را مشاهده کرد (${kind})`, { userId: req.auth.id, meta: { kind, id, businessId: row.businessId || row.reportedByBusinessId || null } });
    res.json({ nationalId: nid });
  } catch (err) { next(err); }
});

/* ------------------------------ dashboard KPIs ---------------------------- */

// GET /admin/overview — the numbers for the admin dashboard's top cards.
router.get("/overview", async (req, res, next) => {
  try {
    const period = ["day", "month", "year"].includes(req.query.period) ? req.query.period : "day";
    const start = new Date();
    if (period === "year") start.setMonth(0, 1);
    else if (period === "month") start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const [pendingBusinesses, approvedBusinesses, totalChecksToday, decisionCounts] = await Promise.all([
      prisma.business.count({ where: { status: { in: ["pending_docs", "pending_contract"] } } }),
      prisma.business.count({ where: { status: "approved" } }),
      prisma.creditCheck.count({ where: { createdAt: { gte: start } } }),
      prisma.creditCheck.groupBy({ by: ["decision"], _count: true }),
    ]);

    const byDecision = { approve: 0, review: 0, decline: 0 };
    decisionCounts.forEach((d) => { byDecision[d.decision] = d._count; });

    res.json({ pendingBusinesses, approvedBusinesses, totalChecksToday, period, periodStart: start, byDecision });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ analytics ------------------------------- */

// GET /admin/analytics?days=30 — everything the advanced admin dashboard
// renders in one round-trip: KPIs, daily series, decision mix, score
// distribution, top businesses, anti-stacking alerts, provider health and
// the provider-event mix.
router.get("/analytics", async (req, res, next) => {
  try {
    const { days, start } = windowStart(req.query.days);
    const prev = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);

    const [checks, prevChecks, businesses, providers, eventMix] = await Promise.all([
      prisma.creditCheck.findMany({ where: { createdAt: { gte: start } }, include: { business: { select: { name: true, logoUrl: true } } }, orderBy: { createdAt: "desc" }, take: 20000 }),
      prisma.creditCheck.findMany({ where: { createdAt: { gte: prev, lt: start } }, select: { decision: true, score: true, requestedAmount: true, recommendedLimit: true, concurrentProviders: true }, take: 20000 }),
      prisma.business.findMany({ select: { id: true, name: true, status: true, createdAt: true, logoUrl: true } }),
      prisma.provider.findMany({ orderBy: { name: "asc" }, include: { business: { select: { logoUrl: true, name: true } } } }),
      prisma.providerEvent.groupBy({ by: ["eventType"], where: { createdAt: { gte: start } }, _count: true }),
    ]);

    const perBusiness = new Map();
    for (const c of checks) {
      const row = perBusiness.get(c.businessId) || { id: c.businessId, name: c.business?.name || "—", logoUrl: c.business?.logoUrl || null, total: 0, approve: 0, review: 0, decline: 0, amount: 0 };
      row.total += 1;
      row[c.decision] += 1;
      row.amount += c.requestedAmount;
      perBusiness.set(c.businessId, row);
    }
    const topBusinesses = [...perBusiness.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
      .map((r) => ({ ...r, approvalRate: r.total ? Math.round((r.approve / r.total) * 100) : 0 }));

    const businessStatus = { pending_docs: 0, pending_contract: 0, approved: 0, suspended: 0, rejected: 0 };
    businesses.forEach((b) => { businessStatus[b.status] += 1; });

    res.json({
      periodDays: days,
      kpis: summarize(checks),
      previous: summarize(prevChecks),
      series: buildSeries(checks, days),
      scoreBuckets: scoreBuckets(checks),
      topBusinesses,
      alerts: checks.filter(isAlert).slice(0, 8).map((c) => ({
        id: c.id, business: c.business?.name || "—", score: c.score, decision: c.decision,
        requestedAmount: c.requestedAmount, concurrentProviders: c.concurrentProviders,
        totalExternalExposure: c.totalExternalExposure, overrideReason: c.overrideReason, createdAt: c.createdAt,
      })),
      businessStatus,
      newBusinesses: businesses.filter((b) => b.createdAt >= start).length,
      providers: providers.map((p) => ({
        id: p.id, name: p.name, status: p.status, integrationType: p.integrationType,
        dataQuality: p.dataQuality, latencyMs: p.latencyMs, errorRate: p.errorRate, lastSyncAt: p.lastSyncAt,
        businessId: p.businessId, logoUrl: p.business?.logoUrl || null,
      })),
      byBusiness: [...perBusiness.values()].sort((a, b) => b.total - a.total).map((r) => ({ ...r, approvalRate: r.total ? Math.round((r.approve / r.total) * 100) : 0 })),
      services: await prisma.externalService.findMany({ select: { id: true, key: true, name: true, enabled: true, status: true, unit: true } }),
      eventMix: eventMix.map((e) => ({ type: e.eventType, count: e._count })),
    });
  } catch (err) {
    next(err);
  }
});


/* ------------------------------ support inbox ------------------------------ */

router.get("/support/tickets", async (req, res, next) => {
  try {
    const { status } = req.query;
    const rows = await prisma.supportTicket.findMany({
      where: status ? { status } : undefined,
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { business: { select: { id: true, name: true, logoUrl: true, mobile: true } }, messages: { orderBy: { createdAt: "asc" }, include: { attachments: { select: { id: true, fileName: true, mime: true, sizeBytes: true } } } } },
    });
    res.json(rows);
  } catch (err) { next(err); }
});

router.post("/support/tickets/:id/reply", async (req, res, next) => {
  try {
    const { body, close, attachmentIds } = z.object({ body: z.string().trim().min(1).max(4000), close: z.boolean().optional(), attachmentIds: z.array(z.string().max(40)).max(3).optional() }).parse(req.body);
    const t = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!t) return res.status(404).json({ error: "تیکت یافت نشد" });
    const msg = await prisma.ticketMessage.create({ data: { ticketId: t.id, sender: "admin", body } });
    await attachments.claim(attachmentIds || [], msg.id, { role: "admin", id: req.auth.id });
    await prisma.$transaction([
      prisma.supportTicket.update({ where: { id: t.id }, data: { status: close ? "closed" : "answered" } }),
      prisma.notification.create({ data: { businessId: t.businessId, title: "پاسخ جدید پشتیبانی", body: `به تیکت «${t.subject}» پاسخ داده شد.`, level: "info" } }),
    ]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// attachments (admin side): upload + download
router.post("/support/attachments", express.json({ limit: "9mb" }), async (req, res, next) => {
  try {
    const { fileName, dataBase64 } = z.object({ fileName: z.string().max(200), dataBase64: z.string().min(20) }).parse(req.body);
    res.status(201).json(attachments.view(await attachments.saveUpload({ role: "admin", id: req.auth.id, fileName, dataBase64 })));
  } catch (err) { next(err); }
});
router.get("/support/attachments/:id", async (req, res, next) => {
  try {
    const a = await prisma.ticketAttachment.findUnique({ where: { id: req.params.id } });
    if (!a) return res.status(404).json({ error: "فایل یافت نشد" });
    attachments.sendFile(a, res, next);
  } catch (err) { next(err); }
});

router.patch("/support/tickets/:id", async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(["open", "answered", "closed"]) }).parse(req.body);
    res.json(await prisma.supportTicket.update({ where: { id: req.params.id }, data: { status } }));
  } catch (err) { next(err); }
});

/* ------------------------------- notifications ------------------------------ */

// POST /admin/notifications — fan out one row per recipient (all approved businesses or a chosen list)
router.post("/notifications", async (req, res, next) => {
  try {
    const body = z.object({
      title: z.string().trim().min(2).max(100),
      body: z.string().trim().min(2).max(1000),
      level: z.enum(["info", "success", "warning", "danger"]).default("info"),
      businessIds: z.array(z.string()).optional(), // omitted/empty => every non-rejected business
    }).parse(req.body);
    const targets = await prisma.business.findMany({
      where: { ...(body.businessIds?.length ? { id: { in: body.businessIds } } : { status: { not: "rejected" } }) },
      select: { id: true },
    });
    if (!targets.length) return res.status(400).json({ error: "گیرنده‌ای یافت نشد" });
    await prisma.notification.createMany({ data: targets.map((t) => ({ businessId: t.id, title: body.title, body: body.body, level: body.level })) });
    res.status(201).json({ sent: targets.length });
  } catch (err) { next(err); }
});

router.get("/notifications", async (req, res, next) => {
  try {
    const rows = await prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { business: { select: { name: true } } } });
    // group the fan-out back into "campaigns" for the admin history view
    const groups = new Map();
    for (const n of rows) {
      const k = `${n.title}|${n.body}|${n.createdAt.toISOString().slice(0, 16)}`;
      const g = groups.get(k) || { title: n.title, body: n.body, level: n.level, createdAt: n.createdAt, recipients: 0, read: 0 };
      g.recipients += 1;
      if (n.readAt) g.read += 1;
      groups.set(k, g);
    }
    res.json([...groups.values()].slice(0, 50));
  } catch (err) { next(err); }
});

/* ----------------------------- external data services ----------------------------- */

const kv = z.array(z.object({ name: z.string().trim().min(1).max(60), value: z.string().max(400) })).max(20);
const outputDef = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,30}$/, "کلید خروجی فقط حروف کوچک انگلیسی، عدد و _ باشد"),
  label: z.string().trim().max(60).optional(),
  path: z.string().trim().min(1, "مسیر مقدار در پاسخ JSON را وارد کنید").max(160),
  type: z.enum(["number", "count", "boolean", "text"]).default("number"),
});
const impactDef = z.object({
  enabled: z.boolean().default(false),
  output: z.string().max(30).optional(),
  mode: z.enum(["per_unit", "threshold"]).default("per_unit"),
  perUnit: z.number().min(0).max(300).optional(),
  cap: z.number().min(0).max(900).optional(),
  threshold: z.number().min(0).optional(),
  points: z.number().min(0).max(900).optional(),
  label: z.string().trim().max(100).optional(),
});
const bodyOk = (t) => { if (!t) return true; try { JSON.parse(t.replace(/\{\{\s*(nationalId|birthDate|now)\s*\}\}/g, "x")); return true; } catch { return false; } };

const serviceSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{2,40}$/, "کلید فقط شامل حروف انگلیسی کوچک، عدد، - و _ باشد (حداقل ۲ کاراکتر)"),
  name: z.string().trim().min(2, "نام سرویس را وارد کنید").max(80),
  description: z.string().max(300).optional(),
  category: z.string().max(40).optional(),
  baseUrl: z.string().trim().url("آدرس سرویس معتبر نیست").refine((u) => /^https?:\/\//.test(u), "آدرس باید با http یا https شروع شود"),
  method: z.enum(["GET", "POST"]).default("GET"),
  authType: z.enum(["bearer", "header", "query", "basic", "none"]).default("bearer"),
  authName: z.string().max(60).optional(),
  apiKey: z.string().max(500).optional(), // write-only (basic auth: "user:password")
  headers: kv.optional(),
  nationalIdParam: z.string().max(60).default("nationalId"),
  queryParams: kv.optional(),
  bodyTemplate: z.string().max(4000).refine(bodyOk, "قالب بدنه JSON معتبر نیست (جایگزین‌ها: {{nationalId}} {{birthDate}} {{now}})").optional(),
  outputs: z.array(outputDef).min(1, "حداقل یک خروجی تعریف کنید").max(8).optional(),
  scoreImpact: impactDef.optional(),
  timeoutMs: z.number().int().min(1000).max(20000).default(6000),
  unit: z.string().max(30).optional(),
  enabled: z.boolean().optional(),
});
const MASK = "••••••••";
const publicService = ({ apiKeyEnc, headersEnc, ...rest }) => {
  let headers = [];
  try { headers = JSON.parse(decrypt(headersEnc) || "[]").map((h) => ({ name: h.name, value: MASK })); } catch { /* unreadable → none */ }
  return { ...rest, headers, hasKey: !!apiKeyEnc, apiKey: mask(apiKeyEnc) };
};
const storedHeaders = (svc) => { try { return JSON.parse(decrypt(svc?.headersEnc) || "[]"); } catch { return []; } };
// "••••••••" in an edited header means "keep the stored value of the header with this name".
const mergeHeaders = (incoming, svc) => {
  const old = new Map(storedHeaders(svc).map((h) => [h.name, h.value]));
  return (incoming || []).map((h) => ({ name: h.name, value: h.value === MASK ? old.get(h.name) ?? "" : h.value }));
};

// Flatten a JSON response into clickable "path → value" rows for the path picker (max 80).
function flatten(json, max = 80) {
  const out = [];
  const walk = (v, path, depth) => {
    if (out.length >= max || depth > 6) return;
    if (Array.isArray(v)) { out.push({ path, value: `آرایه با ${v.length} آیتم`, type: "count" }); v.slice(0, 3).forEach((x, i) => walk(x, `${path}[${i}]`, depth + 1)); }
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k, depth + 1);
    else out.push({ path, value: v, type: typeof v === "number" ? "number" : typeof v === "boolean" ? "boolean" : "text" });
  };
  walk(json, "", 0);
  return out.filter((r) => r.path);
}
const consoleView = (r) => ({ ok: r.ok, status: r.status, ms: r.ms, error: r.error || null, preview: r.preview, sample: r.sample || null, outputs: r.outputs, paths: r.json ? flatten(r.json) : [] });

router.get("/services", async (req, res, next) => {
  try {
    res.json((await prisma.externalService.findMany({ orderBy: { createdAt: "desc" } })).map(publicService));
  } catch (err) { next(err); }
});

router.post("/services", async (req, res, next) => {
  try {
    const { apiKey, headers, ...data } = serviceSchema.parse(req.body);
    const created = await prisma.externalService.create({ data: { ...data, apiKeyEnc: encrypt(apiKey), headersEnc: headers?.length ? encrypt(JSON.stringify(headers)) : null } });
    logger.security(`سرویس بیرونی «${created.name}» اضافه شد`, { userId: req.auth.id });
    res.status(201).json(publicService(created));
  } catch (err) {
    if (err.code === "P2002") return res.status(409).json({ error: "این کلید سرویس قبلاً ثبت شده است" });
    next(err);
  }
});

router.patch("/services/:id", async (req, res, next) => {
  try {
    const { apiKey, headers, key: _ignored, ...data } = serviceSchema.partial().parse(req.body);
    const old = await prisma.externalService.findUnique({ where: { id: req.params.id } });
    if (!old) return res.status(404).json({ error: "سرویس یافت نشد" });
    const patch = { ...data };
    if (apiKey) patch.apiKeyEnc = encrypt(apiKey); // empty/omitted keeps the stored key
    if (headers) { const merged = mergeHeaders(headers, old); patch.headersEnc = merged.length ? encrypt(JSON.stringify(merged)) : null; }
    res.json(publicService(await prisma.externalService.update({ where: { id: req.params.id }, data: patch })));
  } catch (err) { next(err); }
});

router.delete("/services/:id", async (req, res, next) => {
  try {
    const s = await prisma.externalService.delete({ where: { id: req.params.id } });
    await prisma.customRule.deleteMany({ where: { metric: { startsWith: `service:${s.key}` } } }); // rules on a removed source are meaningless
    res.json({ ok: true });
  } catch (err) { next(err); }
});

const testInput = z.object({
  nationalId: z.string().regex(/^\d{10}$/, "کد ملی ۱۰ رقمی وارد کنید"),
  birthDate: z.string().max(12).optional(),
});

// POST /admin/services/preview { draft, nationalId, birthDate?, serviceId? } — test a configuration BEFORE saving it
router.post("/services/preview", async (req, res, next) => {
  try {
    const { nationalId, birthDate } = testInput.parse(req.body);
    const draft = serviceSchema.partial().parse(req.body.draft || {});
    if (!draft.baseUrl) return res.status(400).json({ error: "آدرس سرویس را وارد کنید" });
    const old = req.body.serviceId ? await prisma.externalService.findUnique({ where: { id: String(req.body.serviceId) } }) : null;
    const cfg = {
      ...draft, method: draft.method || "GET", authType: draft.authType || "bearer", nationalIdParam: draft.nationalIdParam || "nationalId",
      apiKey: draft.apiKey || (old ? decrypt(old.apiKeyEnc) : null), headers: mergeHeaders(draft.headers, old), timeoutMs: draft.timeoutMs || 6000,
      outputs: draft.outputs && draft.outputs.length ? draft.outputs : undefined, name: draft.name || "پیش‌نمایش", responsePath: "data.count",
    };
    const r = await performCall(cfg, { nationalId, birthDate: birthDate || "", now: new Date().toISOString() });
    res.json(consoleView(r));
  } catch (err) { next(err); }
});

// POST /admin/services/:id/test { nationalId, birthDate? } — live call with the stored credentials; saves the result
router.post("/services/:id/test", async (req, res, next) => {
  try {
    const { nationalId, birthDate } = testInput.parse(req.body);
    const svc = await prisma.externalService.findUnique({ where: { id: req.params.id } });
    if (!svc) return res.status(404).json({ error: "سرویس یافت نشد" });
    const r = await performCall(hydrate(svc), { nationalId, birthDate: birthDate || "", now: new Date().toISOString() });
    await prisma.externalService.update({ where: { id: svc.id }, data: { status: r.ok ? "connected" : "error", lastTestAt: new Date(), lastError: r.ok ? null : r.error, lastLatencyMs: r.ms, lastStatusCode: r.status, lastSample: r.sample || null } });
    res.json(consoleView(r));
  } catch (err) { next(err); }
});

/* ------------------------------- system / partner health ------------------------------ */

// GET /admin/system-health[?probe=0] — status of the database, api.ir, Ontime24, Zarinpal, Telegram and every
// admin-connected partner service. Live probes are cached for 20 s so the page can poll without hammering partners.
let healthCache = { at: 0, data: null };
router.get("/system-health", async (req, res, next) => {
  try {
    const fresh = req.query.fresh === "1";
    if (!fresh && healthCache.data && Date.now() - healthCache.at < 20_000) return res.json(healthCache.data);
    const data = await require("../services/serviceStatus").snapshot({ probe: req.query.probe !== "0" });
    healthCache = { at: Date.now(), data };
    res.json(data);
  } catch (err) { next(err); }
});

// POST /admin/services/test-all — one live test of every enabled partner service (admin picks the national ID to use).
router.post("/services/test-all", async (req, res, next) => {
  try {
    const { nationalId, birthDate } = testInput.parse(req.body);
    const all = await prisma.externalService.findMany({ where: { enabled: true } });
    const out = [];
    for (const svc of all) {
      const r = await performCall(hydrate(svc), { nationalId, birthDate: birthDate || "", now: new Date().toISOString() });
      await prisma.externalService.update({ where: { id: svc.id }, data: { status: r.ok ? "connected" : "error", lastTestAt: new Date(), lastError: r.ok ? null : r.error, lastLatencyMs: r.ms, lastStatusCode: r.status, lastSample: r.sample || null } });
      out.push({ id: svc.id, name: svc.name, ok: r.ok, ms: r.ms, status: r.status, error: r.error || null });
    }
    healthCache = { at: 0, data: null };
    res.json({ tested: out.length, ok: out.filter((x) => x.ok).length, results: out });
  } catch (err) { next(err); }
});

/* -------------------------------- defaulter registry ------------------------------- */

router.get("/defaulters", async (req, res, next) => {
  try {
    const rows = await prisma.defaulter.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    const names = new Map((await prisma.business.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.reportedByBusinessId))] } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
    res.json(rows.map((d) => ({ id: d.id, ref: d.nationalIdHash.slice(0, 8), nationalIdMasked: maskNid(openNid(d.nationalIdEnc)), kind: d.kind, amount: d.amount, reason: d.reason, status: d.status, reportedBy: names.get(d.reportedByBusinessId) || "—", createdAt: d.createdAt, resolvedAt: d.resolvedAt })));
  } catch (err) { next(err); }
});

router.post("/defaulters/:id/resolve", async (req, res, next) => {
  try {
    res.json(await prisma.defaulter.update({ where: { id: req.params.id }, data: { status: "settled", resolvedAt: new Date() } }));
  } catch (err) { next(err); }
});

/* ---------------------------- provider management -------------------------- */

const updateProviderSchema = z.object({
  businessId: z.string().nullable().optional(),
  name: z.string().min(1).optional(),
  status: z.enum(["connected", "degraded", "disconnected"]).optional(),
  integrationType: z.enum(["batch", "realtime"]).optional(),
});

// PATCH /admin/providers/:id — mainly for linking a Provider row to a
// Business account (replaces doing this by hand in Prisma Studio).
router.patch("/providers/:id", async (req, res, next) => {
  try {
    const body = updateProviderSchema.parse(req.body);
    if (body.businessId) {
      const already = await prisma.provider.findUnique({ where: { businessId: body.businessId } });
      if (already && already.id !== req.params.id) {
        return res.status(409).json({ error: "این کسب‌وکار از قبل به یک Provider دیگر متصل است" });
      }
    }
    const provider = await prisma.provider.update({ where: { id: req.params.id }, data: body });
    res.json(provider);
  } catch (err) {
    if (err.code === "P2025") return res.status(404).json({ error: "Provider یافت نشد" });
    next(err);
  }
});

const createProviderSchema = z.object({
  name: z.string().min(1),
  integrationType: z.enum(["batch", "realtime"]).default("batch"),
  businessId: z.string().nullable().optional(),
});

// POST /admin/providers — register a brand-new Provider (e.g. a business
// that itself supplies data, like a BNPL company signing up).
router.post("/providers", async (req, res, next) => {
  try {
    const body = createProviderSchema.parse(req.body);
    const provider = await prisma.provider.create({ data: body });
    res.status(201).json(provider);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
