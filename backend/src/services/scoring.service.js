const { fetchLoanRecords } = require("./loansProvider.service");
const { fetchCheckRecords } = require("./checksProvider.service");
const { checkConcurrentExposure, findActiveDefault } = require("./stacking.service");
const { verifyPersonIdentity } = require("./personInfo.service");
const { queryAllEnabled } = require("./externalServices.service");
const { getOrCreateGlobalPolicy } = require("../routes/policy.routes");
const prisma = require("../db/prisma");
const rating = require("./rating.service");
const { listForPerson } = require("./facility.service");
const { listForPerson: listChequesForPerson } = require("./cheque.service");

const OPS = { lt: (a, b) => a < b, lte: (a, b) => a <= b, gt: (a, b) => a > b, gte: (a, b) => a >= b, eq: (a, b) => a === b };
const SEVERITY = { approve: 0, review: 1, decline: 2 };

/**
 * Combines every data source into one score + decision.
 * Order of authority (strongest first):
 *   1. hard stops   – deceased ID, active default anywhere on the platform
 *   2. custom rules – platform-wide and per-business "IF … THEN …" rules
 *   3. overlap      – same national ID queried by other businesses recently
 *   4. global policy thresholds and the baseline score
 */
async function runCreditCheck({ nationalId, nationalIdHash, requestedAmount, businessId, customerBirthDate, currentInquiryLogged = false }) {
  const policy = await getOrCreateGlobalPolicy();

  const [loans, checks, exposure, identity, services, activeDefault, customRules, facilities, inquiryRows, cheques] = await Promise.all([
    fetchLoanRecords(nationalId).catch(() => ({
      active: 0, totalCommitment: 0, settled: null, overdue: null,
      debtTotal: 0, pastExpiredAmount: 0, deferredAmount: 0, suspiciousAmount: 0, dishonoredAmount: 0,
      records: [], source: "error",
    })),
    fetchCheckRecords(nationalId).catch(() => ({ activeBounced: 0, resolved: null, issued: null, records: [], source: "error" })),
    checkConcurrentExposure(nationalIdHash, { excludeBusinessId: businessId, windowHours: policy.overlapWindowHours }),
    customerBirthDate
      ? verifyPersonIdentity(nationalId, customerBirthDate).catch(() => ({ available: false, source: "error" }))
      : Promise.resolve({ available: false, source: "not_requested" }),
    queryAllEnabled(nationalId, customerBirthDate).catch(() => []),
    policy.blockOnBadDebt ? findActiveDefault(nationalIdHash) : Promise.resolve(null),
    prisma.customRule.findMany({ where: { enabled: true, OR: [{ businessId: null }, { businessId: businessId || "none" }] } }),
    listForPerson(nationalIdHash).catch(() => []),
    // how often was this person looked up recently? (many inquiries = credit-hunting → negative weight)
    prisma.inquiryLog.findMany({ where: { nationalIdHash, createdAt: { gte: new Date(Date.now() - 90 * 86400_000) } }, select: { businessId: true, createdAt: true }, take: 1000 }).catch(() => []),
    listChequesForPerson(nationalIdHash).catch(() => []),
  ]);

  // --- baseline score: every point is recorded with its reason, so the report can print ALL reducers ---
  const external = [];
  const add = (key, label, points, detail = null) => { if (points) external.push({ key, label, detail, points, kind: points < 0 ? "neg" : "pos" }); };
  if (checks.activeBounced) add("bounced", `چک برگشتی فعال (${checks.activeBounced} مورد)`, -checks.activeBounced * 120);
  if (checks.activeBounced > policy.maxActiveBounced) add("bounced_limit", "تعداد چک برگشتی بیش از حد مجاز سیاست اعتباری", -80, `حد مجاز ${policy.maxActiveBounced}`);
  if ((loans.overdue || 0) > policy.maxDelayDays) add("loan_delay", "تأخیر در بازپرداخت تسهیلات بانکی", -80, `${loans.overdue} روز تأخیر (حد مجاز ${policy.maxDelayDays})`);
  const distressed = (loans.pastExpiredAmount || 0) + (loans.dishonoredAmount || 0) + (loans.suspiciousAmount || 0);
  const distressRatio = loans.totalCommitment > 0 ? distressed / loans.totalCommitment : 0;
  add("distressed_loans", "تسهیلات سررسید گذشته، معوق یا مشکوک‌الوصول", -Math.min(300, Math.round(distressRatio * 400)), distressed ? `${Math.round(distressRatio * 100)}٪ از کل تعهدات` : null);

  // Many recent inquiries about the same person weigh negatively (the current inquiry itself is not counted).
  const t30 = Date.now() - 30 * 86400_000;
  const rows30 = inquiryRows.filter((r) => new Date(r.createdAt).getTime() >= t30);
  const prior30 = Math.max(0, rows30.length - (currentInquiryLogged ? 1 : 0));
  const prior90 = Math.max(0, inquiryRows.length - (currentInquiryLogged ? 1 : 0));
  const biz30 = new Set(rows30.map((r) => r.businessId).filter(Boolean)).size;
  const inq = rating.inquiryPenalty(prior30, prior90);
  add("inquiries", `تعدد استعلام (${prior30} استعلام در ۳۰ روز اخیر)`, inq.points, `${biz30} کسب‌وکار مختلف · ${prior90} استعلام در ۹۰ روز`);

  // Connected external organisations can carry their own score impact (e.g. traffic fines).
  for (const sv of services) if (sv.ok && sv.scorePoints) add(`service:${sv.key}`, sv.impactLabel || `نتیجهٔ سرویس «${sv.name}»`, sv.scorePoints, `${sv.value}${sv.unit ? ` ${sv.unit}` : ""}`);

  let score = Math.max(0, Math.min(900, 700 + external.reduce((a, i) => a + i.points, 0)));

  // The bureau score and the person's repayment record INSIDE Sabegheno together decide the result.
  const externalScore = score;
  const analysis = rating.platformAnalysis(facilities, new Date(), cheques);
  const platformScore = analysis.score;
  const parts = rating.blendParts(externalScore, platformScore, facilities);
  score = parts.final;
  const breakdown = rating.buildBreakdown({ external, platform: analysis.items, hasPlatform: platformScore != null, beforeCap: parts.raw, final: score });

  const confidence = 100 - (loans.source === "unavailable" || checks.source === "unavailable" ? 15 : 0) - services.filter((s) => !s.ok).length * 3;

  let decision = score >= policy.minScore ? "approve" : score >= policy.reviewMinScore ? "review" : "decline";
  let recommendedLimit = decision === "decline" ? 0 : Math.round(requestedAmount * (score / 900));
  const reasons = [];
  for (const f of facilities.filter((x) => ["delinquent", "doubtful"].includes(x.status))) {
    reasons.push(`نزد «${f.brand}» اعتبار ${f.statusLabel} دارد (${f.daysLate} روز تأخیر).`);
  }
  const escalate = (to, reason) => {
    if (SEVERITY[to] > SEVERITY[decision]) decision = to;
    if (reason) reasons.push(reason);
  };

  // --- policy thresholds ---
  if (policy.maxRequestedAmount > 0 && requestedAmount > policy.maxRequestedAmount) escalate("review", "مبلغ درخواستی از سقف مجاز سیاست اعتبار بیشتر است.");
  if (policy.maxExternalExposure > 0 && exposure.totalExternalExposure > policy.maxExternalExposure) escalate("review", "مجموع تعهدات فعال نزد سایر کسب‌وکارها از حد مجاز بیشتر است.");

  // --- overlap: another business queried / lent to the same national ID recently ---
  const overlapDetected = exposure.concurrentProviders >= policy.overlapMinBusinesses;
  if (overlapDetected) {
    escalate(policy.overlapAction === "decline" ? "decline" : "review",
      `هشدار هم‌پوشانی: این کد ملی در ${policy.overlapWindowHours} ساعت اخیر توسط ${exposure.concurrentProviders} کسب‌وکار دیگر نیز استعلام یا تعهد گرفته است` +
      (exposure.nearSimultaneous ? " (آخرین مورد کمتر از یک ساعت پیش)." : "."));
    recommendedLimit = Math.round(recommendedLimit * (policy.overlapLimitPercent / 100));
  }

  // --- custom rules (global + this business) ---
  const metrics = {
    score, requestedAmount,
    activeBounced: checks.activeBounced || 0,
    overdueDays: loans.overdue || 0,
    concurrentBusinesses: exposure.concurrentProviders,
    externalExposure: exposure.totalExternalExposure,
    badDebtCount: exposure.badDebtCount,
  };
  for (const s of services) if (s.ok) { metrics[`service:${s.key}`] = s.value; for (const [k, v] of Object.entries(s.values || {})) if (typeof v === "number") metrics[`service:${s.key}.${k}`] = v; }

  const ruleHits = [];
  for (const r of customRules) {
    const v = metrics[r.metric];
    if (v === undefined || v === null || !OPS[r.operator] || !OPS[r.operator](v, r.value)) continue;
    ruleHits.push({ id: r.id, name: r.name, action: r.action, scope: r.businessId ? "business" : "global" });
    const why = r.message || `قانون سفارشی «${r.name}» اعمال شد.`;
    if (r.action === "decline") escalate("decline", why);
    else if (r.action === "review") escalate("review", why);
    else if (r.action === "cap_limit" && r.actionValue != null) { recommendedLimit = Math.min(recommendedLimit, r.actionValue); reasons.push(why); }
    else if (r.action === "reduce_limit" && r.actionValue != null) { recommendedLimit = Math.round(recommendedLimit * (r.actionValue / 100)); reasons.push(why); }
  }

  // --- hard stops (final word) ---
  let blocked = false;
  if (activeDefault) {
    blocked = true;
    decision = "decline";
    reasons.unshift("این شخص در شبکهٔ سابقه‌نو به‌عنوان بدحساب فعال ثبت شده است؛ اعطای اعتبار در تمام کسب‌وکارها مسدود است.");
  }
  if (identity.available && identity.alive === false) {
    decision = "decline";
    reasons.unshift("طبق استعلام ثبت‌احوال، این کد ملی به فرد فوت‌شده تعلق دارد.");
  }

  if (decision === "decline") recommendedLimit = 0;
  const riskLevel = decision === "approve" ? "low" : decision === "review" ? "medium" : "high";

  return {
    score, confidence: Math.max(40, confidence), riskLevel, decision, recommendedLimit,
    recommendedTermMonths: decision === "decline" ? 0 : 6,
    overrideReason: reasons.length ? reasons.join(" ") : null,
    concurrentProviders: exposure.concurrentProviders,
    totalExternalExposure: exposure.totalExternalExposure,
    overlapDetected, blocked,
    commitmentStatus: exposure.hasSettledAndBadDebt ? "settled_with_bad_debt" : exposure.totalExternalExposure > 0 ? "active" : "clear",
    sources: { loans, checks, exposure, identity, services, ruleHits, blocked },
    report: {
      score, externalScore, platformScore, grade: rating.gradeFor(score), band: rating.bandFor(score),
      // 700 + every reducer/booster = the final score; printed in full on the report
      breakdown,
      inquiries: { prior30, prior90, businesses30: biz30, penalty: inq.points, level: inq.level },
      warnings: [
        ...(activeDefault ? [{ key: "default", tone: "bad", text: "این شخص در شبکهٔ سابقه‌نو به‌عنوان بدحساب فعال ثبت شده است." }] : []),
        ...(identity.available && identity.alive === false ? [{ key: "deceased", tone: "bad", text: "کد ملی متعلق به فرد فوت‌شده است." }] : []),
        ...(overlapDetected ? [{ key: "overlap", tone: "warn", text: `در ${policy.overlapWindowHours} ساعت اخیر ${exposure.concurrentProviders} کسب‌وکار دیگر نیز دربارهٔ این شخص استعلام یا اعتبار ثبت کرده‌اند.` }] : []),
      ],
      facilities, totals: rating.totals(facilities), cheques: rating.chequeSummary(cheques),
      overlaps: exposure.overlaps || [], nearSimultaneous: !!exposure.nearSimultaneous,
      services: services.map((x) => ({ key: x.key, name: x.name, ok: x.ok, value: x.value, unit: x.unit, points: x.scorePoints || 0 })),
      generatedAt: new Date().toISOString(),
    },
  };
}

module.exports = { runCreditCheck };
