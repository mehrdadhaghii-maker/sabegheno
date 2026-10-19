// Fills the database with realistic DEMO data so both dashboards have
// something to show: `npm run seed:demo` (safe to re-run; it only adds data
// for demo businesses marked with the "[دمو]" prefix and refuses to run in
// production unless ALLOW_DEMO_SEED=true).
const { PrismaClient } = require("@prisma/client");
const crypto = require("crypto");
const prisma = new PrismaClient();

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
  console.error("Refusing to seed demo data in production (set ALLOW_DEMO_SEED=true to override).");
  process.exit(1);
}

// Deterministic PRNG so the demo looks the same on every machine.
let seed = 20260930;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const hash = () => crypto.createHash("sha256").update(String(rnd()) + Date.now()).digest("hex");
const DAY = 86400000;

const BUSINESSES = [
  { name: "[دمو] فروشگاه دیجیتال آرمان", mobile: "09990000001", status: "approved", weight: 5 },
  { name: "[دمو] اقساط‌یار", mobile: "09990000002", status: "approved", weight: 4 },
  { name: "[دمو] گالری فرش نگین", mobile: "09990000003", status: "approved", weight: 2 },
  { name: "[دمو] لوازم خانگی پارس", mobile: "09990000004", status: "approved", weight: 3 },
  { name: "[دمو] کلینیک زیبایی مهر", mobile: "09990000005", status: "pending_contract", weight: 0 },
  { name: "[دمو] آموزشگاه زبان آوا", mobile: "09990000006", status: "pending_docs", weight: 0 },
];

async function main() {
  const providers = await prisma.provider.findMany({ where: { businessId: null } });
  const created = [];
  for (const b of BUSINESSES) {
    const row = await prisma.business.upsert({
      where: { mobile: b.mobile },
      update: {},
      create: { name: b.name, mobile: b.mobile, status: b.status, isVerified: b.status === "approved", contractSigned: b.status === "approved", createdAt: new Date(Date.now() - Math.floor(rnd() * 60) * DAY) },
    });
    if (b.status === "approved") {
      const link = await prisma.provider.findUnique({ where: { businessId: row.id } });
      if (!link) await prisma.provider.create({ data: { name: row.name, integrationType: "realtime", status: "connected", businessId: row.id, dataQuality: 90 + Math.floor(rnd() * 10), latencyMs: 120 + Math.floor(rnd() * 300), errorRate: Math.round(rnd() * 20) / 10 } });
    }
    created.push({ ...b, id: row.id });
  }

  const active = created.filter((b) => b.weight > 0);
  const pool = active.flatMap((b) => Array(b.weight).fill(b));
  const people = Array.from({ length: 70 }, hash); // repeat customers => realistic stacking
  const N = 320;
  const rows = [];
  for (let i = 0; i < N; i++) {
    const b = pick(pool);
    // Volume trends upward over the last 30 days, with quieter weekends.
    const ageDays = Math.floor(Math.pow(rnd(), 1.35) * 30);
    const at = new Date(Date.now() - ageDays * DAY - Math.floor(rnd() * DAY));
    const base = 520 + Math.floor(rnd() * 380);
    const concurrent = rnd() < 0.14 ? 2 + Math.floor(rnd() * 3) : rnd() < 0.2 ? 1 : 0;
    let score = Math.max(300, Math.min(900, base - concurrent * 25 - (rnd() < 0.12 ? 150 : 0)));
    let decision = score >= 700 ? "approve" : score >= 550 ? "review" : "decline";
    let overrideReason = null;
    const requested = pick([3, 5, 8, 10, 12, 15, 20]) * 1000000;
    let limit = decision === "decline" ? 0 : Math.round(requested * (score / 900));
    if (concurrent >= 2 && decision === "approve") {
      decision = "review";
      limit = Math.round(limit * 0.5);
      overrideReason = `با وجود امتیاز بالا، به دلیل ${concurrent} استعلام/تعهد هم‌زمان نزد سایر Providerها در ۷۲ ساعت اخیر، تصمیم به «نیازمند بررسی» تغییر یافت.`;
    }
    rows.push({
      businessId: b.id, nationalIdHash: pick(people), requestedAmount: requested, termMonths: pick([3, 6, 9, 12]),
      score, confidence: 85 + Math.floor(rnd() * 15), riskLevel: decision === "approve" ? "low" : decision === "review" ? "medium" : "high",
      decision, recommendedLimit: limit, recommendedTermMonths: decision === "decline" ? 0 : 6, overrideReason,
      concurrentProviders: concurrent, totalExternalExposure: concurrent ? concurrent * pick([2, 4, 6, 9]) * 1000000 : 0, createdAt: at,
    });
  }
  await prisma.creditCheck.createMany({ data: rows });

  const allProviders = await prisma.provider.findMany();
  const types = ["inquiry", "inquiry", "commitment_created", "commitment_created", "settled", "delay", "bounced_check", "bad_debt"];
  await prisma.providerEvent.createMany({
    data: Array.from({ length: 260 }, () => ({
      providerId: pick(allProviders).id, nationalIdHash: pick(people), eventType: pick(types),
      amount: pick([1, 2, 4, 6, 10]) * 1000000, delayDays: rnd() < 0.2 ? Math.floor(rnd() * 60) : 0,
      createdAt: new Date(Date.now() - Math.floor(rnd() * 30 * DAY)),
    })),
  });

  console.log(`Demo data added: ${created.length} businesses, ${N} credit checks, 260 provider events.`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
