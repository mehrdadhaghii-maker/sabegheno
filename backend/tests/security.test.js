const Module = require("module"); const path = require("path");
const ROOT = require("path").join(__dirname, "..", "src");
process.env.NODE_ENV = "test"; process.env.JWT_SECRET = "x".repeat(40);

// ---------- stubs for packages that are not installed in this sandbox ----------
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const fakeJwt = { sign: (p, s, o) => `${b64({alg:"HS256"})}.${b64({ ...p, exp: Math.floor(Date.now()/1000) + 900 })}.sig`, verify: (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url")) };
// ---------- fake in-memory Prisma ----------
const T = { session: [], business: [], endUser: [], otpCode: [], notification: [], supportTicket: [], paymentCard: [], creditCheck: [], inquiryLog: [], customRule: [], provider: [], loginAttempt: [], cleanupReport: [], apiKey: [], facility: [], installment: [], ticketAttachment: [], issuedCheque: [] };
let id = 0; const nid = () => "id" + (++id);
const match = (row, w = {}) => Object.entries(w).every(([k, v]) => {
  if (k === "OR") return v.some((x) => match(row, x));
  if (v && typeof v === "object" && !(v instanceof Date)) {
    if ("lt" in v) return row[k] != null && row[k] < v.lt;
    if ("gt" in v) return row[k] != null && row[k] > v.gt;
    if ("not" in v) return row[k] !== v.not;
    return true;
  }
  return v === null ? row[k] == null : row[k] === v;
});
const apply = (row, data) => { for (const [k, v] of Object.entries(data)) row[k] = (v && typeof v === "object" && "increment" in v) ? (row[k] || 0) + v.increment : v; return row; };
const model = (name, defaults = () => ({})) => ({
  create: async ({ data }) => { const r = { id: nid(), createdAt: new Date(), ...defaults(), ...data }; T[name].push(r); return r; },
  createMany: async ({ data }) => { data.forEach((d) => T[name].push({ id: nid(), ...d })); return { count: data.length }; },
  findUnique: async ({ where }) => T[name].find((r) => match(r, where)) || null,
  findMany: async ({ where } = {}) => T[name].filter((r) => match(r, where)),
  update: async ({ where, data }) => { const r = T[name].find((x) => match(x, where)); if (!r) throw new Error("not found"); return apply(r, data); },
  updateMany: async ({ where, data }) => { const rs = T[name].filter((x) => match(x, where)); rs.forEach((r) => apply(r, data)); return { count: rs.length }; },
  delete: async ({ where }) => { const i = T[name].findIndex((x) => match(x, where)); if (i < 0) throw new Error("not found"); T[name].splice(i, 1); },
  deleteMany: async ({ where } = {}) => { const keep = T[name].filter((x) => !match(x, where)); const n = T[name].length - keep.length; T[name] = keep; return { count: n }; },
});
const prisma = Object.fromEntries(Object.keys(T).map((n) => [n, model(n, n === "session" ? () => ({ lastActivityAt: new Date(), revokedAt: null }) : n === "business" ? () => ({ lastActiveAt: new Date(), deletedAt: null }) : n === "endUser" ? () => ({ lastActiveAt: new Date(), deletedAt: null }) : () => ({}))]));
prisma.$transaction = async (ops) => Promise.all(ops);

const logs = [];
const stubLogger = { info: (...a) => logs.push(a), warn: (...a) => logs.push(a), error: (...a) => logs.push(["ERR", ...a]), cleanup: (...a) => logs.push(a), success: () => {}, security: () => {} };
const orig = Module._load;
Module._load = function (req, parent, ...r) {
  if (req === "dotenv") return { config() {} };
  if (req === "jsonwebtoken") return fakeJwt;
  if (/db\/prisma$/.test(req)) return prisma;
  if (/utils\/logger$/.test(req)) return stubLogger;
  return orig.call(this, req, parent, ...r);
};
const assert = require("assert");
const S = require(ROOT + "/services/session.service.js");
const R = require(ROOT + "/services/dataRetention.service.js");
let pass = 0; const ok = (name, cond) => { assert(cond, "FAILED: " + name); console.log("✓", name); pass++; };

(async () => {
  // ----- single session + replaced -----
  const a1 = await S.createSession({ role: "business", id: "B1", ip: "1.1.1.1" });
  ok("first login creates an active session", T.session.filter((s) => !s.revokedAt).length === 1);
  const a2 = await S.createSession({ role: "business", id: "B1", ip: "2.2.2.2" });
  ok("second login revokes the first (new_login)", T.session.find((s) => s.id === a1.session.id).revokedReason === "new_login");
  ok("exactly one ACTIVE session per account", T.session.filter((s) => !s.revokedAt && s.subjectId === "B1").length === 1);
  let bad = await S.check(a1.session.id, "business", "B1");
  ok("old session is rejected with SESSION_REPLACED", bad && bad.code === "SESSION_REPLACED");
  ok("new session is valid", (await S.check(a2.session.id, "business", "B1")) === null);
  ok("session is bound to its owner (wrong id → invalid)", (await S.check(a2.session.id, "business", "OTHER")).code === "SESSION_INVALID");
  ok("session is bound to its role", (await S.check(a2.session.id, "admin", "B1")).code === "SESSION_INVALID");

  // ----- background poll vs real activity -----
  const row = T.session.find((s) => s.id === a2.session.id);
  row.lastActivityAt = new Date(Date.now() - 20 * 60_000); const before = row.lastActivityAt.getTime();
  await S.check(a2.session.id, "business", "B1", { background: true });
  ok("background poll does NOT extend the session", row.lastActivityAt.getTime() === before);
  await S.check(a2.session.id, "business", "B1");
  await new Promise((r) => setTimeout(r, 10));
  ok("real request DOES extend the session", row.lastActivityAt.getTime() > before + 19 * 60_000);

  // ----- 30-minute idle -----
  row.lastActivityAt = new Date(Date.now() - 31 * 60_000);
  bad = await S.check(a2.session.id, "business", "B1");
  ok("31 min of inactivity closes the session (SESSION_IDLE)", bad && bad.code === "SESSION_IDLE" && row.revokedReason === "idle");
  row.lastActivityAt = new Date(Date.now() - 29 * 60_000); row.revokedAt = null;
  ok("29 min of inactivity is still fine", (await S.check(a2.session.id, "business", "B1")) === null);

  // ----- refresh rotation -----
  const c = await S.createSession({ role: "admin", id: "A1" });
  const r1 = await S.rotate(c.refreshToken);
  ok("refresh returns a NEW refresh token", r1.refreshToken && r1.refreshToken !== c.refreshToken);
  let threw = null; try { await S.rotate(c.refreshToken); } catch (e) { threw = e; }
  ok("old refresh token is dead after rotation", threw && threw.code === "SESSION_INVALID");
  T.session.find((s) => s.id === c.session.id).lastActivityAt = new Date(Date.now() - 40 * 60_000);
  threw = null; try { await S.rotate(r1.refreshToken); } catch (e) { threw = e; }
  ok("refresh after 40 min idle is refused (SESSION_IDLE)", threw && threw.code === "SESSION_IDLE");
  ok("refresh token is stored only as a hash", !T.session.some((s) => s.refreshHash === c.refreshToken || s.refreshHash === r1.refreshToken));

  // ----- password change → all sessions revoked -----
  const d = await S.createSession({ role: "admin", id: "A2" });
  await S.revokeAllFor("admin", "A2", "password_change");
  bad = await S.check(d.session.id, "admin", "A2");
  ok("password change closes the session", bad && bad.code === "SESSION_ENDED");

  // ----- data retention -----
  const DAY = 86400_000, now = new Date();
  T.business.push(
    { id: "bActive", mobile: "09120000001", name: "Active", lastActiveAt: new Date(now - 10 * DAY), deletedAt: null },
    { id: "bInactive", mobile: "09120000002", name: "Old", lastActiveAt: new Date(now - 400 * DAY), deletedAt: null },
    { id: "bDeleted31", mobile: "deleted-bDeleted31", name: "x", lastActiveAt: now, deletedAt: new Date(now - 31 * DAY) },
    { id: "bDeleted5", mobile: "deleted-bDeleted5", name: "x", lastActiveAt: now, deletedAt: new Date(now - 5 * DAY) });
  T.endUser.push({ id: "uInactive", mobile: "09130000001", nationalIdHash: "h1", lastActiveAt: new Date(now - 380 * DAY), deletedAt: null });
  T.paymentCard.push({ id: "pc1", userId: "uInactive", token: "tok", last4: "1111" });
  T.notification.push({ businessId: "bInactive", title: "t" }); T.supportTicket.push({ businessId: "bInactive", subject: "my card 4111" });
  T.otpCode.push({ mobile: "09120000002", expiresAt: new Date(now - 5 * DAY) }, { mobile: "09999999999", expiresAt: new Date(now - 3 * DAY) }, { mobile: "09888888888", expiresAt: new Date(+now + 100000) });
  T.creditCheck.push({ businessId: "bDeleted31" });
  T.apiKey.push({ businessId: "bInactive", revokedAt: null }, { businessId: "bDeleted31", revokedAt: null });
  T.facility.push({ businessId: "bDeleted31" }, { businessId: "bDeleted5" });
  T.loginAttempt.push({ createdAt: new Date(now - 100 * DAY) }, { createdAt: new Date(now - 1 * DAY) });

  // immediate deletion by the user
  ok("user-initiated delete scrubs the mobile at once", await R.softDeleteBusiness("bActive", "user") && T.business.find((b) => b.id === "bActive").mobile === "deleted-bActive");
  ok("…and sets deletedAt (soft delete)", !!T.business.find((b) => b.id === "bActive").deletedAt);
  ok("…and the same mobile can register again (unique slot freed)", !T.business.some((b) => b.mobile === "09120000001"));

  const rep = await R.runRetention(now);
  ok("12-month-inactive business is soft-deleted", T.business.find((b) => b.id === "bInactive")?.deletedAt && rep.inactiveBusinesses === 1);
  ok("…its tickets & notifications (may hold personal text) are gone", !T.supportTicket.length && !T.notification.length);
  ok("12-month-inactive user is scrubbed, card token removed", rep.inactiveUsers === 1 && T.paymentCard.length === 0 && T.endUser[0].mobile === "deleted-uInactive");
  ok("account deleted > 30 days ago is HARD-deleted", !T.business.some((b) => b.id === "bDeleted31") && rep.hardDeletedBusinesses === 1);
  ok("…with its credit checks", T.creditCheck.length === 0);
  ok("account deleted 5 days ago is kept (not yet 30 days)", T.business.some((b) => b.id === "bDeleted5"));
  ok("expired OTP codes are purged, live ones kept", T.otpCode.length === 1 && rep.otpCodes === 1);
  ok("login attempts older than 90 days are purged", T.loginAttempt.length === 1 && rep.loginAttempts === 1);
  ok("deleting a business revokes its API keys at once", T.apiKey.find((k) => k.businessId === "bInactive").revokedAt instanceof Date);
  ok("hard delete also removes its facilities and API keys", !T.facility.some((f) => f.businessId === "bDeleted31") && T.facility.some((f) => f.businessId === "bDeleted5") && !T.apiKey.some((k) => k.businessId === "bDeleted31"));
  ok("a cleanup report row is written (data.md §5)", T.cleanupReport.length === 1 && T.cleanupReport[0].kind === "data_retention" && T.cleanupReport[0].total > 0);
  console.log(`\n${pass} checks passed`);
})().catch((e) => { console.error("\n✗", e.message); process.exit(1); });
