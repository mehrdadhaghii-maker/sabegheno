// Credit rating model (pure — no I/O, fully unit-tested).
//   • score 0–900, higher is better
//   • 15 grades A1…E3 (5 risk groups × 3 levels)
//   • 5 gauge bands
//   • facility status: current | overdue | delinquent | doubtful | settled
//   • platformScore: repayment behaviour of the person INSIDE Sabegheno
//   • blendScore: external bureau score + platform repayment score
const DAY = 86400_000;

const GRADES = [
  { code: "A1", min: 680, max: 900, group: "very_low", groupLabel: "ریسک خیلی پایین", stars: 5 },
  { code: "A2", min: 660, max: 679, group: "very_low", groupLabel: "ریسک خیلی پایین", stars: 4.5 },
  { code: "A3", min: 640, max: 659, group: "very_low", groupLabel: "ریسک خیلی پایین", stars: 4.5 },
  { code: "B1", min: 620, max: 639, group: "low", groupLabel: "ریسک پایین", stars: 4 },
  { code: "B2", min: 600, max: 619, group: "low", groupLabel: "ریسک پایین", stars: 3.5 },
  { code: "B3", min: 580, max: 599, group: "low", groupLabel: "ریسک پایین", stars: 3.5 },
  { code: "C1", min: 560, max: 579, group: "medium", groupLabel: "ریسک متوسط", stars: 3 },
  { code: "C2", min: 540, max: 559, group: "medium", groupLabel: "ریسک متوسط", stars: 2.5 },
  { code: "C3", min: 520, max: 539, group: "medium", groupLabel: "ریسک متوسط", stars: 2.5 },
  { code: "D1", min: 500, max: 519, group: "high", groupLabel: "ریسک بالا", stars: 2 },
  { code: "D2", min: 480, max: 499, group: "high", groupLabel: "ریسک بالا", stars: 1.5 },
  { code: "D3", min: 460, max: 479, group: "high", groupLabel: "ریسک بالا", stars: 1.5 },
  { code: "E1", min: 440, max: 459, group: "very_high", groupLabel: "ریسک خیلی بالا", stars: 1 },
  { code: "E2", min: 420, max: 439, group: "very_high", groupLabel: "ریسک خیلی بالا", stars: 0.5 },
  { code: "E3", min: 0, max: 419, group: "very_high", groupLabel: "ریسک خیلی بالا", stars: 0.5 },
];

// Gauge bands (upper bound exclusive, except the last).
const BANDS = [
  { key: "very_weak", label: "خیلی ضعیف", min: 0, max: 460 },
  { key: "weak", label: "ضعیف", min: 460, max: 520 },
  { key: "low_risk", label: "کم‌ریسک", min: 520, max: 580 },
  { key: "good", label: "خوب", min: 580, max: 640 },
  { key: "excellent", label: "عالی", min: 640, max: 900 },
];

const clampScore = (n) => Math.max(0, Math.min(900, Math.round(Number(n) || 0)));
const gradeFor = (score) => { const s = clampScore(score); return GRADES.find((g) => s >= g.min && s <= g.max) || GRADES[GRADES.length - 1]; };
const bandFor = (score) => { const s = clampScore(score); return [...BANDS].reverse().find((b) => s >= b.min) || BANDS[0]; };

// ---- facility status -------------------------------------------------------------------
const STATUS = {
  current: "جاری",
  overdue: "سررسید گذشته",
  delinquent: "معوق",
  doubtful: "مشکوک‌الوصول",
  settled: "تسویه‌شده",
};

// ---- arrears classification — ONE place defines the band edges --------------------------------
// Measured from the due date, in CALENDAR MONTHS, each upper edge INCLUSIVE:
//   1 day … 3 months        → جاری          (exactly 3 months is still «جاری»)
//   > 3 months … 6 months   → سررسید گذشته  (exactly 6 months is still «سررسید گذشته»)
//   > 6 months … 18 months  → معوق          (exactly 18 months is still «معوق»)
//   > 18 months             → مشکوک‌الوصول
// Bands are contiguous: no day belongs to two bands and no day belongs to none.
const ARREARS_BANDS = [
  { status: "current", uptoMonths: 3 },
  { status: "overdue", uptoMonths: 6 },
  { status: "delinquent", uptoMonths: 18 },
  { status: "doubtful", uptoMonths: Infinity },
];

