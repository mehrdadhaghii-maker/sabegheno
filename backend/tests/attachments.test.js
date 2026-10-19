const Module = require("module"); const path = require("path"); const fs = require("fs"); const os = require("os");
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "sbg-")); process.env.TICKET_ATTACHMENT_MAX_MB = "1";
const T = { ticketAttachment: [] }; let id = 0;
const match = (r, w = {}) => Object.entries(w).every(([k, v]) => k === "id" && v && v.in ? v.in.includes(r.id) : (v === null ? r[k] == null : r[k] === v));
const prisma = { ticketAttachment: {
  create: async ({ data }) => { const r = { id: "a" + ++id, messageId: null, ...data }; T.ticketAttachment.push(r); return r; },
  count: async ({ where }) => T.ticketAttachment.filter((r) => match(r, where)).length,
  findMany: async ({ where }) => T.ticketAttachment.filter((r) => match(r, where)),
  updateMany: async ({ where, data }) => { const rs = T.ticketAttachment.filter((r) => match(r, where)); rs.forEach((r) => Object.assign(r, data)); return { count: rs.length }; },
} };
const orig = Module._load; Module._load = function (req, parent, ...r) { if (/db\/prisma$/.test(req)) return prisma; return orig.call(this, req, parent, ...r); };
const assert = require("assert"); let n = 0; const ok = (m, c) => { assert(c, "FAIL: " + m); console.log("✓", m); n++; };
const A = require(path.join(__dirname, "..", "src", "services", "attachments.service.js"));
const b64 = (b) => b.toString("base64");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40)]);
const PDF = Buffer.from("%PDF-1.4\n" + "x".repeat(50));
const XLSX = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);
const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(60)]);
const fail = async (p) => { try { await p; return null; } catch (e) { return e; } };
(async () => {
  ok("magic bytes: png / jpg / pdf / xlsx accepted", A.sniffType(PNG, "a.png").ext === "png" && A.sniffType(JPG, "a.jpg").ext === "jpg" && A.sniffType(PDF, "a.pdf").ext === "pdf" && A.sniffType(XLSX, "d.xlsx").ext === "xlsx");
  ok("a program/HTML/SVG renamed to .png is rejected; a zip only counts as .xlsx", A.sniffType(EXE, "virus.png") === null && A.sniffType(Buffer.from("<svg onload=alert(1)></svg>"), "x.png") === null && A.sniffType(XLSX, "payload.zip") === null);
  const up = await A.saveUpload({ role: "business", id: "B1", fileName: "../../etc/passwd.png", dataBase64: b64(PNG) });
  ok("stored under a random name; the client's name is sanitised", /^[0-9a-f]{28}\.png$/.test(up.storedName) && fs.existsSync(path.join(process.env.UPLOAD_DIR, "tickets", up.storedName)) && !/\.\.|\//.test(up.fileName));
  ok("size limit (413), wrong type (400), empty file (400)", (await fail(A.saveUpload({ role: "business", id: "B1", fileName: "big.png", dataBase64: b64(Buffer.concat([PNG, Buffer.alloc(1.2 * 1048576)])) }))).status === 413 && (await fail(A.saveUpload({ role: "business", id: "B1", fileName: "a.exe", dataBase64: b64(EXE) }))).code === "FILE_TYPE" && (await fail(A.saveUpload({ role: "business", id: "B1", fileName: "a.png", dataBase64: "" }))).status === 400);
  const a2 = await A.saveUpload({ role: "business", id: "B1", fileName: "b.pdf", dataBase64: b64(PDF) });
  ok("claim attaches the uploader's own files; a file can not be attached twice", (await A.claim([up.id, a2.id], "m1", { role: "business", id: "B1" })).length === 2 && (await fail(A.claim([up.id], "m2", { role: "business", id: "B1" }))).status === 400);
  const other = await A.saveUpload({ role: "business", id: "B2", fileName: "c.png", dataBase64: b64(PNG) });
  ok("no cross-user claiming (another business or an admin); max 3 per message", (await fail(A.claim([other.id], "m3", { role: "business", id: "B1" }))).status === 400 && (await fail(A.claim([other.id], "m3", { role: "admin", id: "B2" }))).status === 400 && (await fail(A.claim(["1", "2", "3", "4"], "m4", { role: "business", id: "B1" }))).status === 400);
  for (let i = 0; i < 10; i++) await A.saveUpload({ role: "business", id: "B9", fileName: "d.jpg", dataBase64: b64(JPG) });
  ok("at most 10 unsent uploads per person", (await fail(A.saveUpload({ role: "business", id: "B9", fileName: "e.jpg", dataBase64: b64(JPG) }))).status === 429);
  A.deleteFiles([up.storedName, "../../../etc/passwd"]);
  ok("deleteFiles removes the file and ignores path tricks", !fs.existsSync(path.join(process.env.UPLOAD_DIR, "tickets", up.storedName)));
  console.log(n + " attachment checks passed");
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
