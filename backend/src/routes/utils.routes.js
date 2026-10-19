const express = require("express");
const { z } = require("zod");
const { requireAuth } = require("../middleware/auth");

// Paid third-party lookups: end-users ("user" role) must not be able to burn them.
const businessOrAdmin = (req, res, next) =>
  ["business", "admin"].includes(req.auth?.role) ? next() : res.status(403).json({ error: "دسترسی غیرمجاز برای این نقش" });
const { lookupAddressByPostalCode } = require("../services/postalCode.service");
const { lookupTaxRecords } = require("../services/taxRecords.service");

const router = express.Router();

const postalCodeSchema = z.object({
  postalCode: z.string().length(10),
});

// POST /utils/postal-code  { postalCode } -> full address
// General-purpose lookup (e.g. confirming a business's registered
// address) — available to any authenticated business or admin.
router.post("/postal-code", requireAuth, businessOrAdmin, async (req, res, next) => {
  try {
    const { postalCode } = postalCodeSchema.parse(req.body);
    const address = await lookupAddressByPostalCode(postalCode);
    res.json(address);
  } catch (err) {
    if (err.code === "NOT_CONFIGURED") return res.status(503).json({ error: "این سرویس هنوز پیکربندی نشده است" });
    next(err);
  }
});

const taxRecordsSchema = z.object({
  inquiryCode: z.string().min(1),
});

// POST /utils/tax-records  { inquiryCode } -> legal-entity tax records
router.post("/tax-records", requireAuth, businessOrAdmin, async (req, res, next) => {
  try {
    const { inquiryCode } = taxRecordsSchema.parse(req.body);
    const result = await lookupTaxRecords(inquiryCode);
    res.json(result);
  } catch (err) {
    if (err.code === "NOT_CONFIGURED") return res.status(503).json({ error: "این سرویس هنوز پیکربندی نشده است" });
    next(err);
  }
});

module.exports = router;
