const prisma = require("../db/prisma");

/**
 * Cross-business overlap detection.
 *
 * Three sources are merged, always EXCLUDING the business that is asking:
 *  1. InquiryLog     – written at the very start of every inquiry (catches true
 *                      simultaneous queries on the same national ID),
 *  2. CreditCheck    – completed inquiries by other businesses (older data),
 *  3. ProviderEvent  – commitments / defaults reported by other providers.
 * Everything is keyed by BUSINESS (a provider linked to a business counts as
 * that business) so one business is never counted twice.
 */
async function checkConcurrentExposure(nationalIdHash, { excludeBusinessId, windowHours = 72 } = {}) {
  const since = new Date(Date.now() - windowHours * 3600 * 1000);
  const notMe = excludeBusinessId ? { not: excludeBusinessId } : undefined;

  const [logs, checks, events] = await Promise.all([
    prisma.inquiryLog.findMany({ where: { nationalIdHash, createdAt: { gte: since }, businessId: notMe }, orderBy: { createdAt: "desc" } }),
    prisma.creditCheck.findMany({ where: { nationalIdHash, createdAt: { gte: since }, businessId: notMe }, select: { businessId: true, createdAt: true, business: { select: { name: true } } } }),
    prisma.providerEvent.findMany({
      where: { nationalIdHash, createdAt: { gte: since }, eventType: { in: ["inquiry", "commitment_created", "settled", "bad_debt"] } },
      include: { provider: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const parties = new Map(); // key -> state
  const touch = (key, name, at) => {
    const st = parties.get(key) || { name, openAmount: 0, hasInquiry: false, badDebtCount: 0, lastAt: at };
    if (at > st.lastAt) st.lastAt = at;
    parties.set(key, st);
    return st;
  };

  for (const l of logs) touch(l.businessId, null, l.createdAt).hasInquiry = true;
  for (const c of checks) {
    const st = touch(c.businessId, c.business?.name, c.createdAt);
    st.hasInquiry = true;
    st.name = st.name || c.business?.name;
  }
  for (const e of events) {
    if (excludeBusinessId && e.provider.businessId === excludeBusinessId) continue;
    const st = touch(e.provider.businessId || `p:${e.providerId}`, e.provider.name, e.createdAt);
    if (e.eventType === "inquiry") st.hasInquiry = true;
    if (e.eventType === "commitment_created") st.openAmount += e.amount;
    if (e.eventType === "settled") st.openAmount = Math.max(0, st.openAmount - e.amount);
    if (e.eventType === "bad_debt") st.badDebtCount += 1;
  }

  // Show the brand name of every other business that also inquired / granted credit.
  const ids = [...parties.keys()].filter((k) => !String(k).startsWith("p:"));
  if (ids.length) {
    const bs = await prisma.business.findMany({ where: { id: { in: ids } }, select: { id: true, brandName: true, name: true } });
    for (const b of bs) { const st = parties.get(b.id); if (st) st.name = b.brandName || b.name || st.name; }
  }

  const active = [...parties.values()].filter((p) => p.hasInquiry || p.openAmount > 0);
  const lastInquiryAt = active.reduce((m, p) => (!m || p.lastAt > m ? p.lastAt : m), null);
  const minutesAgo = lastInquiryAt ? Math.round((Date.now() - new Date(lastInquiryAt).getTime()) / 60000) : null;

  return {
    concurrentProviders: active.length,
    totalExternalExposure: active.reduce((s, p) => s + p.openAmount, 0),
    badDebtCount: [...parties.values()].reduce((s, p) => s + p.badDebtCount, 0),
    settledAmount: events.filter((e) => e.eventType === "settled").reduce((s, e) => s + e.amount, 0),
    hasSettledAndBadDebt: events.some((e) => e.eventType === "settled") && events.some((e) => e.eventType === "bad_debt"),
    lastInquiryMinutesAgo: minutesAgo,
    nearSimultaneous: minutesAgo !== null && minutesAgo <= 60,
    // who else asked about this person, newest first — shown on the report so the next company knows
    overlaps: active.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt)).map((p) => ({ brand: p.name || "یک کسب‌وکار دیگر", lastAt: p.lastAt, hasInquiry: p.hasInquiry, openAmount: p.openAmount })),
    events: events.map((e) => ({ provider: e.provider.name, type: e.eventType, amount: e.amount, createdAt: e.createdAt })),
  };
}

// Active default anywhere on the platform => blocked everywhere.
async function findActiveDefault(nationalIdHash) {
  return prisma.defaulter.findFirst({ where: { nationalIdHash, status: "active" }, orderBy: { createdAt: "desc" } });
}

module.exports = { checkConcurrentExposure, findActiveDefault };
