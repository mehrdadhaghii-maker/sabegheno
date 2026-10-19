const Module = require("module"); const path = require("path");
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "x".repeat(40); process.env.ENCRYPTION_KEY = "k".repeat(40);
const ROOT = path.join(__dirname, "..", "src");
const T = { facility: [], installment: [], defaulter: [], business: [], webhookDelivery: [] }; let id = 0;
const same = (a, b) => (a && b && a.getTime ? a.getTime() === b.getTime() : a === b);
const match = (r, w = {}) => Object.entries(w).every(([k, v]) => {
  if (k === "businessId_externalRef") return r.businessId === v.businessId && r.externalRef === v.externalRef;
  if (v && typeof v === "object" && !(v instanceof Date)) { if ("not" in v) return r[k] !== v.not && r[k] != null; if ("lte" in v) return r[k] <= v.lte; return true; }
  return v === null ? r[k] == null : same(r[k], v);
});
const withInc = (r, inc) => { if (!r || !inc) return r; const o = { ...r }; if (inc.installments) o.installments = T.installment.filter((i) => i.facilityId === r.id).sort((a, b) => a.seq - b.seq); return o; };
const model = (n) => ({
  create: async ({ data }) => { const r = { id: "i" + ++id, createdAt: new Date(), ...(n === "webhookDelivery" ? { status: "pending", attempts: 0, nextAttemptAt: new Date() } : {}), ...data }; T[n].push(r); return r; },
  createMany: async ({ data }) => { data.forEach((d) => T[n].push({ id: "i" + ++id, ...d })); return { count: data.length }; },
  findUnique: async ({ where, include }) => withInc(T[n].find((r) => match(r, where)) || null, include),
  findFirst: async ({ where, include }) => withInc(T[n].find((r) => match(r, where)) || null, include),
  findMany: async ({ where, include, take }) => T[n].filter((r) => match(r, where)).slice(0, take || 999).map((r) => withInc(r, include)),
  update: async ({ where, data }) => Object.assign(T[n].find((r) => match(r, where)), data),
  updateMany: async ({ where, data }) => { const rs = T[n].filter((r) => match(r, where)); rs.forEach((r) => Object.assign(r, data)); return { count: rs.length }; },
  deleteMany: async ({ where }) => { const keep = T[n].filter((r) => !match(r, where)); const c = T[n].length - keep.length; T[n] = keep; return { count: c }; },
});
const prisma = Object.fromEntries(Object.keys(T).map((n) => [n, model(n)]));
const chain = new Proxy(function () {}, { get: (_, k) => (k === "then" ? undefined : chain), apply: () => chain });
const orig = Module._load;
Module._load = function (req, parent, ...r) {
  if (req === "dotenv") return { config() {} }; if (req === "zod") return { z: chain, ...chain };
  if (/db\/prisma$/.test(req)) return prisma; if (/utils\/logger$/.test(req)) return { info() {}, warn() {}, error() {}, security() {}, cleanup() {}, success() {} };
  if (req === "bcryptjs") return { hash: async () => "h", hashSync: () => "h", compare: async () => true, getRounds: () => 12 };
  return orig.call(this, req, parent, ...r);
};
const assert = require("assert"); let n = 0; const ok = (m, c) => { assert(c, "FAIL: " + m); console.log("✓", m); n++; };
const W = require(path.join(ROOT, "services", "webhook.service.js"));
const S = require(path.join(ROOT, "services", "syncPull.service.js"));
const F = require(path.join(ROOT, "services", "facility.service.js"));
const { encrypt } = require(path.join(ROOT, "utils", "secret.js"));
const DAY = 864e5, now = Date.now(), d = (x) => new Date(now - x * DAY);
(async () => {
  const ts = String(Math.floor(Date.now() / 1000)), body = '{"event":"x"}', sig = W.sign("whsec_abc", ts, body);
  ok("signature verifies; tampered body / wrong secret / missing signature / 10-min-old timestamp are rejected", W.verify("whsec_abc", ts, body, sig) && !W.verify("whsec_abc", ts, body + " ", sig) && !W.verify("whsec_zzz", ts, body, sig) && !W.verify("whsec_abc", ts, body, null) && !W.verify("whsec_abc", String(Math.floor(Date.now() / 1000) - 600), body, W.sign("whsec_abc", String(Math.floor(Date.now() / 1000) - 600), body)));
  ok("retry schedule 1 / 5 / 30 / 120 / 360 / 1440 minutes, then give up (7 attempts)", [1, 2, 3, 4, 5, 6].map(W.nextDelayMs).join() === [1, 5, 30, 120, 360, 1440].map((m) => m * 60000).join() && W.nextDelayMs(7) === null && W.MAX_ATTEMPTS === 7);
  T.business.push({ id: "B1", webhookUrl: "https://8.8.8.8/hook", webhookSecretEnc: encrypt("whsec_real") }, { id: "B2", webhookUrl: null }, { id: "B3", webhookUrl: "http://127.0.0.1/hook", webhookSecretEnc: encrypt("s") });
  ok("no webhook URL ⇒ nothing queued", (await W.enqueue("B2", "facility.settled", {})) === null && T.webhookDelivery.length === 0);
  const q = await W.enqueue("B1", "facility.settled", { externalRef: "L1" });
  ok("an event is queued with a self-describing payload", q.status === "pending" && q.payload.event === "facility.settled" && q.payload.data.externalRef === "L1");
  let sent = null; global.fetch = async (u, o) => { sent = { u, o }; return { status: 200 }; };
  await W.deliverDue();
  ok("delivery: signed headers, JSON body, no redirects, marked delivered", T.webhookDelivery[0].status === "delivered" && sent.o.headers["X-Sabegheno-Event"] === "facility.settled" && W.verify("whsec_real", sent.o.headers["X-Sabegheno-Timestamp"], sent.o.body, sent.o.headers["X-Sabegheno-Signature"]) && sent.o.redirect === "manual");
  const q2 = await W.enqueue("B1", "installment.paid", {}); global.fetch = async () => ({ status: 500 }); await W.deliverDue();
  ok("a failing receiver ⇒ stays pending, attempt counted, retried LATER", q2.attempts === 1 && q2.status === "pending" && q2.nextAttemptAt.getTime() > Date.now() + 30000 && /500/.test(q2.lastError));
  q2.attempts = 6; q2.nextAttemptAt = new Date(0); await W.deliverDue();
  ok("after 7 failed attempts it is marked failed", q2.status === "failed" && q2.attempts === 7);
  const q3 = await W.enqueue("B3", "facility.created", {}); global.fetch = async () => { throw new Error("must not be called"); }; await W.deliverDue();
  ok("SSRF guard: a webhook pointing at localhost is never contacted", q3.attempts === 1 && /داخلی|localhost|\.local/.test(q3.lastError));

  T.webhookDelivery.length = 0; global.fetch = async () => ({ status: 200 });
  const base = { nationalId: "0012345678", amount: 4e6, disbursedAt: d(100), installmentCount: 4, firstDueDate: d(70), intervalMonths: 1 };
  await F.upsert("B1", { ...base, externalRef: "P-1" }, "panel"); await F.upsert("B1", { ...base, externalRef: "A-1" }, "api");
  await F.payInstallment("B1", { externalRef: "P-1" }, 1, {}, "panel"); await F.payInstallment("B1", { externalRef: "A-1" }, 1, {}, "api");
  await F.settle("B1", { externalRef: "P-1" }, new Date(), "panel"); await F.settle("B1", { externalRef: "A-1" }, new Date(), "api");
  const cnt = (e) => T.webhookDelivery.filter((x) => x.event === e).length;
  ok("events echo only for PANEL actions (created / installment.paid / settled = 1 each); API actions never echo", cnt("facility.created") === 1 && cnt("installment.paid") === 1 && cnt("facility.settled") === 1);

  await F.upsert("B1", { ...base, externalRef: "S-1" }, "api"); await F.upsert("B1", { ...base, externalRef: "S-2" }, "api");
  let r = await S.applyItem("B1", { externalRef: "S-1", status: "open", installments: [{ seq: 1, paidAt: d(60).toISOString() }, { seq: 2, paidAt: d(30).toISOString(), paidAmount: 1000000 }] });
  ok("sync: installments paid on their side are applied; a second identical answer changes nothing", r.installmentsPaid === 2 && (await S.applyItem("B1", { externalRef: "S-1", installments: [{ seq: 1, paidAt: d(5).toISOString() }] })).installmentsPaid === 0);
  r = await S.applyItem("B1", { externalRef: "S-2", status: "settled", settledAt: d(1).toISOString() });
  ok("sync: a settlement on their side settles the credit here; garbage/unknown are reported", r.settled === true && T.facility.find((f) => f.externalRef === "S-2").remainingAmount === 0 && (await S.applyItem("B1", { externalRef: "NOPE" })).error && (await S.applyItem("B1", null)).error);
  await F.upsert("B1", { ...base, externalRef: "S-3" }, "api"); await F.upsert("B1", { ...base, externalRef: "S-4" }, "api");
  T.business[0].syncUrl = "https://8.8.8.8/sync"; T.business[0].syncKeyEnc = encrypt("secret-key");
  let asked = null;
  global.fetch = async (u, o) => { asked = { o, body: JSON.parse(o.body) }; return { ok: true, status: 200, text: async () => JSON.stringify({ items: [{ externalRef: "S-3", status: "settled" }, { externalRef: "SOMEONE-ELSES", status: "settled" }] }) }; };
  const out = await S.syncBusiness(T.business[0]);
  ok("pull request: only OPEN credits, Bearer key, manual redirect", asked.o.headers.Authorization === "Bearer secret-key" && asked.body.items.map((x) => x.externalRef).sort().join() === "S-1,S-3,S-4" && asked.o.redirect === "manual");
  ok("an answer can only touch credits we asked about; result + time stored", out.settled === 1 && out.invalid === 1 && T.facility.find((f) => f.externalRef === "S-4").settledAt == null && T.business[0].lastSyncAt instanceof Date && /1 تسویه/.test(T.business[0].lastSyncResult));
  global.fetch = async () => ({ ok: false, status: 502, text: async () => "" });
  ok("a failing partner endpoint is recorded, never thrown", (await S.syncBusiness(T.business[0])).ok === false && /502/.test(T.business[0].lastSyncResult));
  console.log(n + " integration checks passed");
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
