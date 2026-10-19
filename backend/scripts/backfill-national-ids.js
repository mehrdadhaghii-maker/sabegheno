// One-off: older rows only have the one-way hash. Where the SAME business typed the same person's ID somewhere else
// (an inquiry, a facility, a cheque…) we can fill the encrypted copy back in. Nothing crosses business boundaries,
// and IDs that were never typed anywhere stay empty — a hash cannot be reversed.
//   node scripts/backfill-national-ids.js            (dry run: prints what would change)
//   node scripts/backfill-national-ids.js --apply
require("dotenv").config();
const prisma = require("../src/db/prisma");

const apply = process.argv.includes("--apply");
const owners = [
  ["creditCheck", "businessId"], ["facility", "businessId"], ["issuedCheque", "businessId"],
  ["defaulter", "reportedByBusinessId"],
];

(async () => {
  // (business, hash) → ciphertext known from ANY table of that business
  const known = new Map();
  for (const [model, ownerField] of owners) {
    const rows = await prisma[model].findMany({ where: { nationalIdEnc: { not: null } }, select: { [ownerField]: true, nationalIdHash: true, nationalIdEnc: true } });
    for (const r of rows) known.set(`${r[ownerField]}|${r.nationalIdHash}`, r.nationalIdEnc);
  }
  let total = 0;
  for (const [model, ownerField] of owners) {
    const rows = await prisma[model].findMany({ where: { nationalIdEnc: null }, select: { id: true, [ownerField]: true, nationalIdHash: true } });
    let n = 0;
    for (const r of rows) {
      const enc = known.get(`${r[ownerField]}|${r.nationalIdHash}`);
      if (!enc) continue;
      n += 1;
      if (apply) await prisma[model].update({ where: { id: r.id }, data: { nationalIdEnc: enc } });
    }
    console.log(`${model.padEnd(12)} بدون کد ملی: ${String(rows.length).padStart(5)}   قابل بازیابی: ${String(n).padStart(5)}`);
    total += n;
  }
  // provider events belong to a business through their provider
  const events = await prisma.providerEvent.findMany({ where: { nationalIdEnc: null }, select: { id: true, nationalIdHash: true, provider: { select: { businessId: true } } } });
  let ne = 0;
  for (const e of events) {
    const enc = e.provider?.businessId && known.get(`${e.provider.businessId}|${e.nationalIdHash}`);
    if (!enc) continue; ne += 1;
    if (apply) await prisma.providerEvent.update({ where: { id: e.id }, data: { nationalIdEnc: enc } });
  }
  console.log(`providerEvent بدون کد ملی: ${String(events.length).padStart(5)}   قابل بازیابی: ${String(ne).padStart(5)}`);
  console.log(apply ? `\n✅ ${total + ne} رکورد به‌روز شد.` : `\nاجرای آزمایشی بود؛ برای اعمال: node scripts/backfill-national-ids.js --apply`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