const toDay = (d) => { const x = new Date(d); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()); };
const daysBetween = (a, b) => Math.floor((toDay(a) - toDay(b)) / DAY);

/** due date + k calendar months; a day that does not exist is clamped (31 Aug + 3 months = 30 Nov). */
function addMonthsUTC(date, k) {
  const d = new Date(date), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d;
}

/** Arrears of ONE due date at `now` → { status, late, daysLate }. Calendar-day comparison (hours never matter). */
function classifyArrears(dueDate, now = new Date()) {
  const daysLate = Math.max(0, daysBetween(now, dueDate));
  if (daysLate === 0) return { status: "current", late: false, daysLate: 0 };
  const today = toDay(now);
  const band = ARREARS_BANDS.find((b) => today <= toDay(addMonthsUTC(dueDate, b.uptoMonths))) || ARREARS_BANDS[ARREARS_BANDS.length - 1];
  return { status: band.status, late: true, daysLate };
}

const hasSchedule = (f) => Array.isArray(f.installments) && f.installments.length > 0;
const oldestUnpaidDue = (ins) => ins.filter((i) => !i.paidAt).map((i) => new Date(i.dueDate).getTime()).sort((a, b) => a - b)[0];
const unpaidLate = (ins, now) => { const t = oldestUnpaidDue(ins); return t == null ? 0 : Math.max(0, daysBetween(now, t)); };

function facilityStatus(f, now = new Date()) {
  if (hasSchedule(f)) {
    if (f.installments.every((i) => i.paidAt)) return "settled";
    return classifyArrears(oldestUnpaidDue(f.installments), now).status; // the OLDEST unpaid installment decides
  }
  if (f.settledAt) return "settled";
  return classifyArrears(f.dueDate, now).status;
}

// One installment as shown in the report.
function describeInstallment(i, now) {
  if (i.paidAt) {
    const late = Math.max(0, daysBetween(i.paidAt, i.dueDate));
    return { seq: i.seq, dueDate: i.dueDate, amount: i.amount, paidAt: i.paidAt, paidAmount: i.paidAmount ?? i.amount, status: late > 0 ? "paid_late" : "paid", daysLate: late };
  }
  const late = daysBetween(now, i.dueDate);
  return { seq: i.seq, dueDate: i.dueDate, amount: i.amount, paidAt: null, paidAmount: null, status: late >= 1 ? "overdue" : "due", daysLate: Math.max(0, late) };
}

function describeFacility(f, brand, now = new Date()) {
  const status = facilityStatus(f, now);
  const base = {
    id: f.id, brand, title: f.title || null, amount: f.amount, disbursedAt: f.disbursedAt, dueDate: f.dueDate,
    penaltyAmount: f.penaltyAmount || 0, status, statusLabel: STATUS[status],
    inArrears: false,
  };
  if (hasSchedule(f)) {
    const list = [...f.installments].sort((a, b) => a.seq - b.seq).map((i) => describeInstallment(i, now));
    const unpaid = list.filter((i) => !i.paidAt);
    const paid = list.filter((i) => i.paidAt);
    const settled = unpaid.length === 0;
    const lastPaid = paid.map((i) => new Date(i.paidAt).getTime()).sort((a, b) => b - a)[0];
    return {
      ...base,
      installments: list, installmentCount: list.length, paidCount: paid.length,
      lateCount: list.filter((i) => i.status === "paid_late" || i.status === "overdue").length,
      nextDue: unpaid.length ? unpaid[0].dueDate : null,
      remainingAmount: unpaid.reduce((s, i) => s + i.amount, 0),
      settledAt: settled ? (f.settledAt || (lastPaid ? new Date(lastPaid) : null)) : null,
      daysLate: settled ? Math.max(0, ...list.map((i) => i.daysLate)) : unpaidLate(f.installments, now),
      inArrears: !settled && unpaidLate(f.installments, now) > 0,
      settledLate: settled && list.some((i) => i.status === "paid_late"),
    };
  }
  const daysLate = f.settledAt ? Math.max(0, daysBetween(f.settledAt, f.dueDate)) : Math.max(0, daysBetween(now, f.dueDate));
  return {
    ...base, inArrears: !f.settledAt && daysLate > 0, remainingAmount: f.settledAt ? 0 : f.remainingAmount, settledAt: f.settledAt || null, daysLate,
    settledLate: !!f.settledAt && daysLate > 0, installments: [], installmentCount: 0, paidCount: 0, lateCount: 0, nextDue: f.settledAt ? null : f.dueDate,
  };
}

