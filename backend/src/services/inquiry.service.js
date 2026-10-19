// The "new inquiry" flow, shared by the panel (JWT) and the public API (API key).
const { z } = require("zod");
const prisma = require("../db/prisma");
const { hashNationalId } = require("../utils/crypto");
const { sealNid } = require("../utils/nid");
const { runCreditCheck } = require("./scoring.service");
const { getOrCreateGlobalPolicy } = require("../routes/policy.routes");

const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
const latinDigits = (s) => String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));

// PersonInfo wants a JALALI date like "1371/5/12". Anything else (e.g. a Gregorian 1992-08-03) is rejected
// instead of silently failing the identity check.
const jalaliBirth = z.string().transform(latinDigits).refine((v) => {
  const m = /^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/.exec(v.trim());
  if (!m) return false;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  return y >= 1300 && y <= 1450 && mo >= 1 && mo <= 12 && d >= 1 && d <= (mo <= 6 ? 31 : 30);
}, "تاریخ تولد باید شمسی و به شکل ۱۳۷۱/۵/۱۲ باشد").transform((v) => v.trim().replace(/-/g, "/"));

const inquiryInput = z.object({
  nationalId: z.string().regex(/^\d{10}$/, "کد ملی باید ۱۰ رقم باشد"),
  requestedAmount: z.number().int().positive(),
  termMonths: z.number().int().positive(),
  customerBirthDate: jalaliBirth.optional(),
});

async function performInquiry({ businessId, body, via = "panel" }) {
  const nationalIdHash = hashNationalId(body.nationalId);

  // Written BEFORE any slow external call: two businesses querying the same
  // national ID at the same moment will each see the other's row.
  await prisma.inquiryLog.create({ data: { nationalIdHash, businessId } });

  const result = await runCreditCheck({
    nationalId: body.nationalId, nationalIdHash, requestedAmount: body.requestedAmount, businessId, customerBirthDate: body.customerBirthDate, currentInquiryLogged: true,
  });

  const record = await prisma.creditCheck.create({
    data: {
      businessId, nationalIdHash, nationalIdEnc: sealNid(body.nationalId), requestedAmount: body.requestedAmount, termMonths: body.termMonths,
      score: result.score, confidence: result.confidence, riskLevel: result.riskLevel, decision: result.decision,
      recommendedLimit: result.recommendedLimit, recommendedTermMonths: result.recommendedTermMonths, overrideReason: result.overrideReason,
      concurrentProviders: result.concurrentProviders, totalExternalExposure: result.totalExternalExposure, via,
      sources: { loans: result.sources.loans, checks: result.sources.checks, exposure: result.sources.exposure, services: result.sources.services, ruleHits: result.sources.ruleHits, blocked: result.sources.blocked, breakdown: result.report.breakdown, inquiries: result.report.inquiries, warnings: result.report.warnings, externalScore: result.report.externalScore, platformScore: result.report.platformScore },
    },
  });

  // Real-time flag on the OTHER side too.
  if (result.overlapDetected) {
    const policy = await getOrCreateGlobalPolicy();
    await prisma.creditCheck.updateMany({
      where: { nationalIdHash, businessId: { not: businessId }, id: { not: record.id }, createdAt: { gte: new Date(Date.now() - policy.overlapWindowHours * 3600 * 1000) }, concurrentProviders: { lt: 1 } },
      data: { concurrentProviders: 1 },
    });
  }
  return { ...record, sources: result.sources, report: result.report };
}

// What a business may show/receive: the "review" decision stays pending until an admin decides.
const awaitingAdvancedReview = (c) => c.decision === "review" && !c.reviewedDecision;
const effectiveDecision = (c) => (c.decision === "review" && c.reviewedDecision ? c.reviewedDecision : c.decision);

module.exports = { inquiryInput, performInquiry, awaitingAdvancedReview, effectiveDecision, latinDigits };
