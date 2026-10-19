const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const { requireAuth, requireRole, requireApprovedBusiness } = require("../middleware/auth");
const { hashNationalId } = require("../utils/crypto");
const { runCreditCheck } = require("../services/scoring.service");
const { inquiryInput, performInquiry, awaitingAdvancedReview, effectiveDecision } = require("../services/inquiry.service");
const { listForPerson } = require("../services/facility.service");
const rating = require("../services/rating.service");
const { ownerView, openNid, maskNid } = require("../utils/nid");
const { getOrCreateReport } = require("../services/payment.service");
const { getOrCreateGlobalPolicy } = require("./policy.routes");
const { windowStart, buildSeries, summarize, scoreBuckets, isAlert } = require("../services/analytics.service");

const router = express.Router();

// What the business sees: a "review" decision stays "waiting for advanced validation"
// until one of our admins has decided it.
const present = (c) => ({ ...ownerView(c), awaitingReview: awaitingAdvancedReview(c), finalDecision: effectiveDecision(c) });

// POST /credit-checks  — the "استعلام جدید" flow. Business-only (the API-key flow shares performInquiry).
router.post("/", requireAuth, requireRole("business"), requireApprovedBusiness, async (req, res, next) => {
  try {
    const body = inquiryInput.parse(req.body);
    const out = await performInquiry({ businessId: req.auth.id, body, via: "panel" });
    res.status(201).json(present(out));
  } catch (err) {
    next(err);
  }
});

// GET /credit-checks  — "تاریخچه استعلام‌ها" for the logged-in business.
router.get("/", requireAuth, requireRole("business"), async (req, res, next) => {
  try {
    const checks = await prisma.creditCheck.findMany({
      where: { businessId: req.auth.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    res.json(checks.map(present));
  } catch (err) {
    next(err);
  }
});


// GET /credit-checks/stats?days=30 — numbers for the business dashboard.
// Must stay above "/:id" so "stats" is never treated as an id.
router.get("/stats", requireAuth, requireRole("business"), async (req, res, next) => {
  try {
    const { days, start } = windowStart(req.query.days);
    const checks = await prisma.creditCheck.findMany({
      where: { businessId: req.auth.id, createdAt: { gte: start } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });
    res.json({
      periodDays: days,
      kpis: summarize(checks),
      series: buildSeries(checks, days),
      scoreBuckets: scoreBuckets(checks),
      alerts: checks.filter(isAlert).slice(0, 6).map((c) => ({
        id: c.id, score: c.score, decision: c.decision, awaitingReview: awaitingAdvancedReview(c), finalDecision: effectiveDecision(c), requestedAmount: c.requestedAmount,
        concurrentProviders: c.concurrentProviders, totalExternalExposure: c.totalExternalExposure,
        overrideReason: c.overrideReason, createdAt: c.createdAt,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /credit-checks/me/report — the "کاربر" self-report. The person has already proven (OTP + Shahkar)
// that this mobile belongs to this national ID; the report itself is paid for through the gateway.
router.get("/me/report", requireAuth, requireRole("user"), async (req, res, next) => {
  try {
    const out = await getOrCreateReport(req.auth.id, () => runCreditCheck({ nationalId: null, nationalIdHash: req.auth.nationalIdHash, requestedAmount: 0, businessId: null }));
    if (!out) return res.status(402).json({ error: "هر استعلام ۱۵ هزار تومان هزینه دارد؛ برای مشاهدهٔ گزارش ابتدا پرداخت کنید", code: "PAYMENT_REQUIRED" });
    const me = await prisma.endUser.findUnique({ where: { id: req.auth.id }, select: { nationalIdEnc: true } });
    const nid = openNid(me?.nationalIdEnc);
    res.json({ ...out, customer: { nationalId: nid, nationalIdMasked: maskNid(nid) } });
  } catch (err) {
    next(err);
  }
});

// GET /credit-checks/:id — the full "Credit Map" detail for one check.
router.get("/:id", requireAuth, requireRole("business"), async (req, res, next) => {
  try {
    const check = await prisma.creditCheck.findFirst({
      where: { id: req.params.id, businessId: req.auth.id },
    });
    if (!check) return res.status(404).json({ error: "استعلام یافت نشد" });
    res.json(present(check));
  } catch (err) {
    next(err);
  }
});

// GET /credit-checks/:id/report — the full report of one inquiry. Facilities and overlaps are LIVE
// (a settlement made after the inquiry shows up right away); the score is the one decided at inquiry time.
router.get("/:id/report", requireAuth, requireRole("business"), async (req, res, next) => {
  try {
    const check = await prisma.creditCheck.findFirst({ where: { id: req.params.id, businessId: req.auth.id }, include: { business: { select: { name: true, brandName: true, logoUrl: true } } } });
    if (!check) return res.status(404).json({ error: "استعلام یافت نشد" });
    const facilities = await listForPerson(check.nationalIdHash);
    const src = check.sources || {};
    res.json({
      check: present({ ...check, business: undefined }),
      business: check.business,
      customer: { nationalId: openNid(check.nationalIdEnc), nationalIdMasked: maskNid(openNid(check.nationalIdEnc)) },
      report: {
        score: check.score, externalScore: src.externalScore ?? null, platformScore: src.platformScore ?? null,
        breakdown: src.breakdown || null, inquiries: src.inquiries || null, warnings: src.warnings || [],
        grade: rating.gradeFor(check.score), band: rating.bandFor(check.score),
        facilities, totals: rating.totals(facilities),
        overlaps: src.exposure?.overlaps || [], nearSimultaneous: !!src.exposure?.nearSimultaneous,
        loans: src.loans || null, checks: src.checks || null, services: src.services || [], ruleHits: src.ruleHits || [],
        generatedAt: check.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
