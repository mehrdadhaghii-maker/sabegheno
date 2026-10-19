const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();

const policySchema = z.object({
  minScore: z.number().int().min(300).max(900),
  maxActiveBounced: z.number().int().min(0),
  maxDelayDays: z.number().int().min(0),
  reviewMinScore: z.number().int().min(300).max(900).optional(),
  overlapWindowHours: z.number().int().min(1).max(720).optional(),
  overlapMinBusinesses: z.number().int().min(1).max(20).optional(),
  overlapAction: z.enum(["review", "decline"]).optional(),
  overlapLimitPercent: z.number().int().min(0).max(100).optional(),
  maxRequestedAmount: z.number().int().min(0).optional(),
  maxExternalExposure: z.number().int().min(0).optional(),
  blockOnBadDebt: z.boolean().optional(),
}).refine((p) => p.reviewMinScore === undefined || p.reviewMinScore <= p.minScore, { message: "حداقل امتیاز «نیازمند بررسی» نباید از حداقل امتیاز تأیید بیشتر باشد" });

const ruleSchema = z.object({
  businessId: z.string().nullable().optional(),
  name: z.string().min(2).max(80),
  metric: z.string().regex(/^(score|requestedAmount|activeBounced|overdueDays|concurrentBusinesses|externalExposure|badDebtCount|service:[a-z0-9_-]+)$/),
  operator: z.enum(["lt", "lte", "gt", "gte", "eq"]),
  value: z.number(),
  action: z.enum(["decline", "review", "cap_limit", "reduce_limit"]),
  actionValue: z.number().int().min(0).nullable().optional(),
  message: z.string().max(300).nullable().optional(),
  enabled: z.boolean().optional(),
}).refine((r) => !["cap_limit", "reduce_limit"].includes(r.action) || r.actionValue != null, { message: "برای این اقدام مقدار عددی لازم است" });

// The one global policy row always exists after this is called once —
// scoring.service.js calls this same helper so it never has to handle
// "no policy yet" as a special case.
async function getOrCreateGlobalPolicy() {
  const existing = await prisma.policyRule.findUnique({ where: { singleton: "global" } });
  if (existing) return existing;
  return prisma.policyRule.create({ data: { singleton: "global" } });
}

// GET /policy — admin-only. (Businesses no longer have their own policy;
// this is the single platform-wide rule that scoring.service.js applies
// to every credit check.)
router.get("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    res.json(await getOrCreateGlobalPolicy());
  } catch (err) {
    next(err);
  }
});

// PUT /policy — admin-only.
router.put("/", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const body = policySchema.parse(req.body);
    await getOrCreateGlobalPolicy();
    const updated = await prisma.policyRule.update({ where: { singleton: "global" }, data: body });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ---- custom rules (admin) — platform-wide (businessId null) or per business ----
router.get("/rules", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    res.json(await prisma.customRule.findMany({ orderBy: { createdAt: "desc" }, include: { business: { select: { name: true } } } }));
  } catch (err) { next(err); }
});
router.post("/rules", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const data = ruleSchema.parse(req.body);
    res.status(201).json(await prisma.customRule.create({ data: { ...data, businessId: data.businessId || null } }));
  } catch (err) { next(err); }
});
router.patch("/rules/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    const data = ruleSchema.partial().parse(req.body);
    res.json(await prisma.customRule.update({ where: { id: req.params.id }, data }));
  } catch (err) { next(err); }
});
router.delete("/rules/:id", requireAuth, requireRole("admin"), async (req, res, next) => {
  try {
    await prisma.customRule.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { router, getOrCreateGlobalPolicy };
