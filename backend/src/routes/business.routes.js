const express = require("express");
const fs = require("fs");
const path = require("path");
const prisma = require("../db/prisma");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const LOGO_DIR = path.join(UPLOAD_DIR, "logos");
fs.mkdirSync(LOGO_DIR, { recursive: true });

// Magic-byte sniffing — we never trust the client's mime type. SVG is refused on purpose (script injection).
function sniff(buf) {
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length > 12 && buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") return "webp";
  return null;
}

// GET /business/me — profile incl. logo and status (used after login / on refresh)
router.get("/me", requireAuth, requireRole("business"), async (req, res, next) => {
  try {
    const b = await prisma.business.findUnique({ where: { id: req.auth.id }, select: { id: true, name: true, brandName: true, mobile: true, status: true, isVerified: true, contractSigned: true, logoUrl: true, rejectionReason: true } });
    res.json(b);
  } catch (err) { next(err); }
});

// POST /business/logo  { dataUrl: "data:image/png;base64,..." }  (≤ 1 MB, PNG/JPEG/WebP)
router.post("/logo", requireAuth, requireRole("business"), express.json({ limit: "1.6mb" }), async (req, res, next) => {
  try {
    const m = /^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(req.body?.dataUrl || "");
    if (!m) return res.status(400).json({ error: "فرمت تصویر نامعتبر است (PNG، JPG یا WebP)" });
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > 1024 * 1024) return res.status(400).json({ error: "حجم لوگو باید کمتر از ۱ مگابایت باشد" });
    const ext = sniff(buf);
    if (!ext) return res.status(400).json({ error: "محتوای فایل یک تصویر معتبر نیست" });

    for (const f of fs.readdirSync(LOGO_DIR)) if (f.startsWith(`${req.auth.id}.`)) fs.unlinkSync(path.join(LOGO_DIR, f));
    fs.writeFileSync(path.join(LOGO_DIR, `${req.auth.id}.${ext}`), buf);
    const logoUrl = `/uploads/logos/${req.auth.id}.${ext}?v=${Date.now()}`;
    await prisma.business.update({ where: { id: req.auth.id }, data: { logoUrl } });
    res.json({ logoUrl });
  } catch (err) { next(err); }
});

module.exports = { router, UPLOAD_DIR };
