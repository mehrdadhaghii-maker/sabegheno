// Facility ledger — bank-style. Every credit a business grants is registered the moment it is paid out
// (like a loan appearing in SAMAT), installments are paid one by one, and when the LAST installment is
// paid the facility leaves the active ledger. How the person paid decides their rating.
const { z } = require("zod");
const prisma = require("../db/prisma");
const { hashNationalId } = require("../utils/crypto");
const { sealNid, openNid, maskNid } = require("../utils/nid");
const rating = require("./rating.service");
const webhooks = require("./webhook.service");

// Events go back to the business only when the change did NOT come from its own system (api / sync).
const echo = (origin) => origin === "panel" || origin === "admin";

const brandOf = (b) => b?.brandName || b?.name || "کسب‌وکار";
const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "تاریخ نامعتبر است").transform((s) => new Date(s));
const money = z.number().int().min(0).max(1_000_000_000_000);

const scheduleRow = z.object({ dueDate: isoDate, amount: money.refine((n) => n > 0, "مبلغ قسط باید بیشتر از صفر باشد"), paidAt: isoDate.optional() });

const facilityInput = z.object({
  nationalId: z.string().regex(/^\d{10}$/, "کد ملی باید ۱۰ رقم باشد"),
  title: z.string().max(120).optional(),
  externalRef: z.string().min(1).max(100).optional(),
  amount: money.refine((n) => n > 0, "مبلغ باید بیشتر از صفر باشد"),
  disbursedAt: isoDate,
  dueDate: isoDate.optional(),                       // only for a single-payment credit
  remainingAmount: money.optional(),
  penaltyAmount: money.optional(),
  settledAt: isoDate.optional(),
  // --- installments: either the full schedule …
  installments: z.array(scheduleRow).min(1).max(120).optional(),
  // … or a generator
  installmentCount: z.number().int().min(2).max(120).optional(),
  firstDueDate: isoDate.optional(),
  intervalMonths: z.number().int().min(1).max(12).optional(),
  installmentAmount: money.optional(),
}).superRefine((v, ctx) => {
  const sched = !!v.installments || !!v.installmentCount;
  if (!sched && !v.dueDate) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "سررسید یا برنامهٔ اقساط را وارد کنید" });
  if (v.installmentCount && !v.firstDueDate) ctx.addIssue({ code: "custom", path: ["firstDueDate"], message: "تاریخ سررسید قسط اول را وارد کنید" });
  if (v.dueDate && v.dueDate < v.disbursedAt) ctx.addIssue({ code: "custom", path: ["dueDate"], message: "سررسید نمی‌تواند قبل از تاریخ دریافت باشد" });
  if (v.remainingAmount != null && v.remainingAmount > v.amount && !sched) ctx.addIssue({ code: "custom", path: ["remainingAmount"], message: "مانده نمی‌تواند از مبلغ اعتبار بیشتر باشد" });
});

const facilityPatch = z.object({
  dueDate: isoDate.optional(), remainingAmount: money.optional(), penaltyAmount: money.optional(), title: z.string().max(120).optional(),
});
const settleInput = z.object({ settledAt: isoDate.optional() }).default({});
const payInput = z.object({ paidAt: isoDate.optional(), paidAmount: money.optional() }).default({});

