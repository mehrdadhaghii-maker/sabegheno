// Arrears classification: 3 / 6 / 18 month edges are INCLUSIVE and the bands are contiguous.
const R = require("../src/services/rating.service.js");
const assert = require("assert"); let n = 0; const ok = (m, c) => { assert(c, "FAIL: " + m); console.log("✓", m); n++; };
const at = (due, now) => R.classifyArrears(new Date(due), new Date(now)).status;
const cases = (due, rows) => rows.every(([now, want]) => at(due, now) === want);
const DUE = "2026-01-15T00:00:00Z";
ok("not yet due / due day / 1 day late ⇒ جاری", at(DUE, "2026-01-01T00:00:00Z") === "current" && at(DUE, "2026-01-15T10:00:00Z") === "current" && at(DUE, "2026-01-16T00:00:00Z") === "current");
ok("exactly 3 months ⇒ جاری; +1 day ⇒ سررسید گذشته", at(DUE, "2026-04-15T00:00:00Z") === "current" && at(DUE, "2026-04-16T00:00:00Z") === "overdue");
ok("exactly 6 months ⇒ سررسید گذشته; +1 day ⇒ معوق", at(DUE, "2026-07-15T00:00:00Z") === "overdue" && at(DUE, "2026-07-16T00:00:00Z") === "delinquent");
ok("exactly 18 months ⇒ معوق; +1 day ⇒ مشکوک‌الوصول", at(DUE, "2027-07-15T00:00:00Z") === "delinquent" && at(DUE, "2027-07-16T00:00:00Z") === "doubtful");
ok("far beyond 18 months ⇒ مشکوک‌الوصول", at(DUE, "2030-01-01T00:00:00Z") === "doubtful");
ok("31 Aug due: 30 Nov(3m) جاری/1 Dec سررسید گذشته; 28 Feb(6m)/1 Mar معوق; 29 Feb 2028(18m)/1 Mar مشکوک", cases("2026-08-31T00:00:00Z", [["2026-11-30T00:00:00Z", "current"], ["2026-12-01T00:00:00Z", "overdue"], ["2027-02-28T00:00:00Z", "overdue"], ["2027-03-01T00:00:00Z", "delinquent"], ["2028-02-29T00:00:00Z", "delinquent"], ["2028-03-01T00:00:00Z", "doubtful"]]));
ok("time of day never moves a boundary", cases("2026-01-15T18:00:00Z", [["2026-04-15T23:59:59Z", "current"], ["2026-04-16T00:00:00Z", "overdue"]]));
const order = { current: 0, overdue: 1, delinquent: 2, doubtful: 3 }; let prev = 0, good = true, first = {};
for (let k = 0; k <= 1200; k++) { const st = R.classifyArrears(new Date(DUE), new Date(Date.UTC(2026, 0, 15) + k * 864e5)).status; if (!(st in order) || order[st] < prev) good = false; prev = order[st]; if (!(st in first)) first[st] = k; }
ok("sweep of 1200 days: one band per day, never backwards; edges at day 91 / 182 / 547", good && first.overdue === 91 && first.delinquent === 182 && first.doubtful === 547);
const now = new Date("2026-10-09T00:00:00Z"), d = (x) => new Date(now - x * 864e5);
ok("single credit: 100 days ⇒ سررسید گذشته, 200 ⇒ معوق, 600 ⇒ مشکوک‌الوصول", R.facilityStatus({ dueDate: d(100) }, now) === "overdue" && R.facilityStatus({ dueDate: d(200) }, now) === "delinquent" && R.facilityStatus({ dueDate: d(600) }, now) === "doubtful");
const ins = (arr) => arr.map(([due, paid], i) => ({ seq: i + 1, dueDate: due, amount: 1e6, paidAt: paid || null }));
ok("installments: 2 months late ⇒ still جاری but in arrears; the OLDEST unpaid decides (8 months ⇒ معوق)", (() => { const f = R.describeFacility({ id: "x", amount: 1e6, penaltyAmount: 0, disbursedAt: d(200), dueDate: d(0), installments: ins([[d(60)], [d(-30)]]) }, "ب", now); return f.status === "current" && f.inArrears && f.daysLate === 60; })() && R.facilityStatus({ installments: ins([[d(240)], [d(30)]]) }, now) === "delinquent");
const A = R.platformAnalysis([R.describeFacility({ id: "a", amount: 1e6, penaltyAmount: 0, disbursedAt: d(200), dueDate: d(0), installments: ins([[d(60)]]) }, "ب", now)], now);
ok("a late-but-جاری installment costs a mild −15 with a reason", A.items.some((i) => i.points === -15 && /عقب‌افتاده/.test(i.label)) && A.score === 685);
console.log(n + " classification checks passed");
