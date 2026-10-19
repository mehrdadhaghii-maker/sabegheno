// Two-way sync, part 2: WE ask THEM. The business exposes one endpoint; we send the list of its open credits
// and apply whatever it answers (installments paid, credit settled) — so a settlement made in the business's own
// system reaches us even if nobody called our API.
//   request  POST <syncUrl>   Authorization: Bearer <syncKey>   { asOf, items: [{ externalRef, nextInstallment }] }
//   response { items: [{ externalRef, status: "open"|"settled", settledAt?, installments?: [{ seq, paidAt?, paidAmount? }] }] }
const prisma = require("../db/prisma");
const logger = require("../utils/logger");
const { decrypt } = require("../utils/secret");
const { assertSafeUrl } = require("./externalServices.service");
const F = require("./facility.service");

const MAX_ITEMS = 500;
const isDate = (s) => typeof s === "string" && !Number.isNaN(Date.parse(s));

/** Applies one answer item with the same rules as the API (idempotent). Returns what changed. */
async function applyItem(businessId, item) {
  const out = { externalRef: item?.externalRef, installmentsPaid: 0, settled: false, error: null };
  if (!item || typeof item.externalRef !== "string") return { ...out, error: "externalRef نامعتبر" };
  const f = await F.getOne(businessId, { externalRef: item.externalRef });
  if (!f) return { ...out, error: "اعتبار یافت نشد" };
  if (f.settledAt) return out;                                     // already closed here → nothing to do
  for (const i of Array.isArray(item.installments) ? item.installments : []) {
    const seq = Number(i?.seq), done = f.installments.find((x) => x.seq === seq);
    if (!i?.paidAt || !isDate(i.paidAt) || !done || done.paidAt) continue;
    const r = await F.payInstallment(businessId, { externalRef: item.externalRef }, seq, { paidAt: new Date(i.paidAt), ...(Number.isInteger(i.paidAmount) ? { paidAmount: i.paidAmount } : {}) }, "sync");
    if (r && !r.error) out.installmentsPaid += 1;
  }
  if (item.status === "settled") {
    const r = await F.settle(businessId, { externalRef: item.externalRef }, isDate(item.settledAt) ? new Date(item.settledAt) : new Date(), "sync");
    out.settled = !!r;
  }
  return out;
}

async function syncBusiness(b) {
  const started = new Date();
  const finish = (result) => prisma.business.update({ where: { id: b.id }, data: { lastSyncAt: started, lastSyncResult: result } });
  if (!b.syncUrl) return { ok: false, error: "آدرس همگام‌سازی تنظیم نشده است" };
  const open = await prisma.facility.findMany({ where: { businessId: b.id, settledAt: null, externalRef: { not: null } }, include: { installments: { orderBy: { seq: "asc" } } }, take: MAX_ITEMS });
  if (!open.length) { await finish("اعتبار بازی برای بررسی نبود"); return { ok: true, checked: 0, installmentsPaid: 0, settled: 0 }; }
  try {
    await assertSafeUrl(new URL(b.syncUrl));
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 15000);
    const key = decrypt(b.syncKeyEnc);
    const res = await fetch(b.syncUrl, {
      method: "POST", redirect: "manual", signal: ctl.signal,
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Sabegheno-Sync/1", ...(key ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ asOf: started.toISOString(), items: open.map((f) => ({ externalRef: f.externalRef, nextInstallment: f.installments.find((i) => !i.paidAt)?.seq ?? null })) }),
    }).finally(() => clearTimeout(t));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).slice(0, 2_000_000);
    const answer = JSON.parse(text);
    const items = Array.isArray(answer?.items) ? answer.items.slice(0, MAX_ITEMS) : [];
    const allowed = new Set(open.map((f) => f.externalRef));     // an answer can only touch credits we asked about
    let paid = 0, settled = 0, bad = 0;
    for (const it of items) { if (!allowed.has(it?.externalRef)) { bad++; continue; } const r = await applyItem(b.id, it); paid += r.installmentsPaid; settled += r.settled ? 1 : 0; if (r.error) bad++; }
    await finish(`بررسی ${open.length} اعتبار — ${paid} قسط و ${settled} تسویه اعمال شد${bad ? ` — ${bad} مورد نامعتبر` : ""}`);
    return { ok: true, checked: open.length, installmentsPaid: paid, settled, invalid: bad };
  } catch (e) {
    const msg = e.name === "AbortError" ? "timeout" : e instanceof SyntaxError ? "پاسخ JSON معتبر نیست" : e.message;
    await finish(`خطا: ${msg}`);
    logger.warn(`sync pull failed for ${b.id}: ${msg}`);
    return { ok: false, error: msg };
  }
}

/** Cron tick: every business that configured a sync URL, one after another. */
async function syncAll() {
  const list = await prisma.business.findMany({ where: { syncUrl: { not: null }, deletedAt: null, status: "approved" }, select: { id: true, syncUrl: true, syncKeyEnc: true } });
  const results = [];
  for (const b of list) results.push({ businessId: b.id, ...(await syncBusiness(b)) });
  return results;
}

module.exports = { applyItem, syncBusiness, syncAll };
