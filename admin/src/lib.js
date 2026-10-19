const D = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
// Numbers >= 1000 always get thousand separators; strings (phones, ids) are only digit-converted.
export const fa = (v) => String(typeof v === "number" && Number.isFinite(v) && Math.abs(v) >= 1000 ? v.toLocaleString("en-US") : v ?? "").replace(/,/g, "٬").replace(/[0-9]/g, (d) => D[d]);
export const num = (v) => fa(Math.round(Number(v) || 0).toLocaleString("en-US"));
const trim = (v) => Number(v.toFixed(1)).toString();
export function toman(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return `${fa(trim(n / 1e9))} میلیارد تومان`;
  if (n >= 1e6) return `${fa(trim(n / 1e6))} میلیون تومان`;
  return `${num(n)} تومان`;
}
export const shortDay = (key) => new Date(`${key}T12:00:00Z`).toLocaleDateString("fa-IR", { month: "short", day: "numeric" });
export const fullDate = (d) => new Date(d).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
export const dayOnly = (d) => new Date(d).toLocaleDateString("fa-IR");

export function ago(d) {
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 1) return "همین الان";
  if (m < 60) return `${fa(m)} دقیقه پیش`;
  if (m < 1440) return `${fa(Math.round(m / 60))} ساعت پیش`;
  return `${fa(Math.round(m / 1440))} روز پیش`;
}

export const DECISION = {
  approve: { label: "تأییدشده", tone: "good", color: "#0FAF9E" },
  review: { label: "نیازمند بررسی", tone: "warn", color: "#FCA311" },
  decline: { label: "ردشده", tone: "bad", color: "#D64550" },
};
export const BUSINESS_STATUS = {
  pending_docs: { label: "در انتظار مدارک", tone: "warn" },
  pending_contract: { label: "در انتظار قرارداد", tone: "info" },
  approved: { label: "تأییدشده", tone: "good" },
  suspended: { label: "تعلیق‌شده", tone: "bad" },
  rejected: { label: "ردشده", tone: "bad" },
};
export const PROVIDER_STATUS = {
  connected: { label: "متصل", tone: "good" },
  degraded: { label: "کاهش کیفیت", tone: "warn" },
  disconnected: { label: "قطع", tone: "bad" },
};
export const EVENT_LABEL = {
  inquiry: "استعلام", commitment_created: "تعهد جدید", settled: "تسویه",
  delay: "تأخیر", bounced_check: "چک برگشتی", bad_debt: "بدحسابی",
};

// Excel-friendly CSV (UTF-8 BOM so Persian text opens correctly).
export function downloadCsv(name, rows) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

// 09153812610 -> ۰۹۱۵ ۳۸۱ ۲۶۱۰ (always rendered inside an LTR isolate by the .phone class)
export const formatPhone = (m = "") => fa(String(m).replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3"));
export const initials = (name = "") => {
  const w = name.replace(/\[[^\]]*\]\s*/g, "").trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + "\u200c" + w[1][0] : (w[0] || "؟").slice(0, 2));
};
const PALETTE = [["#DDF7EE", "#087F76"], ["#E3EEF7", "#123B5D"], ["#FDF0D5", "#8F5E17"], ["#EFE6FA", "#5B3A99"], ["#FBE7E9", "#B23A45"], ["#E6F2D9", "#3F6B1C"]];
export const avatarColors = (name = "") => PALETTE[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length];
export const cleanName = (n = "") => n.replace(/^\[دمو\]\s*/, "");

export const METRICS = {
  score: "امتیاز اعتباری", requestedAmount: "مبلغ درخواستی (تومان)", activeBounced: "چک برگشتی فعال",
  overdueDays: "روز تأخیر", concurrentBusinesses: "کسب‌وکارهای هم‌زمان", externalExposure: "تعهد بیرونی (تومان)", badDebtCount: "تعداد بدحسابی",
};
export const OPERATORS = { lt: "کمتر از", lte: "کمتر یا مساوی", gt: "بیشتر از", gte: "بیشتر یا مساوی", eq: "برابر با" };
export const ACTIONS = { decline: "رد درخواست", review: "ارجاع به بررسی", cap_limit: "سقف مبلغ", reduce_limit: "کاهش سقف (٪)" };
// parse "1,250,000" / "۱٬۲۵۰٬۰۰۰" typed by a human into a number
export const parseNum = (v) => Number(String(v ?? "").replace(/[٬,\s]/g, "").replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d))) || 0;

// Rating grades (mirror of backend rating.service.js — the backend decides the score).
const GR = [["A1",680],["A2",660],["A3",640],["B1",620],["B2",600],["B3",580],["C1",560],["C2",540],["C3",520],["D1",500],["D2",480],["D3",460],["E1",440],["E2",420],["E3",0]];
export const gradeOf = (score) => (GR.find(([, min]) => score >= min) || GR[GR.length - 1])[0];
export const gradeTone = (g) => ({ A: "good", B: "good", C: "warn", D: "warn", E: "bad" }[g[0]]);
export const fitCls = (v) => { const n = String(v ?? "").length; return n > 17 ? "fit-xs" : n > 13 ? "fit-s" : n > 9 ? "fit-m" : ""; };
export const STATUS_FA = { current: "جاری", overdue: "سررسید گذشته", delinquent: "معوق", doubtful: "مشکوک‌الوصول", settled: "تسویه‌شده" };

export const compactToman = (n) => {
  n = Number(n) || 0;
  const t1 = (x) => (Math.round(x * 10) / 10).toString();
  if (n >= 1e9) return { value: fa(t1(n / 1e9)), unit: "میلیارد تومان" };
  if (n >= 1e6) return { value: fa(t1(n / 1e6)), unit: "میلیون تومان" };
  return { value: num(n), unit: "تومان" };
};
