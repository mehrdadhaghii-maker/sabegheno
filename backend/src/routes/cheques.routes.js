// Panel (JWT) side of the in-transit cheques. The API-key twin is in v1.routes.js.
const express = require("express");
const { requireAuth, requireRole, requireApprovedBusiness } = require("../middleware/auth");
const C = require("../services/cheque.service");

const router = express.Router();
router.use(requireAuth, requireRole("business"), requireApprovedBusiness);

router.get("/", async (req, res, next) => { try { res.json((await C.listForBusiness(req.auth.id)).map(C.view)); } catch (e) { next(e); } });
router.post("/", async (req, res, next) => { try { res.status(201).json(C.view(await C.upsert(req.auth.id, C.chequeInput.parse(req.body)))); } catch (e) { next(e); } });
router.post("/lookup", async (req, res, next) => { try { res.json(await C.lookup(C.lookupInput.parse(req.body).nationalId)); } catch (e) { next(e); } });
router.post("/:id/status", async (req, res, next) => {
  try {
    const { status, at } = C.statusInput.parse(req.body);
    const row = await C.setStatus(req.auth.id, { id: req.params.id }, status, at);
    if (!row) return res.status(404).json({ error: "چک یافت نشد" });
    res.json(C.view(row));
  } catch (e) { next(e); }
});

module.exports = router;
