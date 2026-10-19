// Panel (JWT) side of the facility ledger — "ثبت اعتبار اعطایی". The API-key twin lives in v1.routes.js.
const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const { requireAuth, requireRole, requireApprovedBusiness } = require("../middleware/auth");
const F = require("../services/facility.service");
const rating = require("../services/rating.service");

const { hashNationalId } = require("../utils/crypto");
const { sealNid } = require("../utils/nid");

const router = express.Router();
router.use(requireAuth, requireRole("business"), requireApprovedBusiness);

const view = (rows, brand) => rows.map((r) => ({ ...rating.describeFacility(r, brand), ...F.ownerIdFields(r), externalRef: r.externalRef, source: r.source, lastSyncedAt: r.lastSyncedAt }));
const one = async (businessId, id) => view([await F.getOne(businessId, { id })], await myBrand(businessId))[0];
async function myBrand(id) { return F.brandOf(await prisma.business.findUnique({ where: { id }, select: { brandName: true, name: true } })); }

router.get("/", async (req, res, next) => {
  try { res.json(view(await F.listForBusiness(req.auth.id), await myBrand(req.auth.id))); } catch (e) { next(e); }
});

// POST /facilities/bulk { items: [...up to 500] } — Excel import: every row is validated again on the server
router.post("/bulk", express.json({ limit: "4mb" }), async (req, res, next) => {
  try {
    const { items } = z.object({ items: z.array(z.unknown()).min(1).max(500) }).parse(req.body);
    res.json(await F.bulkUpsert(req.auth.id, items, "panel"));
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const input = F.facilityInput.parse(req.body);
    const row = await F.upsert(req.auth.id, input, "panel");
    res.status(201).json(await one(req.auth.id, row.id));
  } catch (e) { next(e); }
});

// POST /facilities/:id/national-id { nationalId } — older credits only kept the one-way hash, so the owner can type the
// ID once more. It is accepted ONLY if it hashes to the stored value (so it can't be attached to the wrong person).
router.post("/:id/national-id", async (req, res, next) => {
  try {
    const { nationalId } = z.object({ nationalId: z.string().regex(/^\d{10}$/, "کد ملی باید ۱۰ رقم باشد") }).parse(req.body);
    const row = await prisma.facility.findFirst({ where: { id: req.params.id, businessId: req.auth.id }, select: { id: true, nationalIdHash: true } });
    if (!row) return res.status(404).json({ error: "اعتبار یافت نشد" });
    if (hashNationalId(nationalId) !== row.nationalIdHash) return res.status(422).json({ error: "این کد ملی با کد ملی ثبت‌شده برای این اعتبار مطابقت ندارد" });
    await prisma.facility.update({ where: { id: row.id }, data: { nationalIdEnc: sealNid(nationalId) } });
    res.json(await one(req.auth.id, row.id));
  } catch (e) { next(e); }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const row = await F.patch(req.auth.id, req.params.id, F.facilityPatch.parse(req.body));
    if (!row) return res.status(404).json({ error: "اعتبار یافت نشد" });
    res.json(await one(req.auth.id, row.id));
  } catch (e) { next(e); }
});

// POST /facilities/:id/installments/:seq/pay — one installment; the last one settles the facility
router.post("/:id/installments/:seq/pay", async (req, res, next) => {
  try {
    const out = await F.payInstallment(req.auth.id, { id: req.params.id }, Number(req.params.seq), F.payInput.parse(req.body || {}));
    if (!out) return res.status(404).json({ error: "اعتبار یافت نشد" });
    if (out.error) return res.status(404).json({ error: out.error });
    res.json({ ...(await one(req.auth.id, out.facility.id)), releasedDefault: out.releasedDefault, settledNow: out.settled });
  } catch (e) { next(e); }
});

router.post("/:id/settle", async (req, res, next) => {
  try {
    const { settledAt } = F.settleInput.parse(req.body || {});
    const out = await F.settle(req.auth.id, { id: req.params.id }, settledAt);
    if (!out) return res.status(404).json({ error: "اعتبار یافت نشد" });
    res.json({ ...(await one(req.auth.id, out.facility.id)), releasedDefault: out.releasedDefault });
  } catch (e) { next(e); }
});

module.exports = router;
