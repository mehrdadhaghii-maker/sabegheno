const Module = require("module"); const path = require("path");
const ROOT = path.join(__dirname, "..", "src");
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "x".repeat(40);
const T = { facility: [], installment: [], defaulter: [], business: [] }; let id = 0;
const same = (a, b) => (a && b && a.getTime ? a.getTime() === b.getTime() : a === b);
const match = (r, w = {}) => Object.entries(w).every(([k, v]) => k === "businessId_externalRef" ? r.businessId === v.businessId && r.externalRef === v.externalRef : (v === null ? r[k] == null : same(r[k], v)));
const withInc = (n, r, include) => { if (!r || !include) return r; const o = { ...r }; if (include.installments) o.installments = T.installment.filter((i) => i.facilityId === r.id).sort((a, b) => a.seq - b.seq); if (include.business) o.business = T.business.find((b) => b.id === r.businessId); return o; };
const model = (n) => ({
  create: async ({ data }) => { const r = { id: "i" + ++id, createdAt: new Date(), ...data }; T[n].push(r); return r; },
  createMany: async ({ data }) => { data.forEach((d) => T[n].push({ id: "i" + ++id, ...d })); return { count: data.length }; },
  findUnique: async ({ where, include }) => withInc(n, T[n].find((r) => match(r, where)) || null, include),
  findFirst: async ({ where, include }) => withInc(n, T[n].find((r) => match(r, where)) || null, include),
  findMany: async ({ where, include }) => T[n].filter((r) => match(r, where)).map((r) => withInc(n, r, include)),
  update: async ({ where, data }) => Object.assign(T[n].find((r) => match(r, where)), data),
  updateMany: async ({ where, data }) => { const rs = T[n].filter((r) => match(r, where)); rs.forEach((r) => Object.assign(r, data)); return { count: rs.length }; },
  deleteMany: async ({ where }) => { const keep = T[n].filter((r) => !match(r, where)); const c = T[n].length - keep.length; T[n] = keep; return { count: c }; },
});
const prisma = { facility: model("facility"), installment: model("installment"), defaulter: model("defaulter"), business: model("business") };
const chain = new Proxy(function () {}, { get: (_, k) => (k === "then" ? undefined : chain), apply: () => chain });
const orig = Module._load;
Module._load = function (req, parent, ...r) {
  if (req === "dotenv") return { config() {} };
  if (req === "zod") return { z: chain, ...chain };
  if (/db\/prisma$/.test(req)) return prisma;
  if (/utils\/logger$/.test(req)) return { info() {}, warn() {}, error() {}, security() {}, cleanup() {}, success() {} };
  if (req === "bcryptjs") return { hash: async () => "h", hashSync: () => "h", compare: async () => true, getRounds: () => 12 };
  return orig.call(this, req, parent, ...r);
};
const assert = require("assert"); let n = 0; const ok = (m, c) => { assert(c, "FAIL: " + m); console.log("✓", m); n++; };
const F = require(path.join(ROOT, "services", "facility.service.js"));
const { hashNationalId } = require(path.join(ROOT, "utils", "crypto.js"));
const DAY = 864e5, now = Date.now(), d = (x) => new Date(now - x * DAY);
(async () => {
  // ---- pure helpers ----
  const sch = F.generateSchedule({ amount: 10_000_001, installmentCount: 4, firstDueDate: new Date("2026-01-31T00:00:00Z"), intervalMonths: 1 });
  ok("generateSchedule: 4 rows, remainder lands on the last, sum is exact", sch.length === 4 && sch.reduce((s, r) => s + r.amount, 0) === 10_000_001 && sch[3].amount === 2_500_001);
  ok("generateSchedule: month-end dates are clamped (31 Jan → 28 Feb)", sch[1].dueDate.toISOString().slice(0, 10) === "2026-02-28" && sch[2].dueDate.toISOString().slice(0, 10) === "2026-03-31");

  T.business.push({ id: "B1", brandName: "دیجی‌کالا", name: "شرکت الف" }, { id: "B2", brandName: null, name: "فروشگاه ب" });
  const nid = "0012345678", h = hashNationalId(nid);

  // ---- single-payment credit (legacy) ----
  const input = { nationalId: nid, title: "گوشی", externalRef: "INV-1", amount: 20e6, disbursedAt: d(200), dueDate: d(300), remainingAmount: 8e6, penaltyAmount: 5e5 };
  const a = await F.upsert("B1", input, "api"); const a2 = await F.upsert("B1", { ...input, remainingAmount: 6e6 }, "api");
  ok("same externalRef updates instead of duplicating", T.facility.length === 1 && a.id === a2.id && T.facility[0].remainingAmount === 6e6);
  ok("a different business may reuse the same externalRef", (await F.upsert("B2", input, "api")) && T.facility.length === 2);
  const bad = (await F.listForPerson(h)).find((r) => r.brand === "دیجی‌کالا");
  ok("300 days late (≈10 months) ⇒ معوق with penalty and brand name", bad.status === "delinquent" && bad.daysLate === 300 && bad.penaltyAmount === 5e5);
  T.defaulter.push({ nationalIdHash: h, reportedByBusinessId: "B1", status: "active" });
  const first = await F.settle("B1", { externalRef: "INV-1" }, new Date());
  ok("settle is immediate and releases the default entry", first.facility.settledAt && first.releasedDefault === true && T.defaulter[0].status === "settled");
  ok("another business can not settle it", (await F.settle("B2", { externalRef: "INV-NOPE" })) === null);

  // ---- installment credit (bank-style) ----
  const inst = { nationalId: nid, title: "اقساط ۴ ماهه", externalRef: "LOAN-9", amount: 8e6, disbursedAt: d(100), installmentCount: 4, firstDueDate: d(250), intervalMonths: 1, penaltyAmount: 0 };
  const loan = await F.upsert("B1", inst, "api");
  let rows = T.installment.filter((i) => i.facilityId === loan.id);
  ok("registered at disbursement: 4 installments, remaining = total, due date = last installment", rows.length === 4 && loan.remainingAmount === 8e6 && loan.dueDate.getTime() === rows[3].dueDate.getTime());
  let view = (await F.listForPerson(h)).find((r) => r.id === loan.id);
  ok("oldest unpaid installment is ~8 months late ⇒ معوق", view.status === "delinquent" && view.installmentCount === 4 && view.paidCount === 0);

  T.defaulter.push({ nationalIdHash: h, reportedByBusinessId: "B1", status: "active" });
  const p1 = await F.payInstallment("B1", { externalRef: "LOAN-9" }, 1, { paidAt: d(70) });
  ok("paying installment 1 reduces the remaining balance; facility stays active", p1.settled === false && p1.facility.remainingAmount === 6e6 && !p1.facility.settledAt);
  ok("paying again is idempotent", (await F.payInstallment("B1", { externalRef: "LOAN-9" }, 1, { paidAt: d(1) })).facility.remainingAmount === 6e6);
  const reup = await F.upsert("B1", { ...inst, title: "اقساط ۴ ماهه (ویرایش)" }, "api");
  ok("re-sending the schedule never un-pays an installment", T.installment.filter((i) => i.facilityId === reup.id && i.paidAt).length === 1);
  ok("after installment 1 the oldest unpaid one is still > 6 months late (معوق) ⇒ the default entry stays active", p1.releasedDefault === false && T.defaulter[1].status === "active");
  const p2 = await F.payInstallment("B1", { externalRef: "LOAN-9" }, 2, { paidAt: d(40) });
  ok("after installment 2 the next one is ~6.2 months late (معوق) ⇒ still active", p2.releasedDefault === false && T.defaulter[1].status === "active");
  const p3 = await F.payInstallment("B1", { externalRef: "LOAN-9" }, 3, { paidAt: d(10) });
  ok("after installment 3 the last one is only ~5 months late (سررسید گذشته, not معوق) ⇒ the default entry is released", p3.releasedDefault === true && T.defaulter[1].status === "settled");
  view = (await F.listForPerson(h)).find((r) => r.id === loan.id);
  ok("3 of 4 paid — late payments are recorded (lateCount) and status follows the remaining installment", view.paidCount === 3 && view.lateCount >= 1 && view.remainingAmount === 2e6);
  const last = await F.payInstallment("B1", { externalRef: "LOAN-9" }, 4, { paidAt: new Date() });
  ok("paying the LAST installment settles the facility at once", last.settled === true && last.facility.settledAt && last.facility.remainingAmount === 0);
  view = (await F.listForPerson(h)).find((r) => r.id === loan.id);
  ok("…it leaves the active ledger but stays in history (تسویه‌شده, nextDue null)", view.status === "settled" && view.nextDue === null && view.remainingAmount === 0);
  ok("unknown installment number is reported, not crashed", (await F.payInstallment("B1", { externalRef: "LOAN-9" }, 99, {})).error);

  // full settlement of a scheduled facility closes every open installment
  const loan2 = await F.upsert("B1", { ...inst, externalRef: "LOAN-10", firstDueDate: d(-10) }, "api");
  const s2 = await F.settle("B1", { externalRef: "LOAN-10" }, new Date());
  ok("settling a scheduled facility pays all remaining installments", T.installment.filter((i) => i.facilityId === loan2.id).every((i) => i.paidAt && i.paidAmount) && s2.facility.remainingAmount === 0);
  console.log(`\n${n} checks passed`);
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
