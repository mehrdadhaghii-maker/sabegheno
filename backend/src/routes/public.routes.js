// Public, unauthenticated, read-only endpoints for the landing page. Only brand name + logo of
// businesses an admin explicitly opted in (showOnLanding) and that are approved — nothing else.
const express = require("express");
const rateLimit = require("express-rate-limit");
const prisma = require("../db/prisma");

const router = express.Router();
const limiter = rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false });

let cache = { at: 0, data: [] };
router.get("/partners", limiter, async (req, res, next) => {
  try {
    if (Date.now() - cache.at > 60_000) {
      const rows = await prisma.business.findMany({
        where: { showOnLanding: true, status: "approved", deletedAt: null },
        select: { brandName: true, name: true, logoUrl: true }, orderBy: { createdAt: "asc" }, take: 60,
      });
      cache = { at: Date.now(), data: rows.map((r) => ({ name: r.brandName || r.name, logoUrl: r.logoUrl || null })) };
    }
    res.set("Cache-Control", "public, max-age=60");
    res.json({ partners: cache.data });
  } catch (e) { next(e); }
});

module.exports = router;
