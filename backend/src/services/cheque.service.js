// In-transit cheques ("چک‌های در راه"): a person issues post-dated cheques; businesses register them and report
// what happens (cashed / bounced / cancelled). Whoever is about to accept a cheque can look the issuer up and
// see how many cheques are already in circulation. The numbers feed the issuer's rating.
const { z } = require("zod");
const prisma = require("../db/prisma");
const { hashNationalId } = require("../utils/crypto");
const { sealNid, openNid, maskNid } = require("../utils/nid");
const rating = require("./rating.service");

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "تاریخ نامعتبر است").transform((s) => new Date(s));
const money = z.number().int().min(1).max(1_000_000_000_000);

const chequeInput = z.object({
  nationalId: z.string().regex(/^\d{10}$/, "کد ملی باید ۱۰ رقم باشد"),
  externalRef: z.string().min(1).max(100).optional(),   // e.g. the cheque (sayad) number / your own id
  amount: money,
  issuedAt: isoDate,
  dueDate: isoDate,
}).refine((v) => v.dueDate >= v.issuedAt, { message: "تاریخ سررسید نمی‌تواند قبل از تاریخ صدور باشد", path: ["dueDate"] });

const statusInput = z.object({ status: z.enum(["cashed", "bounced", "cancelled"]), at: isoDate.optional() });
const lookupInput = z.object({ nationalId: z.string().regex(/^\d{10}$/, "کد ملی باید ۱۰ رقم باشد") });

const view = (c) => {
  const n = openNid(c.nationalIdEnc);
  return { id: c.id, externalRef: c.externalRef, nationalId: n, nationalIdMasked: maskNid(n), amount: c.amount, issuedAt: c.issuedAt, dueDate: c.dueDate, status: c.status, resolvedAt: c.resolvedAt, daysToDue: Math.ceil((new Date(c.dueDate) - Date.now()) / 864e5) };
};

async function upsert(businessId, input) {
  const data = { nationalIdHash: hashNationalId(input.nationalId), nationalIdEnc: sealNid(input.nationalId), amount: input.amount, issuedAt: input.issuedAt, dueDate: input.dueDate, lastSyncedAt: new Date() };
  if (input.externalRef) {
    const old = await prisma.issuedCheque.findUnique({ where: { businessId_externalRef: { businessId, externalRef: input.externalRef } } });
    if (old) return prisma.issuedCheque.update({ where: { id: old.id }, data }); // a re-sent cheque never changes its status
  }
  return prisma.issuedCheque.create({ data: { ...data, businessId, externalRef: input.externalRef ?? null } });
}

async function setStatus(businessId, where, status, at = new Date()) {
  const c = await prisma.issuedCheque.findFirst({ where: { businessId, ...(where.id ? { id: where.id } : { externalRef: where.externalRef }) } });
  if (!c) return null;
  return prisma.issuedCheque.update({ where: { id: c.id }, data: { status, resolvedAt: at, lastSyncedAt: new Date() } });
}

const listForBusiness = (businessId) => prisma.issuedCheque.findMany({ where: { businessId }, orderBy: { dueDate: "asc" }, take: 500 });
const listForPerson = (nationalIdHash) => prisma.issuedCheque.findMany({ where: { nationalIdHash }, take: 500 });

/** What someone about to accept a cheque may see: totals only — never other businesses' names or single cheques. */
async function lookup(nationalId) {
  const rows = await listForPerson(hashNationalId(nationalId));
  const s = rating.chequeSummary(rows);
  return { registered: rows.length > 0, ...s, scoreImpact: rating.chequeAnalysis(rows).items.reduce((a, i) => a + i.points, 0) };
}

module.exports = { chequeInput, statusInput, lookupInput, view, upsert, setStatus, listForBusiness, listForPerson, lookup };
