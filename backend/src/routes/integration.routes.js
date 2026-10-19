// Two-way integration settings for the logged-in business: webhook (we → them) and pull-sync (we ← them).
const express = require("express");
const crypto = require("crypto");
const { z } = require("zod");
const prisma = require("../db/prisma");
const env = require("../config/env");
const logger = require("../utils/logger");
const { encrypt } = require("../utils/secret");
const { requireAuth, requireRole, requireApprovedBusiness } = require("../middleware/auth");
const { assertSafeUrl } = require("../services/externalServices.service");
const webhooks = require("../services/webhook.service");
const { syncBusiness } = require("../services/syncPull.service");

const router = express.Router();
router.use(requireAuth, requireRole("business"), requireApprovedBusiness);

const url = z.string().trim().max(500).url("آدرس معتبر نیست").refine((u) => (env.isProd ? /^https:\/\//i.test(u) : /^https?:\/\//i.test(u)), env.isProd ? "در محیط واقعی فقط آدرس https پذیرفته می‌شود" : "آدرس باید http یا https باشد");
const putSchema = z.object({ webhookUrl: url.nullable().optional(), syncUrl: url.nullable().optional(), syncKey: z.string().max(300).optional(), regenerateSecret: z.boolean().optional() });

const pub = (b) => ({ webhookUrl: b.webhookUrl, hasSecret: !!b.webhookSecretEnc, syncUrl: b.syncUrl, hasSyncKey: !!b.syncKeyEnc, lastSyncAt: b.lastSyncAt, lastSyncResult: b.lastSyncResult });
const load = (id) => prisma.business.findUnique({ where: { id }, select: { webhookUrl: true, webhookSecretEnc: true, syncUrl: true, syncKeyEnc: true, lastSyncAt: true, lastSyncResult: true } });
const newSecret = () => `whsec_${crypto.randomBytes(32).toString("base64url")}`;

router.get("/", async (req, res, next) => { try { res.json(pub(await load(req.auth.id))); } catch (e) { next(e); } });

router.put("/", async (req, res, next) => {
  try {
    const b = putSchema.parse(req.body), data = {}; let secret = null;
    for (const u of [b.webhookUrl, b.syncUrl]) if (u) { try { await assertSafeUrl(new URL(u)); } catch (e) { return res.status(400).json({ error: e.message }); } }
    const cur = await load(req.auth.id);
    if (b.webhookUrl !== undefined) {
      data.webhookUrl = b.webhookUrl;
      if (b.webhookUrl && (!cur.webhookSecretEnc || b.regenerateSecret)) { secret = newSecret(); data.webhookSecretEnc = encrypt(secret); }
      if (!b.webhookUrl) data.webhookSecretEnc = null;
    } else if (b.regenerateSecret && cur.webhookUrl) { secret = newSecret(); data.webhookSecretEnc = encrypt(secret); }
    if (b.syncUrl !== undefined) { data.syncUrl = b.syncUrl; if (!b.syncUrl) data.syncKeyEnc = null; }
    if (b.syncKey) data.syncKeyEnc = encrypt(b.syncKey);
    const saved = await prisma.business.update({ where: { id: req.auth.id }, data });
    logger.security("تنظیمات یکپارچه‌سازی (وب‌هوک/همگام‌سازی) تغییر کرد", { userId: req.auth.id });
    res.json({ ...pub(saved), ...(secret ? { secret, notice: "این راز فقط همین یک بار نمایش داده می‌شود." } : {}) });
  } catch (e) { next(e); }
});

router.post("/test-webhook", async (req, res, next) => {
  try {
    const b = await load(req.auth.id);
    if (!b.webhookUrl) return res.status(400).json({ error: "ابتدا آدرس وب‌هوک را ذخیره کنید" });
    res.json(await webhooks.ping(b));
  } catch (e) { next(e); }
});

// one manual sync per 2 minutes
router.post("/sync-now", async (req, res, next) => {
  try {
    const b = await prisma.business.findUnique({ where: { id: req.auth.id }, select: { id: true, syncUrl: true, syncKeyEnc: true, lastSyncAt: true } });
    if (!b.syncUrl) return res.status(400).json({ error: "ابتدا آدرس همگام‌سازی را ذخیره کنید" });
    if (b.lastSyncAt && Date.now() - b.lastSyncAt.getTime() < 120_000) return res.status(429).json({ error: "هر ۲ دقیقه یک‌بار می‌توانید همگام‌سازی دستی بزنید", code: "RATE_LIMITED" });
    res.json(await syncBusiness(b));
  } catch (e) { next(e); }
});

router.get("/deliveries", async (req, res, next) => {
  try { res.json(await prisma.webhookDelivery.findMany({ where: { businessId: req.auth.id }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, event: true, status: true, attempts: true, lastError: true, createdAt: true, deliveredAt: true } })); }
  catch (e) { next(e); }
});

module.exports = router;
