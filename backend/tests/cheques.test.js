const Module = require("module"); const path = require("path");
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "x".repeat(40); process.env.ENCRYPTION_KEY = "k".repeat(40);
const T = { issuedCheque: [] }; let id = 0;
const same = (a, b) => (a && b && a.getTime ? a.getTime() === b.getTime() : a === b);
const match = (r, w = {}) => Object.entries(w).every(([k, v]) => k === "businessId_externalRef" ? r.businessId === v.businessId && r.externalRef === v.externalRef : same(r[k], v));
const prisma = { issuedCheque: {
  create: async ({ data }) => { const r = { id: "c" + ++id, status: "pending", resolvedAt: null, ...data }; T.issuedCheque.push(r); return r; },
  findUnique: async ({ where }) => T.issuedCheque.find((r) => match(r, where)) || null,
  findFirst: async ({ where }) => T.issuedCheque.find((r) => match(r, where)) || null,
  findMany: async ({ where }) => T.issuedCheque.filter((r) => match(r, where)),
  update: async ({ where, data }) => Object.assign(T.issuedCheque.find((r) => r.id === where.id), data),
} };
const chain = new Proxy(function () {}, { get: (_, k) => (k === "then" ? undefined : chain), apply: () => chain });
const orig = Module._load;
Module._load = function (req, parent, ...r) { if (req === "dotenv") return { config() {} }; if (req === "zod") return { z: chain, ...chain }; if (/db\/prisma$/.test(req)) return prisma; if (req === "bcryptjs") return { hash: async () => "h", hashSync: () => "h", compare: async () => true, getRounds: () => 12 }; return orig.call(this, req, parent, ...r); };
const assert = require("assert"); let n = 0; const ok = (m, c) => { assert(c, "FAIL: " + m); console.log("✓", m); n++; };
const R = require(path.join(__dirname, "..", "src", "services", "rating.service.js"));
const C = require(path.join(__dirname, "..", "src", "services", "cheque.service.js"));
const now = new Date("2026-10-09T00:00:00Z"), d = (x) => new Date(now - x * 864e5);
const ch = (o) => ({ status: "pending", amount: 10e6, dueDate: d(-30), resolvedAt: null, ...o });
const many = (k, o) => Array.from({ length: k }, () => ch(o));
(async () => {
  ok("no cheques ⇒ no history", R.platformAnalysis([], now, []).score === null);
  const s = [3, 4, 7, 11].map((k) => R.chequeSummary(many(k), now));
  ok("pending ladder 3 ⇒ 0, 4 ⇒ −10, 7 ⇒ −25, 11 ⇒ −40; risk low/medium/high", s.map((x) => x.pendingPenalty).join() === "0,10,25,40" && s[0].riskLevel === "low" && s[1].riskLevel === "medium" && s[3].riskLevel === "high");
  const a4 = R.platformAnalysis([], now, many(4));
  ok("4 pending cheques ⇒ platform score 690 with a printed reason and the total amount", a4.score === 690 && /4 چک در راه/.test(a4.items[0].label) && /40,000,000/.test(a4.items[0].detail));
  const bounced = [ch({ status: "bounced", resolvedAt: d(30) }), ch({ status: "bounced", resolvedAt: d(60) })];
  ok("bounced −40 each (two ⇒ −80, risk high); older than 24 months forgotten; cap −160", R.chequeAnalysis(bounced, now).items[0].points === -80 && R.chequeSummary(bounced, now).riskLevel === "high" && R.chequeSummary([ch({ status: "bounced", resolvedAt: d(800) })], now).bouncedCount === 0 && R.chequeAnalysis(many(9, { status: "bounced", resolvedAt: d(10) }), now).items[0].points === -160);
  ok("pending past due: −10 each (cap −40); cashed +2 each (cap +20); cancelled costs nothing", R.chequeAnalysis([ch({ dueDate: d(5) }), ch({ dueDate: d(9) })], now).items.some((i) => i.key === "cheque_overdue" && i.points === -20) && R.chequeAnalysis(many(8, { dueDate: d(5) }), now).items.find((i) => i.key === "cheque_overdue").points === -40 && R.platformAnalysis([], now, many(5, { status: "cashed", resolvedAt: d(3) })).score === 710 && R.chequeAnalysis(many(12, { status: "cancelled" }), now).items.length === 0);
  const A = await C.upsert("B1", { nationalId: "0012345678", externalRef: "SAYAD-1", amount: 5e6, issuedAt: d(10), dueDate: new Date(+now + 30 * 864e5) });
  const A2 = await C.upsert("B1", { nationalId: "0012345678", externalRef: "SAYAD-1", amount: 6e6, issuedAt: d(10), dueDate: new Date(+now + 30 * 864e5) });
  ok("same externalRef updates (no duplicate); the national ID is stored sealed", A.id === A2.id && T.issuedCheque.length === 1 && A.nationalIdEnc && !/0012345678/.test(A.nationalIdEnc));
  await C.setStatus("B1", { externalRef: "SAYAD-1" }, "bounced", new Date());
  await C.upsert("B1", { nationalId: "0012345678", externalRef: "SAYAD-1", amount: 6e6, issuedAt: d(10), dueDate: new Date(+now + 30 * 864e5) });
  ok("re-sending a cheque never resets its status; another business can not change it", T.issuedCheque[0].status === "bounced" && (await C.setStatus("B2", { externalRef: "SAYAD-1" }, "cashed")) === null);
  for (let i = 0; i < 5; i++) await C.upsert("B2", { nationalId: "0012345678", externalRef: `X${i}`, amount: 1e6, issuedAt: d(1), dueDate: new Date(+now + 20 * 864e5) });
  const lk = await C.lookup("0012345678");
  ok("lookup across businesses = totals only (5 pending, 1 bounced, medium risk, impact −50); no names or single cheques", lk.registered && lk.pendingCount === 5 && lk.bouncedCount === 1 && lk.scoreImpact === -50 && lk.riskLevel === "medium" && !("brand" in lk) && !("items" in lk));
  ok("unknown person ⇒ registered:false", (await C.lookup("1111111111")).registered === false);
  const v = C.view(T.issuedCheque[1]);
  ok("owner view: full + masked national ID, never the ciphertext", v.nationalId === "0012345678" && v.nationalIdMasked === "001****678" && !("nationalIdEnc" in v));
  console.log(n + " cheque checks passed");
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
