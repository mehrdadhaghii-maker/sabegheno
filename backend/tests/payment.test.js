const Module = require("module"); const path = require("path");
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "x".repeat(40);
const T = { payment: [] }; let id = 0;
const match = (r, w = {}) => Object.entries(w).every(([k, v]) => {
  if (k === "OR") return v.some((x) => match(r, x));
  if (v && typeof v === "object" && !(v instanceof Date)) { if ("gt" in v) return r[k] != null && r[k] > v.gt; return true; }
  return v === null ? r[k] == null : r[k] === v;
});
const prisma = { payment: {
  create: async ({ data }) => { const r = { id: "p" + ++id, usedAt: null, reportSnapshot: null, ...data }; T.payment.push(r); return r; },
  findFirst: async ({ where, orderBy }) => { let rs = T.payment.filter((r) => match(r, where)); if (orderBy?.paidAt) rs = rs.sort((a, b) => a.paidAt - b.paidAt); if (orderBy?.usedAt) rs = rs.sort((a, b) => b.usedAt - a.usedAt); return rs[0] || null; },
  update: async ({ where, data }) => Object.assign(T.payment.find((r) => r.id === where.id), data),
  updateMany: async ({ where, data }) => { const rs = T.payment.filter((r) => match(r, where)); rs.forEach((r) => Object.assign(r, data)); return { count: rs.length }; },
} };
const orig = Module._load;
Module._load = function (req, parent, ...r) { if (req === "dotenv") return { config() {} }; if (/db\/prisma$/.test(req)) return prisma; return orig.call(this, req, parent, ...r); };
const assert = require("assert"); let n = 0; const ok = (m, c) => { assert(c, "FAIL: " + m); console.log("✓", m); n++; };
const P = require(path.join(__dirname, "..", "src", "services", "payment.service.js"));
const env = require(path.join(__dirname, "..", "src", "config", "env.js"));
(async () => {
  ok("price per inquiry is 15,000 toman", env.payment.priceToman === 15000);
  let calls = 0; const gen = async () => { calls++; return { report: { score: 600 + calls } }; };
  ok("nothing paid ⇒ null (402 PAYMENT_REQUIRED)", (await P.getOrCreateReport("u1", gen)) === null && calls === 0 && (await P.hasPaidReport("u1")) === false);

  await prisma.payment.create({ data: { userId: "u1", status: "paid", paidAt: new Date(), amount: 15000 } });
  ok("a paid, unused payment is visible to the status check", (await P.hasPaidReport("u1")) === true);
  const r1 = await P.getOrCreateReport("u1", gen);
  ok("first request consumes the payment and generates ONE report", calls === 1 && r1.report.score === 601 && T.payment[0].usedAt instanceof Date);
  const r1b = await P.getOrCreateReport("u1", gen);
  ok("reloading the page returns the stored report — no second charge, no second generation", calls === 1 && r1b.report.score === 601);

  await prisma.payment.create({ data: { userId: "u1", status: "paid", paidAt: new Date(), amount: 15000 } });
  const r2 = await P.getOrCreateReport("u1", gen);
  ok("a NEW inquiry needs (and uses) a NEW payment ⇒ fresh report", calls === 2 && r2.report.score === 602);

  await prisma.payment.create({ data: { userId: "u2", status: "paid", paidAt: new Date(), amount: 15000 } });
  let boom = null; try { await P.getOrCreateReport("u2", async () => { throw new Error("bureau down"); }); } catch (e) { boom = e; }
  const p2 = T.payment.find((p) => p.userId === "u2");
  ok("if report generation fails the payment is given back (not lost)", boom && p2.usedAt === null && (await P.hasPaidReport("u2")) === true);

  await prisma.payment.create({ data: { userId: "u3", status: "paid", paidAt: new Date(), amount: 15000 } });
  let g3 = 0; const slow = async () => { g3++; await new Promise((r) => setTimeout(r, 20)); return { report: { score: 700 } }; };
  const [a, b] = await Promise.all([P.getOrCreateReport("u3", slow), P.getOrCreateReport("u3", slow)]);
  ok("two parallel requests can never spend the same payment twice", g3 === 1 && (a === null || b === null || a.report.score === 700));

  await prisma.payment.create({ data: { userId: "u4", status: "paid", paidAt: new Date(Date.now() - 30 * 3600_000), amount: 15000 } });
  ok("a payment older than 24 h can not be used any more", (await P.getOrCreateReport("u4", gen)) === null);
  ok("pending / failed payments never unlock a report", (await prisma.payment.create({ data: { userId: "u5", status: "pending", amount: 15000 } })) && (await P.getOrCreateReport("u5", gen)) === null);
  console.log(n + " payment checks passed");
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
