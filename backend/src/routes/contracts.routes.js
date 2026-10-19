// Contract management.
//  admin:    upload a new contract (PDF) → it becomes THE contract for every business at once;
//            optionally every business must read and accept it again.
//  business: see the current contract, download it, accept it.
const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { z } = require("zod");
const prisma = require("../db/prisma");
const logger = require("../utils/logger");
const { requireAuth, requireRole } = require("../middleware/auth");

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const DIR = path.join(UPLOAD_DIR, "contracts");
const MAX_BYTES = 8 * 1024 * 1024;

const isPdf = (buf) => buf.length > 4 && buf.subarray(0, 5).toString("latin1") === "%PDF-";
const view = (c) => c && { id: c.id, version: c.version, title: c.title, fileName: c.fileName, sizeBytes: c.sizeBytes, note: c.note, requireReaccept: c.requireReaccept, isActive: c.isActive, createdAt: c.createdAt };

/* ------------------------------- admin ------------------------------- */
const admin = express.Router();
admin.use(requireAuth, requireRole("admin"));

admin.get("/", async (req, res, next) => {
  try {
    const [rows, total, accepted] = await Promise.all([
      prisma.contractTemplate.findMany({ orderBy: { version: "desc" }, take: 50 }),
      prisma.business.count({ where: { deletedAt: null, status: { in: ["approved", "pending_contract", "pending_docs"] } } }),
      prisma.business.groupBy({ by: ["contractVersion"], where: { deletedAt: null }, _count: { _all: true } }),
    ]);
    const byVersion = Object.fromEntries(accepted.map((a) => [a.contractVersion ?? 0, a._count._all]));
    res.json({ total, items: rows.map((c) => ({ ...view(c), acceptedCount: byVersion[c.version] || 0 })), neverAccepted: byVersion[0] || 0 });
  } catch (e) { next(e); }
});

// POST /admin/contracts { title, note?, requireReaccept, fileName, dataBase64 }  — PDF, max 8 MB
admin.post("/", express.json({ limit: "12mb" }), async (req, res, next) => {
  try {
    const b = z.object({ title: z.string().trim().min(3).max(120), note: z.string().trim().max(500).optional(), requireReaccept: z.boolean().default(true), fileName: z.string().max(160), dataBase64: z.string().min(100) }).parse(req.body);
    const buf = Buffer.from(b.dataBase64.replace(/^data:[^,]+,/, ""), "base64");
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: "حجم فایل بیشتر از ۸ مگابایت است" });
    if (!isPdf(buf)) return res.status(400).json({ error: "فقط فایل PDF معتبر پذیرفته می‌شود" });

    fs.mkdirSync(DIR, { recursive: true });
    const storedName = `${crypto.randomBytes(12).toString("hex")}.pdf`; // never the client's file name → no path tricks
    fs.writeFileSync(path.join(DIR, storedName), buf);

    const last = await prisma.contractTemplate.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
    const version = (last?.version || 0) + 1;
    const [, created] = await prisma.$transaction([
      prisma.contractTemplate.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      prisma.contractTemplate.create({ data: { version, title: b.title, note: b.note || null, requireReaccept: b.requireReaccept, fileName: b.fileName.replace(/[^\w.\- \u0600-\u06FF]/g, "_"), mime: "application/pdf", sizeBytes: buf.length, storedName, isActive: true, createdBy: req.auth.id } }),
    ]);

    // Replace it for everybody: tell every business (one notification each).
    const biz = await prisma.business.findMany({ where: { deletedAt: null }, select: { id: true } });
    if (biz.length) {
      await prisma.notification.createMany({ data: biz.map((x) => ({ businessId: x.id, title: `قرارداد جدید (نسخهٔ ${version})`, body: `«${b.title}» جایگزین قرارداد قبلی شد.${b.requireReaccept ? " لطفاً آن را مطالعه و در پنل تأیید کنید." : ""}${b.note ? ` ${b.note}` : ""}`, level: "info" })) });
    }
    logger.security(`قرارداد نسخهٔ ${version} منتشر شد و برای ${biz.length} کسب‌وکار جایگزین شد`, { userId: req.auth.id });
    res.status(201).json({ ...view(created), notified: biz.length });
  } catch (e) { next(e); }
});

admin.get("/:id/file", async (req, res, next) => {
  try {
    const c = await prisma.contractTemplate.findUnique({ where: { id: req.params.id } });
    if (!c) return res.status(404).json({ error: "قرارداد یافت نشد" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(c.fileName)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    fs.createReadStream(path.join(DIR, path.basename(c.storedName))).on("error", next).pipe(res);
  } catch (e) { next(e); }
});

/* ------------------------------ business ------------------------------ */
const biz = express.Router();
biz.use(requireAuth, requireRole("business"));

biz.get("/", async (req, res, next) => {
  try {
    const [c, me] = await Promise.all([prisma.contractTemplate.findFirst({ where: { isActive: true } }), prisma.business.findUnique({ where: { id: req.auth.id }, select: { contractVersion: true } })]);
    if (!c) return res.json({ current: null });
    res.json({ current: view(c), acceptedVersion: me?.contractVersion ?? null, needsAcceptance: c.requireReaccept && (me?.contractVersion ?? 0) < c.version });
  } catch (e) { next(e); }
});

biz.get("/file", async (req, res, next) => {
  try {
    const c = await prisma.contractTemplate.findFirst({ where: { isActive: true } });
    if (!c) return res.status(404).json({ error: "هنوز قراردادی منتشر نشده است" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(c.fileName)}`);
    res.setHeader("X-Content-Type-Options", "nosniff");
    fs.createReadStream(path.join(DIR, path.basename(c.storedName))).on("error", next).pipe(res);
  } catch (e) { next(e); }
});

biz.post("/accept", async (req, res, next) => {
  try {
    const c = await prisma.contractTemplate.findFirst({ where: { isActive: true } });
    if (!c) return res.status(404).json({ error: "قراردادی برای تأیید وجود ندارد" });
    await prisma.business.update({ where: { id: req.auth.id }, data: { contractVersion: c.version } });
    res.json({ ok: true, version: c.version });
  } catch (e) { next(e); }
});

module.exports = { admin, biz };
