const R = require("../src/services/rating.service.js");
const assert = require("assert"); let n = 0; const ok = (m, c) => { assert(c, "FAIL: " + m); console.log("✓", m); n++; };
const table = { 900: "A1", 680: "A1", 679: "A2", 660: "A2", 659: "A3", 640: "A3", 639: "B1", 620: "B1", 619: "B2", 600: "B2", 599: "B3", 580: "B3", 579: "C1", 560: "C1", 559: "C2", 540: "C2", 539: "C3", 520: "C3", 519: "D1", 500: "D1", 499: "D2", 480: "D2", 479: "D3", 460: "D3", 459: "E1", 440: "E1", 439: "E2", 420: "E2", 419: "E3", 0: "E3" };
for (const [s, g] of Object.entries(table)) assert.strictEqual(R.gradeFor(+s).code, g, `score ${s}`);
ok("grade boundaries match the reference table", true);
ok("score 561 = C1 / کم‌ریسک", R.gradeFor(561).code === "C1" && R.bandFor(561).key === "low_risk");
const now = new Date("2026-10-09T00:00:00Z"), d = (x) => new Date(now - x * 864e5);
const mk = (o) => ({ amount: 1e7, remainingAmount: 5e6, penaltyAmount: 0, disbursedAt: d(200), dueDate: d(0), ...o });
const st = (due, settledAt) => R.facilityStatus({ dueDate: due, settledAt }, now);
ok("status bands (month-based; edges tested in classification.test.js)", st(new Date(+now + 5 * 864e5)) === "current" && st(d(59)) === "current" && st(d(100)) === "overdue" && st(d(200)) === "delinquent" && st(d(600)) === "doubtful" && st(d(900), d(1)) === "settled");
ok("no history ⇒ null", R.platformScore([], now) === null);
ok("two on-time settlements ⇒ 730", R.platformScore([mk({ dueDate: d(30), settledAt: d(31) }), mk({ dueDate: d(60), settledAt: d(61) })], now) === 730);
ok("late settlement is penalised", R.platformScore([mk({ dueDate: d(60), settledAt: d(20) })], now) < 700);
ok("doubtful ⇒ 400; late-but-جاری + penalty ⇒ 665 (−15 −20)", R.platformScore([mk({ dueDate: d(600) })], now) === 400 && R.platformScore([mk({ dueDate: d(10), penaltyAmount: 5e4 })], now) === 665);
ok("blend 65/35, no-history passthrough, doubtful cap 459", R.blendScore(700, 500, [], now) === 630 && R.blendScore(640, null, [], now) === 640 && R.blendScore(800, 700, [mk({ dueDate: d(600) })], now) === 459);

// ---- installments (bank-style) ----
const ins = (arr) => arr.map(([due, paid], i) => ({ seq: i + 1, dueDate: due, amount: 1e6, paidAt: paid || null, paidAmount: paid ? 1e6 : null }));
const f1 = mk({ id: "f1", installments: ins([[d(90), d(91)], [d(60), d(61)], [d(30), d(30)], [d(-1)], [d(-31)]]) });
const dsc1 = R.describeFacility(f1, "دیجی‌کالا", now);
ok("3 of 5 installments paid on time ⇒ current, remaining = 2 unpaid", dsc1.status === "current" && dsc1.paidCount === 3 && dsc1.remainingAmount === 2e6 && dsc1.installmentCount === 5);
const f2 = mk({ id: "f2", installments: ins([[d(100), d(95)], [d(70), d(60)], [d(40)], [d(10)]]) });
const dsc2 = R.describeFacility(f2, "ب", now);
ok("oldest unpaid 40 days late ⇒ still جاری (first 3 months) but in arrears; 2 late-paid + 2 overdue installments counted", dsc2.status === "current" && dsc2.inArrears === true && dsc2.daysLate === 40 && dsc2.installments.filter((i) => i.status === "paid_late").length === 2 && dsc2.lateCount === 4);
const f3 = mk({ id: "f3", installments: ins([[d(40), d(41)], [d(10), d(12)]]) });
const dsc3 = R.describeFacility(f3, "ج", now);
ok("last installment paid ⇒ facility leaves the active ledger (settled) and remaining = 0", dsc3.status === "settled" && dsc3.remainingAmount === 0 && dsc3.settledAt && dsc3.nextDue === null);
const an = R.platformAnalysis([dsc1, dsc2, dsc3], now);
ok("analysis lists every reducer with a reason", an.items.some((i) => i.kind === "neg" && /ب/.test(i.label) && /عقب‌افتاده/.test(i.label)) && an.items.every((i) => i.label && Number.isFinite(i.points)));
ok("paying on time is rewarded, late installments cost points", R.platformAnalysis([dsc1], now).score > 700 && R.platformAnalysis([R.describeFacility(mk({ id: "x", installments: ins([[d(50), d(10)], [d(20), d(5)]]) }), "x", now)], now).score < 700);

// ---- inquiry frequency ----
const ip = R.inquiryPenalty;
ok("inquiry penalty ladder 0/15/35/60/90", ip(0).points === 0 && ip(1).points === 0 && ip(2).points === -15 && ip(4).points === -35 && ip(6).points === -60 && ip(12).points === -90);
ok("many inquiries over 90 days add a little more", ip(3, 12).points === -35 && ip(0, 15).points === -20);

// ---- breakdown adds up ----
const ext = [{ key: "bounced", label: "چک برگشتی", points: -120, kind: "neg" }, { key: "inq", label: "تعدد استعلام", points: -35, kind: "neg" }];
const plat = an.items;
const hasP = an.score != null, E = 700 - 155, P = an.score;
const parts = R.blendParts(E, P, [], now);
const bd = R.buildBreakdown({ external: ext, platform: plat, hasPlatform: hasP, beforeCap: parts.raw, final: parts.final });
ok("breakdown: 700 + Σ items = final score (exact)", 700 + [...bd.reducers, ...bd.boosters].reduce((s, i) => s + i.points, 0) === bd.final);
const bd2 = R.buildBreakdown({ external: ext, platform: [], hasPlatform: false, final: R.clampScore(E) });
ok("without platform history the external reducers count 100%", bd2.reducers.find((i) => i.key === "bounced").points === -120 && bd2.totalReduction === -155 && bd2.final === 545);
const bd3 = R.buildBreakdown({ external: [], platform: [{ key: "s", label: "x", points: -300, kind: "neg" }], hasPlatform: true, beforeCap: 520, final: 459 });
ok("the doubtful cap is shown as its own reducer", bd3.reducers.some((i) => i.key === "doubtful_cap" && i.points === -61));
const t = R.totals([dsc1, dsc2, dsc3]);
ok("totals include installment counters", t.installmentsTotal === 11 && t.installmentsPaid === 7 && t.active === 2);
console.log(n + " rating checks passed");
