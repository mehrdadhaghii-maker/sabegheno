// Ticket attachments: images, PDF and .xlsx — validated by CONTENT (magic bytes), stored under a random name,
// served only through authenticated endpoints with `Content-Disposition: attachment` + `nosniff`.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const prisma = require("../db/prisma");

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const DIR = path.join(UPLOAD_DIR, "tickets");
const MAX_BYTES = (Number(process.env.TICKET_ATTACHMENT_MAX_MB) || 5) * 1024 * 1024;
const MAX_PER_MESSAGE = 3, MAX_PENDING = 10;

const TYPES = [
  { ext: "png", mime: "image/png", ok: (b) => b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: "jpg", mime: "image/jpeg", ok: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", mime: "image/webp", ok: (b) => b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  { ext: "pdf", mime: "application/pdf", ok: (b) => b.length > 5 && b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ok: (b, name) => /\.xlsx$/i.test(name) && b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 },
];
const sniffType = (buf, fileName = "") => TYPES.find((t) => t.ok(buf, fileName)) || null;
const err = (status, message, code) => Object.assign(new Error(message), { status, publicMessage: message, code });
const view = (a) => ({ id: a.id, fileName: a.fileName, mime: a.mime, sizeBytes: a.sizeBytes });

async function saveUpload({ role, id, fileName, dataBase64 }) {
  const buf = Buffer.from(String(dataBase64 || "").replace(/^data:[^,]+,/, ""), "base64");
  if (!buf.length) throw err(400, "فایل خالی است");
  if (buf.length > MAX_BYTES) throw err(413, `حجم فایل بیشتر از ${Math.round(MAX_BYTES / 1048576)} مگابایت است`, "FILE_TOO_LARGE");
  const type = sniffType(buf, fileName);
  if (!type) throw err(400, "فقط تصویر (PNG/JPG/WebP)، PDF و اکسل (XLSX) پذیرفته می‌شود", "FILE_TYPE");
  const pending = await prisma.ticketAttachment.count({ where: { uploaderId: id, messageId: null } });
  if (pending >= MAX_PENDING) throw err(429, "پیوست‌های ارسال‌نشدهٔ زیادی دارید؛ ابتدا پیام را ارسال کنید", "TOO_MANY_PENDING");
  fs.mkdirSync(DIR, { recursive: true });
  const storedName = `${crypto.randomBytes(14).toString("hex")}.${type.ext}`; // never the client's file name → no path tricks
  fs.writeFileSync(path.join(DIR, storedName), buf);
  const safeName = String(fileName || `file.${type.ext}`).replace(/[^\w.\- \u0600-\u06FF]/g, "_").replace(/\.{2,}/g, ".").replace(/^[.\s]+/, "").slice(0, 120) || `file.${type.ext}`;
  return prisma.ticketAttachment.create({ data: { uploaderRole: role, uploaderId: id, fileName: safeName, mime: type.mime, sizeBytes: buf.length, storedName } });
}

/** Attach previously uploaded files to a message — only the uploader's own, still-unattached ones. */
async function claim(ids = [], messageId, { role, id }) {
  if (!ids.length) return [];
  if (ids.length > MAX_PER_MESSAGE) throw err(400, `حداکثر ${MAX_PER_MESSAGE} پیوست برای هر پیام مجاز است`);
  const rows = await prisma.ticketAttachment.findMany({ where: { id: { in: ids }, uploaderId: id, uploaderRole: role, messageId: null } });
  if (rows.length !== new Set(ids).size) throw err(400, "یکی از پیوست‌ها معتبر نیست یا قبلاً استفاده شده است");
  await prisma.ticketAttachment.updateMany({ where: { id: { in: rows.map((r) => r.id) } }, data: { messageId } });
  return rows.map(view);
}

function sendFile(att, res, next) {
  res.setHeader("Content-Type", att.mime);
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(att.fileName)}`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, max-age=300");
  fs.createReadStream(path.join(DIR, path.basename(att.storedName))).on("error", next).pipe(res);
}

function deleteFiles(storedNames) { for (const n of storedNames) { try { fs.unlinkSync(path.join(DIR, path.basename(n))); } catch { /* already gone */ } } }

module.exports = { sniffType, saveUpload, claim, sendFile, deleteFiles, view, MAX_BYTES, MAX_PER_MESSAGE };