// ---- pure helpers (unit-tested) -------------------------------------------------------------------
function addMonths(date, k) {
  const d = new Date(date), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** Equal installments; the rounding remainder goes to the LAST one so the sum is exact. */
function generateSchedule({ amount, installmentCount, firstDueDate, intervalMonths = 1, installmentAmount }) {
  const each = installmentAmount || Math.floor(amount / installmentCount);
  const rows = [];
  for (let i = 0; i < installmentCount; i += 1) rows.push({ dueDate: addMonths(firstDueDate, i * intervalMonths), amount: each });
  if (!installmentAmount) rows[rows.length - 1].amount += amount - each * installmentCount;
  return rows;
}

const scheduleOf = (input) => input.installments || (input.installmentCount ? generateSchedule(input) : null);

// ---- reads ------------------------------------------------------------------------------------------
async function listForPerson(nationalIdHash, now = new Date()) {
  const rows = await prisma.facility.findMany({
    where: { nationalIdHash },
    include: { business: { select: { brandName: true, name: true } }, installments: { orderBy: { seq: "asc" } } },
    orderBy: { disbursedAt: "desc" },
    take: 200,
  });
  return rows.map((r) => rating.describeFacility(r, brandOf(r.business), now));
}

const listForBusiness = (businessId, take = 200) =>
  prisma.facility.findMany({ where: { businessId }, include: { installments: { orderBy: { seq: "asc" } } }, orderBy: { createdAt: "desc" }, take });

const getOne = (businessId, where) =>
  prisma.facility.findFirst({ where: { businessId, ...(where.id ? { id: where.id } : { externalRef: where.externalRef }) }, include: { installments: { orderBy: { seq: "asc" } } } });

// ---- writes -----------------------------------------------------------------------------------------
async function upsert(businessId, input, source = "panel") {
  const nationalIdHash = hashNationalId(input.nationalId);
  const schedule = scheduleOf(input);
  const data = {
    nationalIdHash, nationalIdEnc: sealNid(input.nationalId), title: input.title ?? null, amount: input.amount, disbursedAt: input.disbursedAt,
    penaltyAmount: input.penaltyAmount ?? 0, lastSyncedAt: new Date(), staleNotifiedAt: null,
  };

  let existing = null;
  if (input.externalRef) existing = await prisma.facility.findUnique({ where: { businessId_externalRef: { businessId, externalRef: input.externalRef } }, include: { installments: true } });

  let rows = null;
  if (schedule) {
    const old = new Map((existing?.installments || []).map((i) => [i.seq, i]));
    rows = schedule.map((r, idx) => {
      const prev = old.get(idx + 1);
      const paidAt = r.paidAt ?? prev?.paidAt ?? null; // an update never "un-pays" an installment
      return { seq: idx + 1, dueDate: r.dueDate, amount: r.amount, paidAt, paidAmount: paidAt ? (prev?.paidAmount ?? r.amount) : null };
    });
    const unpaid = rows.filter((r) => !r.paidAt);
    data.dueDate = rows[rows.length - 1].dueDate;
    data.remainingAmount = unpaid.reduce((s, r) => s + r.amount, 0);
    data.settledAt = unpaid.length ? null : new Date(Math.max(...rows.map((r) => r.paidAt.getTime())));
  } else {
    data.dueDate = input.dueDate;
    data.remainingAmount = input.settledAt ? 0 : input.remainingAmount ?? input.amount;
    data.settledAt = input.settledAt ?? null;
  }

  const fac = existing
    ? await prisma.facility.update({ where: { id: existing.id }, data })
    : await prisma.facility.create({ data: { ...data, businessId, externalRef: input.externalRef ?? null, source } });
  if (!existing && echo(source)) webhooks.enqueue(businessId, "facility.created", { facilityId: fac.id, externalRef: fac.externalRef, amount: fac.amount, installments: rows ? rows.length : 0 });

  if (rows) {
    await prisma.installment.deleteMany({ where: { facilityId: fac.id } });
    await prisma.installment.createMany({ data: rows.map((r) => ({ ...r, facilityId: fac.id })) });
  }
  return fac;
}

async function patch(businessId, id, input) {
  const f = await prisma.facility.findUnique({ where: { id }, include: { installments: true } });
  if (!f || f.businessId !== businessId) return null;
  const sched = f.installments.length > 0;
  if (sched && (input.remainingAmount != null || input.dueDate)) throw Object.assign(new Error("برای اعتبار اقساطی، مانده و سررسید از روی پرداخت اقساط محاسبه می‌شود"), { status: 400, publicMessage: "برای اعتبار اقساطی، مانده و سررسید از روی پرداخت اقساط محاسبه می‌شود" });
  if (input.remainingAmount != null && input.remainingAmount > f.amount) throw Object.assign(new Error("مانده نمی‌تواند از مبلغ اعتبار بیشتر باشد"), { status: 400, publicMessage: "مانده نمی‌تواند از مبلغ اعتبار بیشتر باشد" });
  return prisma.facility.update({ where: { id }, data: { ...input, lastSyncedAt: new Date(), staleNotifiedAt: null } });
}

/** When nothing delinquent/doubtful is left at this business, the platform-wide default they reported is released. */
async function releaseDefaultIfClear(businessId, nationalIdHash) {
  const open = await prisma.facility.findMany({ where: { businessId, nationalIdHash, settledAt: null }, include: { installments: true } });
  if (open.some((o) => ["delinquent", "doubtful"].includes(rating.facilityStatus(o)))) return false;
  const r = await prisma.defaulter.updateMany({ where: { nationalIdHash, reportedByBusinessId: businessId, status: "active" }, data: { status: "settled", resolvedAt: new Date() } });
  return r.count > 0;
}

/** Pays ONE installment. Paying the last one settles the facility at once. */
async function payInstallment(businessId, where, seq, { paidAt = new Date(), paidAmount } = {}, origin = "panel") {
  const f = await getOne(businessId, where);
  if (!f) return null;
  const inst = f.installments.find((i) => i.seq === seq);
  if (!inst) return { error: "قسط یافت نشد" };
  if (!inst.paidAt) {
    await prisma.installment.update({ where: { id: inst.id }, data: { paidAt, paidAmount: paidAmount ?? inst.amount } });
    inst.paidAt = paidAt;
  }
  const unpaid = f.installments.filter((i) => !i.paidAt);
  const done = unpaid.length === 0;
  const last = done ? new Date(Math.max(...f.installments.map((i) => new Date(i.paidAt).getTime()))) : null;
  await prisma.facility.update({ where: { id: f.id }, data: { remainingAmount: unpaid.reduce((s, i) => s + i.amount, 0), settledAt: last, lastSyncedAt: new Date(), staleNotifiedAt: null } });
  const releasedDefault = await releaseDefaultIfClear(businessId, f.nationalIdHash);
  if (echo(origin)) { webhooks.enqueue(businessId, "installment.paid", { facilityId: f.id, externalRef: f.externalRef, seq, paidAt }); if (done) webhooks.enqueue(businessId, "facility.settled", { facilityId: f.id, externalRef: f.externalRef, settledAt: last }); }
  return { facility: await getOne(businessId, { id: f.id }), releasedDefault, settled: done };
}

/** Full settlement, applied IMMEDIATELY (remaining installments are closed at the settlement date). */
async function settle(businessId, where, settledAt = new Date(), origin = "panel") {
  const f = await getOne(businessId, where);
  if (!f) return null;
  // close every open installment at the settlement date (paidAmount = its own amount)
  const open = f.installments.filter((i) => !i.paidAt);
  await Promise.all(open.map((i) => prisma.installment.update({ where: { id: i.id }, data: { paidAt: settledAt, paidAmount: i.amount } })));
  await prisma.facility.update({ where: { id: f.id }, data: { settledAt, remainingAmount: 0, lastSyncedAt: new Date(), staleNotifiedAt: null } });
  const releasedDefault = await releaseDefaultIfClear(businessId, f.nationalIdHash);
  if (echo(origin)) webhooks.enqueue(businessId, "facility.settled", { facilityId: f.id, externalRef: f.externalRef, settledAt });
  return { facility: await getOne(businessId, { id: f.id }), releasedDefault };
}

const ownerIdFields = (row) => { const n = openNid(row.nationalIdEnc); return { nationalId: n, nationalIdMasked: maskNid(n) }; };

/** Many credits at once (Excel import / API bulk). Each row succeeds or fails on its own, with a precise reason. */
async function bulkUpsert(businessId, items, source = "panel") {
  const results = [];
  for (const [index, raw] of items.entries()) {
    const p = facilityInput.safeParse(raw);
    if (!p.success) { const i = p.error.issues[0]; results.push({ index, ok: false, field: i?.path?.join(".") || null, error: i?.message || "ورودی نامعتبر" }); continue; }
    try { const row = await upsert(businessId, p.data, source); results.push({ index, ok: true, id: row.id, externalRef: row.externalRef }); }
    catch { results.push({ index, ok: false, field: null, error: "ذخیره نشد" }); }
  }
  return { total: items.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results };
}

module.exports = { bulkUpsert, ownerIdFields, facilityInput, facilityPatch, settleInput, payInput, listForPerson, listForBusiness, getOne, upsert, patch, payInstallment, settle, generateSchedule, addMonths, brandOf };
