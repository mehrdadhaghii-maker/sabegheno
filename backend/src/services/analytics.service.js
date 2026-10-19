// Aggregation helpers shared by the business dashboard (/credit-checks/stats)
// and the admin dashboard (/admin/analytics). Aggregation happens in JS on a
// bounded window so it stays database-agnostic and easy to reason about.

const IRAN_OFFSET_MS = 210 * 60 * 1000; // UTC+3:30 — day buckets follow Iran's calendar day
const DAY_MS = 24 * 60 * 60 * 1000;

// A "review" inquiry that an admin has since decided counts as that decision (approve | decline) everywhere.
const effDecision = (c) => (c.decision === "review" && (c.reviewedDecision === "approve" || c.reviewedDecision === "decline") ? c.reviewedDecision : c.decision);

const dayKey = (d) => new Date(new Date(d).getTime() + IRAN_OFFSET_MS).toISOString().slice(0, 10);

function windowStart(days) {
  const n = Math.min(Math.max(parseInt(days, 10) || 30, 1), 365);
  return { days: n, start: new Date(Date.now() - (n - 1) * DAY_MS) };
}

// One row per day (including empty days) so charts never have gaps.
function buildSeries(checks, days) {
  const buckets = new Map();
  for (let i = days - 1; i >= 0; i--) {
    buckets.set(dayKey(Date.now() - i * DAY_MS), { date: null, total: 0, approve: 0, review: 0, decline: 0, scoreSum: 0, amount: 0 });
  }
  for (const c of checks) {
    const b = buckets.get(dayKey(c.createdAt));
    if (!b) continue;
    b.total += 1;
    b[effDecision(c)] += 1;
    b.scoreSum += c.score;
    b.amount += c.requestedAmount;
  }
  return [...buckets.entries()].map(([date, b]) => ({
    date,
    total: b.total,
    approve: b.approve,
    review: b.review,
    decline: b.decline,
    avgScore: b.total ? Math.round(b.scoreSum / b.total) : null,
    amount: b.amount,
  }));
}

function summarize(checks) {
  const total = checks.length;
  const by = { approve: 0, review: 0, decline: 0 };
  let scoreSum = 0, requested = 0, recommended = 0, stacking = 0;
  for (const c of checks) {
    const d = effDecision(c);
    by[d] += 1;
    scoreSum += c.score;
    requested += c.requestedAmount;
    if (d !== "decline") recommended += c.recommendedLimit;
    if (c.concurrentProviders >= 1) stacking += 1;
  }
  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return {
    total,
    byDecision: by,
    approvalRate: pct(by.approve),
    reviewRate: pct(by.review),
    declineRate: pct(by.decline),
    avgScore: total ? Math.round(scoreSum / total) : null,
    totalRequested: requested,
    totalRecommended: recommended,
    stackingFlags: stacking,
  };
}

const BUCKETS = [[300, 449], [450, 549], [550, 649], [650, 749], [750, 900]];
function scoreBuckets(checks) {
  return BUCKETS.map(([lo, hi]) => ({
    range: `${lo}–${hi}`,
    count: checks.filter((c) => c.score >= lo && c.score <= hi).length,
  }));
}

// Checks where the anti-stacking layer mattered — the product's core signal.
const isAlert = (c) => c.concurrentProviders >= 1;

module.exports = { effDecision, windowStart, buildSeries, summarize, scoreBuckets, isAlert, dayKey };