// ---- in-transit cheques ("چک‌های در راه") -----------------------------------------------------
// rows: { status: pending|cashed|bounced|cancelled, amount, dueDate, resolvedAt }
const CHEQUE_PENDING_LADDER = [[11, 40], [7, 25], [4, 10]]; // [from this many pending cheques, points lost]
const BOUNCED_PER_CHEQUE = 40, BOUNCED_CAP = 160, BOUNCED_WINDOW_MONTHS = 24;
const OVERDUE_PENDING_PER_CHEQUE = 10, OVERDUE_PENDING_CAP = 40;
const CASHED_PER_CHEQUE = 2, CASHED_CAP = 20;
const fmtMoney = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function chequeSummary(rows = [], now = new Date()) {
  const pending = rows.filter((c) => c.status === "pending");
  const recentBounced = rows.filter((c) => c.status === "bounced" && c.resolvedAt && toDay(c.resolvedAt) >= toDay(addMonthsUTC(now, -BOUNCED_WINDOW_MONTHS)));
  const overdue = pending.filter((c) => toDay(now) > toDay(c.dueDate));
  const due = pending.map((c) => new Date(c.dueDate).getTime()).sort((a, b) => a - b)[0];
  const ladder = CHEQUE_PENDING_LADDER.find(([from]) => pending.length >= from);
  const risk = recentBounced.length >= 2 || pending.length >= 11 ? "high" : recentBounced.length === 1 || pending.length >= 4 || overdue.length ? "medium" : "low";
  return {
    pendingCount: pending.length, pendingAmount: pending.reduce((s, c) => s + c.amount, 0),
    overduePendingCount: overdue.length, bouncedCount: recentBounced.length, bouncedAmount: recentBounced.reduce((s, c) => s + c.amount, 0),
    cashedCount: rows.filter((c) => c.status === "cashed").length, nextDue: due ? new Date(due) : null,
    pendingPenalty: ladder ? ladder[1] : 0, riskLevel: risk,
  };
}

function chequeAnalysis(rows = [], now = new Date()) {
  const s = chequeSummary(rows, now), items = [];
  if (s.bouncedCount) items.push({ key: "cheque_bounced", label: `${s.bouncedCount} چک برگشتی ثبت‌شده در سابقه‌نو (۲۴ ماه اخیر)`, detail: `مجموع ${fmtMoney(s.bouncedAmount)} تومان`, points: -Math.min(BOUNCED_CAP, s.bouncedCount * BOUNCED_PER_CHEQUE), kind: "neg" });
  if (s.pendingPenalty) items.push({ key: "cheque_pending", label: `${s.pendingCount} چک در راه (صادرشده و وصول‌نشده)`, detail: `مجموع ${fmtMoney(s.pendingAmount)} تومان`, points: -s.pendingPenalty, kind: "neg" });
  if (s.overduePendingCount) items.push({ key: "cheque_overdue", label: `${s.overduePendingCount} چک سررسیدگذشته و تعیین‌تکلیف‌نشده`, detail: null, points: -Math.min(OVERDUE_PENDING_CAP, s.overduePendingCount * OVERDUE_PENDING_PER_CHEQUE), kind: "neg" });
  return { items, bonus: Math.min(CASHED_CAP, s.cashedCount * CASHED_PER_CHEQUE), cashedCount: s.cashedCount, summary: s };
}

