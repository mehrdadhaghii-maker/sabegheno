// Public REST API for businesses (X-API-Key). Lets a company's own system ask Sabegheno for an inquiry in
// real time and push credit / settlement updates — no manual data entry.
const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const { inquiryInput, performInquiry, awaitingAdvancedReview, effectiveDecision } = require("../services/inquiry.service");
const F = require("../services/facility.service");
const C = require("../services/cheque.service");
const rating = require("../services/rating.service");
const { hashNationalId } = require("../utils/crypto");

const router = express.Router();

const brandOf = async (id) => F.brandOf(await prisma.business.findUnique({ where: { id }, select: { brandName: true, name: true } }));
const facView = (row, brand) => ({ ...rating.describeFacility(row, brand), ...F.ownerIdFields(row), externalRef: row.externalRef, lastSyncedAt: row.lastSyncedAt });

// A compact, integration-friendly answer — raw third-party data (loans / checks) is never exposed.
function inquiryView(c, report) {
  return {
    id: c.id,
    decision: effectiveDecision(c),                 // approve | review | decline
    awaitingAdvancedReview: awaitingAdvancedReview(c),
    score: c.score, grade: rating.gradeFor(c.score).code, riskLevel: c.riskLevel,
    recommendedLimit: c.recommendedLimit, recommendedTermMonths: c.recommendedTermMonths,
    reasons: c.overrideReason || null,
    overlaps: (report?.overlaps || c.sources?.exposure?.overlaps || []).map((o) => ({ brand: o.brand, at: o.lastAt })),
    facilities: report?.facilities, totals: report?.totals,
    createdAt: c.createdAt,
  };
}

router.get("/ping", async (req, res, next) => {
  try { res.json({ ok: true, business: await brandOf(req.auth.id), time: new Date().toISOString() }); } catch (e) { next(e); }
});

// POST /v1/inquiries { nationalId, requestedAmount, termMonths, customerBirthDate? (Jalali 1371/5/12) }
router.post("/inquiries", async (req, res, next) => {
  try {
    const out = await performInquiry({ businessId: req.auth.id, body: inquiryInput.parse(req.body), via: "api" });
    res.status(201).json(inquiryView(out, out.report));
  } catch (e) { next(e); }
});

router.get("/inquiries/:id", async (req, res, next) => {
  try {
    const c = await prisma.creditCheck.findFirst({ where: { id: req.params.id, businessId: req.auth.id } });
    if (!c) return res.status(404).json({ error: "استعلام یافت نشد" });
    const facilities = await F.listForPerson(c.nationalIdHash);
    res.json(inquiryView(c, { facilities, totals: rating.totals(facilities) })); // decision may have changed after an admin review
  } catch (e) { next(e); }
});

// POST /v1/facilities — create or update (idempotent when externalRef is sent)
router.post("/facilities", async (req, res, next) => {
  try {
    const row = await F.upsert(req.auth.id, F.facilityInput.parse(req.body), "api");
    res.status(201).json(facView(await F.getOne(req.auth.id, { id: row.id }), await brandOf(req.auth.id)));
  } catch (e) { next(e); }
});

// POST /v1/facilities/bulk { items: [...up to 200] } — nightly sync; each item succeeds or fails on its own
router.post("/facilities/bulk", async (req, res, next) => {
  try {
    const { items } = z.object({ items: z.array(z.unknown()).min(1).max(200) }).parse(req.body);
    res.json(await F.bulkUpsert(req.auth.id, items, "api"));
  } catch (e) { next(e); }
});

// POST /v1/facilities/:externalRef/settle { settledAt? } — takes effect immediately
router.post("/facilities/:externalRef/settle", async (req, res, next) => {
  try {
    const { settledAt } = F.settleInput.parse(req.body || {});
    const out = await F.settle(req.auth.id, { externalRef: req.params.externalRef }, settledAt, "api");
    if (!out) return res.status(404).json({ error: "اعتبار با این externalRef یافت نشد" });
    res.json({ ...facView(out.facility, await brandOf(req.auth.id)), releasedDefault: out.releasedDefault });
  } catch (e) { next(e); }
});

// POST /v1/facilities/:externalRef/installments/:seq/pay { paidAt?, paidAmount? } — the last installment settles the facility
router.post("/facilities/:externalRef/installments/:seq/pay", async (req, res, next) => {
  try {
    const out = await F.payInstallment(req.auth.id, { externalRef: req.params.externalRef }, Number(req.params.seq), F.payInput.parse(req.body || {}), "api");
    if (!out) return res.status(404).json({ error: "اعتبار با این externalRef یافت نشد" });
    if (out.error) return res.status(404).json({ error: out.error });
    res.json({ ...facView(out.facility, await brandOf(req.auth.id)), releasedDefault: out.releasedDefault, settledNow: out.settled });
  } catch (e) { next(e); }
});

// ---- in-transit cheques ("چک‌های در راه") ----
router.post("/cheques", async (req, res, next) => { try { res.status(201).json(C.view(await C.upsert(req.auth.id, C.chequeInput.parse(req.body)))); } catch (e) { next(e); } });
router.post("/cheques/:externalRef/status", async (req, res, next) => {
  try {
    const { status, at } = C.statusInput.parse(req.body);
    const row = await C.setStatus(req.auth.id, { externalRef: req.params.externalRef }, status, at);
    if (!row) return res.status(404).json({ error: "چک با این externalRef یافت نشد" });
    res.json(C.view(row));
  } catch (e) { next(e); }
});
// about to accept a cheque? how many has this person already put into circulation? (totals only)
router.post("/cheques/lookup", async (req, res, next) => { try { res.json(await C.lookup(C.lookupInput.parse(req.body).nationalId)); } catch (e) { next(e); } });
router.get("/cheques", async (req, res, next) => { try { res.json((await C.listForBusiness(req.auth.id)).map(C.view)); } catch (e) { next(e); } });

router.get("/facilities", async (req, res, next) => {
  try {
    const nid = req.query.nationalId;
    const where = { businessId: req.auth.id, ...(nid ? { nationalIdHash: hashNationalId(String(nid)) } : {}) };
    const brand = await brandOf(req.auth.id);
    res.json((await prisma.facility.findMany({ where, include: { installments: { orderBy: { seq: "asc" } } }, orderBy: { createdAt: "desc" }, take: 200 })).map((r) => facView(r, brand)));
  } catch (e) { next(e); }
});

module.exports = router;
