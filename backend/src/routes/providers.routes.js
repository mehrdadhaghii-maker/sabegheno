const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const { requireAuth, requireRole, requireApprovedBusiness } = require("../middleware/auth");
const { hashNationalId } = require("../utils/crypto");
const { sealNid, openNid, maskNid } = require("../utils/nid");

const router = express.Router();

const reportEventSchema = z.object({
  nationalId: z.string().min(10).max(10),
  eventType: z.enum(["new_commitment", "settled", "delay", "bounced_check", "bad_debt"]),
  amount: z.number().int().nonnegative().default(0),
  delayDays: z.number().int().nonnegative().default(0),
  note: z.string().optional(),
  settleDefault: z.boolean().optional(), // "settled defaulter": lifts this business's own active default flag
});

const eventTypeMap = {
  new_commitment: "commitment_created",
  settled: "settled",
  delay: "delay",
  bounced_check: "bounced_check",
  bad_debt: "bad_debt",
};

// POST /providers/report — "ثبت گزارش کسب‌وکار" screen posts here.
// This is the write side of the anti-stacking pipeline: every event a
// business reports becomes visible to every other provider's stacking check.
router.post("/report", requireAuth, requireRole("business"), requireApprovedBusiness, async (req, res, next) => {
  try {
    const body = reportEventSchema.parse(req.body);

    let provider = await prisma.provider.findUnique({ where: { businessId: req.auth.id } });
    if (!provider) {
      const business = await prisma.business.findUnique({ where: { id: req.auth.id } });
      if (!business || business.status !== "approved") {
        return res.status(400).json({ error: "این کسب‌وکار هنوز به‌عنوان Provider ثبت نشده است" });
      }
      provider = await prisma.provider.create({
        data: { name: business.name, integrationType: "realtime", status: "connected", businessId: business.id },
      });
    }

    const event = await prisma.providerEvent.create({
      data: {
        providerId: provider.id,
        nationalIdHash: hashNationalId(body.nationalId),
        nationalIdEnc: sealNid(body.nationalId),
        eventType: eventTypeMap[body.eventType],
        amount: body.amount,
        delayDays: body.delayDays,
        note: body.note,
      },
    });

    // Defaulter registry: a reported default/bounced cheque blocks the person
    // at EVERY business until the reporting business marks it settled.
    const hash = hashNationalId(body.nationalId);
    if (body.eventType === "bad_debt" || body.eventType === "bounced_check") {
      await prisma.defaulter.create({ data: { nationalIdHash: hash, nationalIdEnc: sealNid(body.nationalId), reportedByBusinessId: req.auth.id, kind: body.eventType, amount: body.amount, reason: body.note } });
    } else if (body.eventType === "settled" && body.settleDefault) {
      await prisma.defaulter.updateMany({ where: { nationalIdHash: hash, reportedByBusinessId: req.auth.id, status: "active" }, data: { status: "settled", resolvedAt: new Date() } });
    }

    res.status(201).json(event);
  } catch (err) {
    next(err);
  }
});

// POST /providers/defaulters/:id/national-id — same idea for older defaulter rows (accepted only if it matches the hash).
router.post("/defaulters/:id/national-id", requireAuth, requireRole("business"), async (req, res, next) => {
  try {
    const { nationalId } = z.object({ nationalId: z.string().regex(/^\d{10}$/, "کد ملی باید ۱۰ رقم باشد") }).parse(req.body);
    const d = await prisma.defaulter.findFirst({ where: { id: req.params.id, reportedByBusinessId: req.auth.id } });
    if (!d) return res.status(404).json({ error: "رکورد یافت نشد" });
    if (hashNationalId(nationalId) !== d.nationalIdHash) return res.status(422).json({ error: "این کد ملی با کد ملی ثبت‌شده مطابقت ندارد" });
    await prisma.defaulter.update({ where: { id: d.id }, data: { nationalIdEnc: sealNid(nationalId) } });
    res.json({ ok: true, nationalId });
  } catch (err) { next(err); }
});