// ---- platform repayment analysis ---------------------------------------------------------
// Every point comes with a human-readable reason so the report can print ALL score reducers.
// Returns { score: null, items: [] } when the person has no history inside Sabegheno yet.
const STATUS_PENALTY = { overdue: 60, delinquent: 160, doubtful: 300 };
const BONUS_CAP = 100;
const ARREARS_CURRENT_PENALTY = 15; // late, but still inside the first 3 months («جاری»)

function platformAnalysis(rows, now = new Date(), cheques = []) {
  if (!rows.length && !cheques.length) return { score: null, items: [] };
  const items = [];
  let bonus = 0, onTimeUnits = 0;
  const ch = chequeAnalysis(cheques, now);
  items.push(...ch.items); bonus += ch.bonus; onTimeUnits += ch.cashedCount;
  for (const raw of rows) {
    const d = raw.status ? raw : describeFacility(raw, null, now);
    const who = d.brand ? `نزد «${d.brand}»` : "";
    if (d.inArrears && d.status === "current") items.push({ key: `arrears:${d.id || d.brand}`, label: `قسط/سررسید عقب‌افتاده ${who}`.replace(/\s+/g, " ").trim(), detail: `${d.daysLate} روز تأخیر (هنوز در طبقهٔ جاری)`, points: -ARREARS_CURRENT_PENALTY, kind: "neg" });
    if (STATUS_PENALTY[d.status]) items.push({ key: `status:${d.id || d.brand}`, label: `اعتبار ${who} ${d.statusLabel}`.replace(/\s+/g, " ").trim(), detail: `${d.daysLate} روز تأخیر`, points: -STATUS_PENALTY[d.status], kind: "neg" });
    if (d.installmentCount > 0) {
      const lateOnes = d.installments.filter((i) => i.status === "paid_late");
      if (lateOnes.length) {
        const pts = Math.min(60, lateOnes.reduce((s, i) => s + 8 + Math.min(20, Math.round(i.daysLate / 3)), 0));
        items.push({ key: `late:${d.id || d.brand}`, label: `تأخیر در پرداخت ${lateOnes.length} قسط ${who}`.replace(/\s+/g, " ").trim(), detail: `بیشترین تأخیر ${Math.max(...lateOnes.map((i) => i.daysLate))} روز`, points: -pts, kind: "neg" });
      }
      const onTime = d.installments.filter((i) => i.status === "paid").length;
      bonus += Math.min(30, onTime * 3); onTimeUnits += onTime;
      if (d.status === "settled" && !d.settledLate) bonus += 15;
    } else if (d.status === "settled") {
      if (d.settledLate) items.push({ key: `late:${d.id || d.brand}`, label: `تسویه با تأخیر ${who}`.replace(/\s+/g, " ").trim(), detail: `${d.daysLate} روز تأخیر`, points: -(20 + Math.min(60, Math.round(d.daysLate / 2))), kind: "neg" });
      else { bonus += 15; onTimeUnits += 1; }
    }
    if (d.penaltyAmount > 0) items.push({ key: `penalty:${d.id || d.brand}`, label: `اعمال جریمهٔ دیرکرد ${who}`.replace(/\s+/g, " ").trim(), detail: null, points: -20, kind: "neg" });
  }
  const gained = Math.min(BONUS_CAP, bonus);
  if (gained > 0) items.push({ key: "bonus", label: `پرداخت به‌موقع اقساط/اعتبارها (${onTimeUnits} مورد)`, detail: null, points: gained, kind: "pos" });
  const score = clampScore(700 + items.reduce((s, i) => s + i.points, 0));
  return { score, items };
}
const platformScore = (rows, now = new Date(), cheques = []) => platformAnalysis(rows, now, cheques).score;

