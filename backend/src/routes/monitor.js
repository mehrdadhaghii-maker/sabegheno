// Monitoring API — every route is admin-only (requireAuth + isAdmin are applied at mount time).
const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");

const router = express.Router();
const HOUR = 3600_000;

// Tehran has no DST since 2022 → fixed UTC+03:30.
function startOfTehranDay(now = new Date()) {
  const OFFSET = 3.5 * HOUR;
  return new Date(Math.floor((now.getTime() + OFFSET) / 86400_000) * 86400_000 - OFFSET);
}

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  page: z.coerce.number().int().min(1).default(1),
  resolved: z.enum(["true", "false"]).optional(),
  statusCode: z.coerce.number().int().min(100).max(599).optional(),
});

// GET /monitor/stats
router.get("/stats", async (req, res, next) => {
  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * HOUR);
    const [total, unresolved, lastHour, requestsToday, req24, serverErr24, avg] = await Promise.all([
      prisma.errorLog.count(),
      prisma.errorLog.count({ where: { resolved: false } }),
      prisma.errorLog.count({ where: { createdAt: { gte: new Date(now.getTime() - HOUR) } } }),
      prisma.requestLog.count({ where: { createdAt: { gte: startOfTehranDay(now) } } }),
      prisma.requestLog.count({ where: { createdAt: { gte: since24h } } }),
      prisma.requestLog.count({ where: { createdAt: { gte: since24h }, statusCode: { gte: 500 } } }),
      prisma.requestLog.aggregate({ where: { createdAt: { gte: since24h } }, _avg: { duration: true } }),
    ]);
    res.json({
      total, unresolved, lastHour, requestsToday,
      // success = answered without a 5xx, over the last 24 h
      successRate: req24 ? Math.round(((req24 - serverErr24) / req24) * 1000) / 10 : 100,
      avgResponseTime: Math.round(avg._avg.duration || 0),
      requests24h: req24,
    });
  } catch (err) { next(err); }
});

// GET /monitor/errors?limit=50&page=1&resolved=false&statusCode=500
router.get("/errors", async (req, res, next) => {
  try {
    const q = listQuery.parse(req.query);
    const where = {
      ...(q.resolved ? { resolved: q.resolved === "true" } : {}),
      ...(q.statusCode ? { statusCode: q.statusCode } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.errorLog.findMany({
        where, orderBy: { createdAt: "desc" }, take: q.limit, skip: (q.page - 1) * q.limit,
        select: { id: true, message: true, route: true, method: true, userId: true, statusCode: true, createdAt: true, resolved: true, resolvedAt: true }, // no stack/meta in the list
      }),
      prisma.errorLog.count({ where }),
    ]);
    res.json({ items, total, page: q.page, limit: q.limit, pages: Math.max(1, Math.ceil(total / q.limit)) });
  } catch (err) { next(err); }
});

// GET /monitor/errors/:id — full detail incl. stack and meta
router.get("/errors/:id", async (req, res, next) => {
  try {
    const row = await prisma.errorLog.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: "خطا یافت نشد" });
    res.json(row);
  } catch (err) { next(err); }
});

// PATCH /monitor/errors/:id/resolve
router.patch("/errors/:id/resolve", async (req, res, next) => {
  try {
    const row = await prisma.errorLog.updateMany({ where: { id: req.params.id }, data: { resolved: true, resolvedAt: new Date() } });
    if (!row.count) return res.status(404).json({ error: "خطا یافت نشد" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /monitor/chart-data?hours=24 — errors per hour (empty hours are returned as 0)
router.get("/chart-data", async (req, res, next) => {
  try {
    const { hours } = z.object({ hours: z.coerce.number().int().min(1).max(168).default(24) }).parse(req.query);
    const end = Math.floor(Date.now() / HOUR) * HOUR;          // start of the current hour
    const start = end - (hours - 1) * HOUR;
    const rows = await prisma.errorLog.findMany({ where: { createdAt: { gte: new Date(start) } }, select: { createdAt: true, statusCode: true }, take: 50000 });
    const buckets = new Map();
    for (let t = start; t <= end; t += HOUR) buckets.set(t, { hour: new Date(t).toISOString(), errors: 0, serverErrors: 0 });
    for (const r of rows) {
      const b = buckets.get(Math.floor(r.createdAt.getTime() / HOUR) * HOUR);
      if (!b) continue;
      b.errors += 1;
      if ((r.statusCode || 500) >= 500) b.serverErrors += 1;
    }
    res.json([...buckets.values()]);
  } catch (err) { next(err); }
});

// GET /monitor/requests/recent?limit=20
router.get("/requests/recent", async (req, res, next) => {
  try {
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }).parse(req.query);
    res.json(await prisma.requestLog.findMany({ orderBy: { createdAt: "desc" }, take: limit, select: { id: true, method: true, route: true, statusCode: true, duration: true, createdAt: true } }));
  } catch (err) { next(err); }
});

// GET /monitor/top-routes?days=7 — routes that fail most often
router.get("/top-routes", async (req, res, next) => {
  try {
    const { days, limit } = z.object({ days: z.coerce.number().int().min(1).max(90).default(7), limit: z.coerce.number().int().min(1).max(50).default(10) }).parse(req.query);
    const rows = await prisma.errorLog.groupBy({
      by: ["route"], where: { route: { not: null }, createdAt: { gte: new Date(Date.now() - days * 24 * HOUR) } },
      _count: { route: true }, _max: { createdAt: true }, orderBy: { _count: { route: "desc" } }, take: limit,
    });
    res.json(rows.map((r) => ({ route: r.route, count: r._count.route, lastAt: r._max.createdAt })));
  } catch (err) { next(err); }
});

module.exports = router;
