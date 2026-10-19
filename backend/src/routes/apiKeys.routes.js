// API-key management for the logged-in business (JWT). The full key is returned exactly once.
const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const { requireAuth, requireRole, requireApprovedBusiness } = require("../middleware/auth");
const { generateKey, sha256 } = require("../middleware/apiKey");
const logger = require("../utils/logger");

const router = express.Router();
router.use(requireAuth, requireRole("business"), requireApprovedBusiness);
const MAX_ACTIVE = 5;

router.get("/", async (req, res, next) => {
  try {
    res.json(await prisma.apiKey.findMany({ where: { businessId: req.auth.id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, prefix: true, lastUsedAt: true, revokedAt: true, createdAt: true } }));
  } catch (e) { next(e); }
});

router.post("/", async (req, res, next) => {
  try {
    const { name } = z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body);
    const active = await prisma.apiKey.count({ where: { businessId: req.auth.id, revokedAt: null } });
    if (active >= MAX_ACTIVE) return res.status(400).json({ error: `حداکثر ${MAX_ACTIVE} کلید فعال مجاز است؛ یکی را باطل کنید` });
    const key = generateKey();
    const row = await prisma.apiKey.create({ data: { businessId: req.auth.id, name, prefix: key.slice(0, 13), keyHash: sha256(key) } });
    logger.security("کلید API جدید ساخته شد", { userId: req.auth.id });
    res.status(201).json({ id: row.id, name: row.name, prefix: row.prefix, key, createdAt: row.createdAt, notice: "این کلید فقط همین یک بار نمایش داده می‌شود." });
  } catch (e) { next(e); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const r = await prisma.apiKey.updateMany({ where: { id: req.params.id, businessId: req.auth.id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!r.count) return res.status(404).json({ error: "کلید یافت نشد" });
    logger.security("کلید API باطل شد", { userId: req.auth.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