// ---- blend ----------------------------------------------------------------------------------
const W_EXTERNAL = 0.65;
function blendParts(external, platform, rows = [], now = new Date()) {
  const raw = platform == null ? clampScore(external) : clampScore(W_EXTERNAL * external + (1 - W_EXTERNAL) * platform);
  // an unsettled doubtful facility can never leave the person above "very weak"
  const capped = rows.some((r) => (r.status || facilityStatus(r, now)) === "doubtful");
  return { raw, final: capped ? Math.min(raw, 459) : raw, capped: capped && raw > 459 };
}
const blendScore = (external, platform, rows = [], now = new Date()) => blendParts(external, platform, rows, now).final;

// ---- inquiry frequency -----------------------------------------------------------------------
// Many recent inquiries about the same person look like credit-hunting → negative weight.
// n30 / n90 = inquiries by OTHER requests (the current one is not counted).
function inquiryPenalty(n30, n90 = 0) {
  const base = n30 >= 10 ? 90 : n30 >= 6 ? 60 : n30 >= 4 ? 35 : n30 >= 2 ? 15 : 0;
  const extra = n90 >= 12 && n30 < 10 ? 20 : 0;
  const points = -(base + extra);
  const level = points === 0 ? "none" : points >= -15 ? "low" : points >= -35 ? "medium" : "high";
  return { points, level };
}

// ---- breakdown of the final score ----------------------------------------------------------------
// base 700 + every item = final score (items are the EFFECTIVE points after the 65/35 weighting).
function buildBreakdown({ external = [], platform = [], hasPlatform, beforeCap, final }) {
  const wE = hasPlatform ? W_EXTERNAL : 1, wP = hasPlatform ? 1 - W_EXTERNAL : 0;
  const items = [
    ...external.map((i) => ({ ...i, source: "external", points: Math.round(i.points * wE) })),
    ...platform.map((i) => ({ ...i, source: "platform", points: Math.round(i.points * wP) })),
  ].filter((i) => i.points !== 0);
  if (beforeCap != null && beforeCap !== final) items.push({ key: "doubtful_cap", label: "سقف رتبه (E1) به‌دلیل اعتبار مشکوک‌الوصولِ تسویه‌نشده", detail: null, points: final - beforeCap, kind: "neg", source: "platform" });
  const residual = final - (700 + items.reduce((s, i) => s + i.points, 0));
  if (residual !== 0) items.push({ key: "rounding", label: "گرد کردن و محدودهٔ ۰ تا ۹۰۰", detail: null, points: residual, kind: residual < 0 ? "neg" : "pos", source: "system" });
  const neg = items.filter((i) => i.points < 0).sort((a, b) => a.points - b.points);
  const pos = items.filter((i) => i.points > 0).sort((a, b) => b.points - a.points);
  return { base: 700, final, reducers: neg, boosters: pos, totalReduction: neg.reduce((s, i) => s + i.points, 0), totalBoost: pos.reduce((s, i) => s + i.points, 0) };
}

function totals(described) {
  const open = described.filter((d) => d.status !== "settled");
  return {
    count: described.length,
    active: open.length,
    settled: described.length - open.length,
    overdue: open.filter((d) => d.status !== "current").length,
    openAmount: open.reduce((s, d) => s + d.remainingAmount, 0),
    totalGranted: described.reduce((s, d) => s + d.amount, 0),
    penalty: described.reduce((s, d) => s + d.penaltyAmount, 0),
    installmentsPaid: described.reduce((s, d) => s + (d.paidCount || 0), 0),
    installmentsTotal: described.reduce((s, d) => s + (d.installmentCount || 0), 0),
    lateInstallments: described.reduce((s, d) => s + (d.lateCount || 0), 0),
  };
}

module.exports = { chequeSummary, chequeAnalysis, ARREARS_BANDS, classifyArrears, addMonthsUTC, GRADES, BANDS, STATUS, gradeFor, bandFor, clampScore, facilityStatus, describeFacility, describeInstallment, platformScore, platformAnalysis, blendScore, blendParts, inquiryPenalty, buildBreakdown, totals, W_EXTERNAL };