// GET /providers/defaulters/mine — defaults THIS business reported (it alone can lift them).
router.get("/defaulters/mine", requireAuth, requireRole("business"), async (req, res, next) => {
  try {
    const rows = await prisma.defaulter.findMany({ where: { reportedByBusinessId: req.auth.id }, orderBy: { createdAt: "desc" }, take: 100 });
    res.json(rows.map((d) => { const n = openNid(d.nationalIdEnc); return { id: d.id, kind: d.kind, amount: d.amount, reason: d.reason, status: d.status, createdAt: d.createdAt, resolvedAt: d.resolvedAt, ref: d.nationalIdHash.slice(0, 6), nationalId: n, nationalIdMasked: maskNid(n) }; }));
  } catch (err) { next(err); }
});

// POST /providers/report/bulk — accepts up to 1,000 validated rows from a CSV importer.
router.post("/report/bulk", requireAuth, requireRole("business"), requireApprovedBusiness, async (req, res, next) => {
  try {
    const body = z.object({ rows: z.array(reportEventSchema).min(1).max(1000) }).parse(req.body);
    let provider = await prisma.provider.findUnique({ where: { businessId: req.auth.id } });
    if (!provider) {
      const business = await prisma.business.findUnique({ where: { id: req.auth.id } });
      if (!business || business.status !== "approved") return res.status(400).json({ error: "این کسب‌وکار هنوز به‌عنوان Provider ثبت نشده است" });
      provider = await prisma.provider.create({ data: { name: business.name, integrationType: "realtime", status: "connected", businessId: business.id } });
    }
    const events = await prisma.$transaction(body.rows.map((row) => prisma.providerEvent.create({
      data: { providerId: provider.id, nationalIdHash: hashNationalId(row.nationalId), nationalIdEnc: sealNid(row.nationalId), eventType: eventTypeMap[row.eventType], amount: row.amount, delayDays: row.delayDays, note: row.note },
    })));
    const defaults = body.rows.filter((r) => r.eventType === "bad_debt" || r.eventType === "bounced_check");
    if (defaults.length) {
      await prisma.defaulter.createMany({ data: defaults.map((r) => ({ nationalIdHash: hashNationalId(r.nationalId), nationalIdEnc: sealNid(r.nationalId), reportedByBusinessId: req.auth.id, kind: r.eventType, amount: r.amount, reason: r.note })) });
    }
    res.status(201).json({ count: events.length, events });
  } catch (err) { next(err); }
});

// GET /providers/report/recent — "گزارش‌های اخیر شما" list.
router.get("/report/recent", requireAuth, requireRole("business"), async (req, res, next) => {
  try {
    const provider = await prisma.provider.findUnique({ where: { businessId: req.auth.id } });
    if (!provider) return res.json([]);
    const events = await prisma.providerEvent.findMany({
      where: { providerId: provider.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    res.json(events.map(({ nationalIdEnc, ...e }) => { const n = openNid(nationalIdEnc); return { ...e, nationalId: n, nationalIdMasked: maskNid(n) }; }));
  } catch (err) {
    next(err);
  }
});

// GET /providers — admin panel's provider table.
router.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const providers = await prisma.provider.findMany({ orderBy: { name: "asc" } });
    res.json(providers);
  } catch (err) {
    next(err);
  }
});

// GET /providers/:id — admin panel's provider detail sheet.
router.get("/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const provider = await prisma.provider.findUnique({
      where: { id: req.params.id },
      include: { events: { orderBy: { createdAt: "desc" }, take: 20 } },
    });
    if (!provider) return res.status(404).json({ error: "Provider یافت نشد" });
    res.json({ ...provider, events: provider.events.map(({ nationalIdEnc, ...e }) => ({ ...e, nationalIdMasked: maskNid(openNid(nationalIdEnc)) })) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
