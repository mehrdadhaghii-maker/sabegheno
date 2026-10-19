const express = require("express");
const { z } = require("zod");
const prisma = require("../db/prisma");
const { maskPans } = require("../utils/pan");
const { requireAuth, requireRole } = require("../middleware/auth");
const att = require("../services/attachments.service");

const router = express.Router();
router.use(requireAuth, requireRole("business"));

const ids = z.array(z.string().max(40)).max(att.MAX_PER_MESSAGE).optional();
const createSchema = z.object({
  subject: z.string().min(3).max(120),
  category: z.enum(["general", "technical", "billing", "inquiry", "account"]).default("general"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  body: z.string().min(5).max(4000),
  attachmentIds: ids,
});
const msgInclude = { messages: { orderBy: { createdAt: "asc" }, include: { attachments: { select: { id: true, fileName: true, mime: true, sizeBytes: true } } } } };

router.get("/tickets", async (req, res, next) => {
  try { res.json(await prisma.supportTicket.findMany({ where: { businessId: req.auth.id }, orderBy: { updatedAt: "desc" }, include: msgInclude })); }
  catch (err) { next(err); }
});

// POST /support/attachments { fileName, dataBase64 } — upload first, then reference the id from the message
router.post("/attachments", express.json({ limit: "9mb" }), async (req, res, next) => {
  try {
    const { fileName, dataBase64 } = z.object({ fileName: z.string().max(200), dataBase64: z.string().min(20) }).parse(req.body);
    res.status(201).json(att.view(await att.saveUpload({ role: "business", id: req.auth.id, fileName, dataBase64 })));
  } catch (err) { next(err); }
});

// GET /support/attachments/:id — only the uploader or the owner of the ticket
router.get("/attachments/:id", async (req, res, next) => {
  try {
    const a = await prisma.ticketAttachment.findUnique({ where: { id: req.params.id }, include: { message: { include: { ticket: { select: { businessId: true } } } } } });
    const mine = a && ((a.uploaderRole === "business" && a.uploaderId === req.auth.id) || a.message?.ticket?.businessId === req.auth.id);
    if (!mine) return res.status(404).json({ error: "فایل یافت نشد" });
    att.sendFile(a, res, next);
  } catch (err) { next(err); }
});

// POST /support/tickets — ONE open ticket at a time. Open = not closed (open or answered).
// Serializable transaction: two simultaneous requests can never both pass the check.
router.post("/tickets", async (req, res, next) => {
  try {
    const { body: rawBody, subject, attachmentIds, ...meta } = createSchema.parse(req.body);
    const body = maskPans(rawBody); // data.md: a card number must never be stored
    meta.subject = maskPans(subject);
    const result = await prisma.$transaction(async (tx) => {
      const open = await tx.supportTicket.findFirst({ where: { businessId: req.auth.id, status: { not: "closed" } }, select: { id: true, subject: true } });
      if (open) return { open };
      const ticket = await tx.supportTicket.create({ data: { ...meta, businessId: req.auth.id, messages: { create: { sender: "business", body } } }, include: { messages: true } });
      return { ticket };
    }, { isolationLevel: "Serializable" });
    if (result.open) return res.status(409).json({ error: `شما همین حالا یک تیکت باز دارید («${result.open.subject}»). تا بسته نشود نمی‌توانید تیکت جدید بسازید؛ در همان تیکت پیام بدهید یا آن را ببندید.`, code: "TICKET_OPEN", ticketId: result.open.id });
    await att.claim(attachmentIds || [], result.ticket.messages[0].id, { role: "business", id: req.auth.id });
    res.status(201).json(await prisma.supportTicket.findUnique({ where: { id: result.ticket.id }, include: msgInclude }));
  } catch (err) {
    if (err.code === "P2034") return res.status(409).json({ error: "درخواست هم‌زمان دیگری در حال ثبت است؛ دوباره تلاش کنید", code: "TICKET_OPEN" });
    next(err);
  }
});

// POST /support/tickets/:id/messages — business follow-up. A CLOSED ticket stays closed.
router.post("/tickets/:id/messages", async (req, res, next) => {
  try {
    const { body: rawBody, attachmentIds } = z.object({ body: z.string().min(1).max(4000), attachmentIds: ids }).parse(req.body);
    const body = maskPans(rawBody);
    const t = await prisma.supportTicket.findFirst({ where: { id: req.params.id, businessId: req.auth.id } });
    if (!t) return res.status(404).json({ error: "تیکت یافت نشد" });
    if (t.status === "closed") return res.status(409).json({ error: "این تیکت بسته شده است؛ برای موضوع جدید تیکت تازه بسازید.", code: "TICKET_CLOSED" });
    const [msg] = await prisma.$transaction([
      prisma.ticketMessage.create({ data: { ticketId: t.id, sender: "business", body } }),
      prisma.supportTicket.update({ where: { id: t.id }, data: { status: "open" } }),
    ]);
    const files = await att.claim(attachmentIds || [], msg.id, { role: "business", id: req.auth.id });
    res.status(201).json({ ...msg, attachments: files });
  } catch (err) { next(err); }
});

// POST /support/tickets/:id/close — the business closes its own ticket (frees the "one open ticket" slot)
router.post("/tickets/:id/close", async (req, res, next) => {
  try {
    const r = await prisma.supportTicket.updateMany({ where: { id: req.params.id, businessId: req.auth.id, status: { not: "closed" } }, data: { status: "closed" } });
    if (!r.count) return res.status(404).json({ error: "تیکت باز یافت نشد" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
