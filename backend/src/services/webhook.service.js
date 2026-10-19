// Outbound events for businesses that connected their own system (two-way sync, part 1: WE tell THEM).
//   • events go into an outbox table; a worker delivers and retries with back-off
//   • every request is HMAC-SHA256 signed:  X-Sabegheno-Signature: sha256=hex(HMAC(secret, `${timestamp}.${body}`))
//   • URLs are checked against the SSRF guard, redirects are not followed
const crypto = require("crypto");
const prisma = require("../db/prisma");
const logger = require("../utils/logger");
const { decrypt } = require("../utils/secret");
const { assertSafeUrl } = require("./externalServices.service");

const BACKOFF_MIN = [1, 5, 30, 120, 360, 1440];  // minutes before attempt 2, 3, … 7 → then "failed"
const MAX_ATTEMPTS = BACKOFF_MIN.length + 1;

const sign = (secret, timestamp, body) => `sha256=${crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`;

/** Receiver side (documented): constant-time check + 5-minute replay window. */
function verify(secret, timestamp, body, signature, now = Date.now()) {
  if (!signature || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const a = Buffer.from(sign(secret, timestamp, body)), b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const nextDelayMs = (attemptsDone) => (BACKOFF_MIN[attemptsDone - 1] ?? null) == null ? null : BACKOFF_MIN[attemptsDone - 1] * 60_000;

/** Put an event into the outbox — only for businesses that registered a webhook URL. Never throws. */
async function enqueue(businessId, event, payload) {
  try {
    const b = await prisma.business.findUnique({ where: { id: businessId }, select: { webhookUrl: true } });
    if (!b?.webhookUrl) return null;
    return await prisma.webhookDelivery.create({ data: { businessId, event, payload: { event, createdAt: new Date().toISOString(), data: payload } } });
  } catch (e) { logger.warn(`webhook enqueue failed: ${e.message}`); return null; }
}

async function post(url, secret, event, id, payload) {
  await assertSafeUrl(new URL(url));
  const body = JSON.stringify(payload), ts = String(Math.floor(Date.now() / 1000));
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, {
      method: "POST", redirect: "manual", signal: ctl.signal, body,
      headers: { "Content-Type": "application/json", "User-Agent": "Sabegheno-Webhook/1", "X-Sabegheno-Event": event, "X-Sabegheno-Delivery": id, "X-Sabegheno-Timestamp": ts, "X-Sabegheno-Signature": sign(secret, ts, body) },
    });
    return { ok: res.status >= 200 && res.status < 300, status: res.status };
  } finally { clearTimeout(t); }
}

async function deliverOne(row) {
  const b = await prisma.business.findUnique({ where: { id: row.businessId }, select: { webhookUrl: true, webhookSecretEnc: true } });
  const attempts = row.attempts + 1;
  if (!b?.webhookUrl) return prisma.webhookDelivery.update({ where: { id: row.id }, data: { status: "failed", attempts, lastError: "آدرس وب‌هوک حذف شده است" } });
  try {
    const r = await post(b.webhookUrl, decrypt(b.webhookSecretEnc) || "", row.event, row.id, row.payload);
    if (r.ok) return prisma.webhookDelivery.update({ where: { id: row.id }, data: { status: "delivered", attempts, deliveredAt: new Date(), lastError: null } });
    throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    const delay = nextDelayMs(attempts);
    return prisma.webhookDelivery.update({ where: { id: row.id }, data: delay == null ? { status: "failed", attempts, lastError: e.message } : { attempts, lastError: e.message, nextAttemptAt: new Date(Date.now() + delay) } });
  }
}

/** Worker tick (cron, every 2 minutes). */
async function deliverDue(limit = 25) {
  const rows = await prisma.webhookDelivery.findMany({ where: { status: "pending", nextAttemptAt: { lte: new Date() } }, orderBy: { nextAttemptAt: "asc" }, take: limit });
  for (const r of rows) await deliverOne(r);
  return rows.length;
}

/** "Send test event" button — synchronous so the owner sees the result at once. */
async function ping(business) {
  const id = `test-${crypto.randomBytes(6).toString("hex")}`;
  try {
    const r = await post(business.webhookUrl, decrypt(business.webhookSecretEnc) || "", "ping", id, { event: "ping", createdAt: new Date().toISOString(), data: { message: "تست اتصال سابقه‌نو" } });
    return { ok: r.ok, status: r.status, error: r.ok ? null : `HTTP ${r.status}` };
  } catch (e) { return { ok: false, status: null, error: e.name === "AbortError" ? "timeout" : e.message }; }
}

module.exports = { sign, verify, nextDelayMs, enqueue, deliverDue, deliverOne, ping, MAX_ATTEMPTS, BACKOFF_MIN };
