const express = require("express");
const prisma = require("../db/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("business"));

// GET /notifications — latest 50 + unread counter for the bell badge
router.get("/", async (req, res, next) => {
  try {
    const [items, unread] = await Promise.all([
      prisma.notification.findMany({ where: { businessId: req.auth.id }, orderBy: { createdAt: "desc" }, take: 50 }),
      prisma.notification.count({ where: { businessId: req.auth.id, readAt: null } }),
    ]);
    res.json({ unread, items });
  } catch (err) { next(err); }
});

router.post("/read-all", async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { businessId: req.auth.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post("/:id/read", async (req, res, next) => {
  try {
    await prisma.notification.updateMany({ where: { id: req.params.id, businessId: req.auth.id, readAt: null }, data: { readAt: new Date() } });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
