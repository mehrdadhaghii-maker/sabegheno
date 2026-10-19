const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");
const { startReportPayment, verifyReportPayment, hasPaidReport } = require("../services/payment.service");
const env = require("../config/env");

const router = express.Router();
router.use(requireAuth, requireRole("user"));

// GET /payments/report/status — has this person already paid for a still-valid report?
router.get("/report/status", async (req, res, next) => {
  try { res.json({ paid: await hasPaidReport(req.auth.id), priceToman: env.payment.priceToman, accessHours: env.payment.accessHours, gateway: env.payment.gateway }); }
  catch (err) { next(err); }
});

// POST /payments/report/start → { redirectUrl }
router.post("/report/start", async (req, res, next) => {
  try {
    const user = await prisma.endUser.findUnique({ where: { id: req.auth.id }, select: { id: true, mobile: true } });
    res.status(201).json(await startReportPayment(user));
  } catch (err) { next(err); }
});

// POST /payments/report/verify { authority, status } — the front-end calls this when the gateway sends the person back.
router.post("/report/verify", async (req, res, next) => {
  try {
    const { authority, status } = z.object({ authority: z.string().min(5).max(80), status: z.string().max(10).optional() }).parse(req.body);
    const p = await verifyReportPayment(req.auth.id, authority, status);
    res.json({ paid: p.status === "paid", refId: p.refId });
  } catch (err) { next(err); }
});

module.exports = router;
