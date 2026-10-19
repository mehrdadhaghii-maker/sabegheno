import React, { useState, useEffect, useMemo } from "react";
import { Home, PlusCircle, History, ShieldCheck, ShieldAlert, CreditCard, Layers, FileCheck2, Banknote, Waves, CheckCircle2, AlertTriangle, XCircle, X, ArrowUpRight, BadgeCheck, Search, Users, ClipboardList, Menu, HelpCircle, Headphones, Download, Upload, Paperclip, FileText, Building2, Landmark, KeyRound } from "lucide-react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  CartesianGrid,
} from "recharts";
import { api, getAuth, setAuth as persistAuth } from "./api.js";
import { ToastProvider, BizLogo, cleanName } from "./panel/kit.jsx";
import Dashboard from "./panel/Dashboard.jsx";
import NewCheck from "./panel/NewCheck.jsx";
import Commitments from "./panel/Commitments.jsx";
import HistoryPage from "./panel/History.jsx";
import SupportPage from "./panel/SupportPage.jsx";
import AccountPage from "./panel/AccountPage.jsx";
import ReportPage from "./panel/Report.jsx";
import ContractBanner from "./panel/ContractBanner.jsx";
import { AccountChip, LockedScreen, NEEDS_APPROVAL } from "./panel/AccountStatus.jsx";
import CreditsHub from "./panel/CreditsHub.jsx";
import ApiPage from "./panel/ApiPage.jsx";
import SelfReport from "./panel/SelfReport.jsx";
import PaymentReturn from "./panel/PaymentReturn.jsx";
import Faq from "./panel/Faq.jsx";
import NotificationBell from "./panel/Bell.jsx";
import AuthPage from "./panel/AuthPage.jsx";

const LOGO_ICON =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFAAAABTCAMAAAA/W3AxAAAAwFBMVEUAAAANNF4RUm8WmZf6+/weZoV5eXlemaQNampTb41dqKxul6kQGWxOcpFUnaqOo7WeztB2+Peo09YF+fmgqK8bra3q8PJcXqiltsZ/f/+mtcc2VHRHXHlcdY9FZHpnx8MxZIiZys4AAP9qzMeEmrEsbrBJXHo9oaQYxLdRyL9MxbwA/wB//39iwLxOx8CCnLgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACdpUV7AAAAMHRSTlMA/v38DfUCnQOgC2ID09ZYXgYrARUDTglRAi2kqXLWZ6yWAY+mBGqp/p/XAQJc1s07RCkqAAAFZklEQVR42q2Z13riOhCAB3kk23LBmA4B0red3X3/tzuj4iIbW0qyc5EvJPB7mqYIgM/IGoQ4IiD8A8FjknevcvE1qLAstKJf7L9Gw0OWpszINb1I/CQSE/XjdFGsRV9YmqmHfUa504UPYA2TkMlHcZg93qdpOW8+iDulfJqm5R2SsHgfCSfnlGvkAeA5IIFDccpszH24Z3rHIRBHksL80VGJUnt951o9lz1CRZZzxsKJ6YwXcd/gQoEsnbP3SMiU2wMWgrtmczh869QLIbL0oAvPFG9FyKLD+XgsVsrl0xrmrnrzQFYoW3M5Y6901ZslsvSEc7YqeYNTwVgQ0MTVUwtzOHAexOPa1qOnIghc8hAgS5deW60D4wAgS2tla0C5Uo2RMT7rQ2bSJKiNHIUk9crXv3ySx7iyNbSFbABLxneIU0BWKFwShhP7/Z7OLyfg7j6QcAPXoc+NKsS8KEp+h2cCK9bOEYX1ZHGGjdxnh9dXKBajiLDWWHe+gd3kePMMyGwR/8vGaWNC4YwxqwSqOPpTTxAFnGyfUWEZ4dShkM4nt4AvEUm9XoG8G9+dAhbYq6sNj6u8c6sTEi/WPO2F5B6wNkBE14eE242KHbWvKjK8eo1PFWzv2I3x62u8V2EuSdrqzw84ao5k4k3hyh39uoKqrO72Tz3vVToPSU0LLHa6vziSWHMjVGhyUhTdnGgLeCfHq2mH7HgioOoARj/y6ai0J4pg7N2a7KHoxIP8IfctUSIBXyxwoXk72IyGa8ga3srkD/6OXGICZwUk/SVpyNhTllVcAflB1ZQ1uuUoi7jiVU22rEyAYmwjkxiTUSZ1VWFMIBo/lMUp5L90XZHdYSP30f8Vb9tlnNY4bv9i4tFFmxkcKYiyKQCi6V/EI4ky3MIAGN2Gxf93/OPbC33ajDOUMWSfgIzrIpOvNU/jGGnTLxF11Hj1v+aPZ55RKdSpoDNbl5cSlYmaoM6KTODU8nrTqjRJSfITW38vWGmTAQUBjZAapOHFJKQ6zZXhsRL7029iNDGBalQ8P2YNEJA3Ewb1VDI0tjmeZfb40HtE/9hUDS8qnWy0wNMTa6e9XM8sj24xI1fJfpnoFIyilc1NyKlNYAa3aoVdB0n1riOsGxshbwsn0bOO9/1HL3Ws7DpgYQyQsOkDY6dYrdsQa/nj2Czldptg2vW4g2m+ErIezwnItufAJgSjqpMOVaT5qSXyfkCUKyMfkF6/91QU9nA2oa67aqGqdhaNgGI8jcClbcTNA8kTJnW6AKud41sUANTHs4nMg33DGvQwEUPeG+qpyvIo8vtQz8SXNnWMjUdqXkWMtvMJUu8QmbLjyM+JPk1anR5aon4PDjasb0rjIfBeHvbsvpqVsDYzBz0kWVscxmaGHAFv00C1mC21lmyJTsgUrkmiwJhAe9dBwdXzBBhPalzWDQJjF65n9yn1NFwSk8UbdfXjaHfHYipfQXcXeLo8pMvEtgc2A4Tkl3/qNk5BGm7reDCVDYE3lGE3NlIFthriRkC3kPs8eWXMB2w6fwAuazrrHPAl4C5I03YxmxAH2JscvFmzWPiBuuf6784yuwP4gR7eUV/rpd2G4gHq0dNn67m/QU0QQ+zViYzpcGGc05AGldkA2yrjB1piBXP+w1N6Z+GeAjKt3tyNl4CHu7cLUz4sawDp2cCLYCAN0Ai+86ZWqTAe19YGrc4HFgAkHMJbUHlRi40va/T+95Gb+wFygCv1VdwHLu1VJuCld9ngKlchjBe2kMJ1SK+qDvaRZaybavLRi3WircwCs8zORXG9FkWRxsvKrDOf/YIC7VcT/S8mIBcCviBIIe/OfSLEv/lGpq+hX/4HW3VB7KSiJwwAAAAASUVORK5CYII=";

/* ============================== design tokens ============================== */
const C = {
  ink: "#0B1F3A",
  inkSoft: "#123B5D",
  inkFaint: "#2C4270",
  paper: "#F5F7FA",
  surface: "#FFFFFF",
  line: "#E5E5E5",
  lineStrong: "#C9C9C9",
  teal: "#0FAF9E",
  tealDeep: "#087F76",
  tealSoft: "#DDF7EE",
  good: "#1D7A46",
  goodSoft: "#E4F1E9",
  warn: "#8F5E17",
  warnSoft: "#F3E9D3",
  bad: "#B23A45",
  badSoft: "#F6E4E5",
  text: "#141414",
  textMuted: "#5A5A5A",
  textFaint: "#8A8A8A",
};

const FONT_DISPLAY = "'Vazirmatn', 'Tahoma', sans-serif";
const FONT_BODY = "'Vazirmatn', 'Tahoma', sans-serif";
const FONT_MONO = "'Vazirmatn', 'Tahoma', sans-serif";

const toneColor = {
  good: { fg: C.good, bg: C.goodSoft },
  warn: { fg: C.warn, bg: C.warnSoft },
  bad: { fg: C.bad, bg: C.badSoft },
  neutral: { fg: C.textMuted, bg: "#E9EDF3" },
  teal: { fg: C.tealDeep, bg: C.tealSoft },
};

function BrandMark({ size = 28, chip = false }) {
  if (!chip) {
    return <img src="/sabegheno-official-icon.png" alt="سابقه‌نو" style={{ height: size, width: "auto", display: "block", flexShrink: 0 }} />;
  }
  const pad = Math.round(size * 0.22);
  return (
    <div
      style={{
        width: size + pad,
        height: size + pad,
        background: "#fff",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <img src="/sabegheno-official-icon.png" alt="سابقه‌نو" style={{ height: size, width: "auto", display: "block" }} />
    </div>
  );
}

function cn(...parts) {
  return parts.filter(Boolean).join(" ");
}
const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
function fa(input) {
  // Numbers (not strings like phone numbers / ids) always get thousand separators.
  const v = typeof input === "number" && Number.isFinite(input) && Math.abs(input) >= 1000 ? input.toLocaleString("en-US") : input;
  return String(v).replace(/,/g, "٬").replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}
function tomanShort(amount) {
  amount = Number(amount) || 0;
  if (amount >= 1_000_000_000) return `${fa(trim(amount / 1_000_000_000))} میلیارد تومان`;
  if (amount >= 1_000_000) return `${fa(trim(amount / 1_000_000))} میلیون تومان`;
  return `${fa(amount.toLocaleString("en-US"))} تومان`;
}
function compactM(amount) {
  amount = Number(amount) || 0;
  if (amount >= 1_000_000) return `${trim(amount / 1_000_000)}M`;
  return String(amount);
}
function trim(v) {
  return Number(v.toFixed(1)).toString();
}
function simulateDecision(recommendedLimit, amount) {
  if (recommendedLimit <= 0) return { tone: "bad", label: "خارج از محدوده پیشنهادی" };
  const ratio = amount / recommendedLimit;
  if (ratio <= 1) return { tone: "good", label: "مناسب" };
  if (ratio <= 1.25) return { tone: "warn", label: "نیازمند بررسی" };
  if (ratio <= 1.6) return { tone: "bad", label: "ریسک بالا" };
  return { tone: "bad", label: "خارج از محدوده پیشنهادی" };
}
const decisionMeta = {
  approve: { tone: "good", label: "مناسب برای اعتبار", icon: BadgeCheck },
  review: { tone: "warn", label: "نیازمند بررسی", icon: Search },
  decline: { tone: "bad", label: "عدم تأیید", icon: AlertTriangle },
};

function maskNationalId(id) {
  if (!id) return "••••••••••";
  return `${String(id).slice(0, 4)}••••••`;
}

/* --------------------------- base primitives ----------------------------- */

function SectionEyebrow({ children }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-xs font-semibold" style={{ color: C.tealDeep, letterSpacing: "0.06em" }}>
      <span style={{ width: 14, height: 1, background: C.teal, display: "inline-block" }} />
      {children}
    </div>
  );
}

function Tag({ tone = "neutral", children, className }) {
  const t = toneColor[tone];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs font-semibold", className)}
      style={{ background: t.bg, color: t.fg, borderInlineStart: `3px solid ${t.fg}` }}
    >
      {children}
    </span>
  );
}

function VerdictTag({ status, size = "md" }) {
  const meta = decisionMeta[status] || decisionMeta.review;
  const t = toneColor[meta.tone];
  const Icon = meta.icon;
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm font-bold", size === "lg" ? "px-4 py-2 text-sm" : "px-2.5 py-1 text-xs")}
      style={{ background: t.bg, color: t.fg, border: `1px solid ${t.fg}55` }}
    >
      <Icon size={size === "lg" ? 17 : 13} className="shrink-0" />
      {meta.label}
    </span>
  );
}

function Button({ variant = "primary", size = "md", className, style, children, disabled, ...props }) {
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4 text-sm", lg: "h-11 px-6 text-sm" };
  const base = {
    primary: { background: C.ink, color: "#fff", border: `1px solid ${C.ink}` },
    teal: { background: C.teal, color: "#fff", border: `1px solid ${C.tealDeep}` },
    outline: { background: C.surface, color: C.ink, border: `1px solid ${C.lineStrong}` },
    ghost: { background: "transparent", color: C.textMuted, border: "1px solid transparent" },
  };
  return (
    <button
      disabled={disabled}
      className={cn("inline-flex items-center justify-center gap-2 rounded-sm font-semibold transition-colors disabled:opacity-40", sizes[size], className)}
      style={{ ...base[variant], ...style, cursor: disabled ? "not-allowed" : "pointer" }}
      {...props}
    >
      {children}
    </button>
  );
}

function Card({ className, style, accent, children }) {
  return (
    <div
      className={cn("rounded-sm bg-white", className)}
      style={{
        background: C.surface,
        border: `1px solid ${C.line}`,
        borderTop: accent ? `3px solid ${accent}` : `1px solid ${C.line}`,
        boxShadow: "0 1px 2px rgba(11,18,32,0.04)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Progress({ value, tone = "teal" }) {
  const t = toneColor[tone] || toneColor.teal;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-sm" style={{ background: C.line }}>
      <div className="h-full rounded-sm transition-all duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: t.fg }} />
    </div>
  );
}

function ErrorBanner({ children, onDismiss }) {
  if (!children) return null;
  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-sm p-4"
      style={{ background: C.badSoft, border: `1px solid ${C.bad}33`, boxShadow: "0 4px 16px -6px rgba(178,58,69,0.25)" }}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: C.bad }}>
        <AlertTriangle size={16} color="#fff" />
      </div>
      <div className="flex-1 pt-0.5">
        <div className="text-sm font-bold" style={{ color: C.bad }}>مشکلی پیش آمد</div>
        <div className="mt-0.5 text-sm leading-6" style={{ color: C.text }}>{children}</div>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 rounded-sm p-1 transition-colors hover:bg-black/5" style={{ color: C.textFaint }} aria-label="بستن">
          <X size={16} />
        </button>
      )}
    </div>
  );
}

function Spinner({ label }) {
  return (
    <div className="flex items-center justify-center gap-2 p-8 text-sm" style={{ color: C.textMuted }}>
      <span
        className="inline-block h-4 w-4 animate-spin rounded-full"
        style={{ border: `2px solid ${C.line}`, borderTopColor: C.teal }}
      />
      {label || "در حال بارگذاری..."}
    </div>
  );
}

/* -------------------------- credit-view adapter --------------------------- */
/* Maps a raw backend CreditCheck (+ optional sources breakdown) into the
   richer shape the visual components below expect. Fields the real API
   doesn't provide yet (trend history, altCredit, timeline) are either
   derived with a documented placeholder heuristic or dropped, rather than
   faked with invented copy. */

function computeIndicators(check, sources) {
  const loans = sources?.loans;
  const checks = sources?.checks;
  const payment = checks?.issued > 0 && checks?.resolved != null ? Math.round((checks.resolved / checks.issued) * 100) : null;
  const checksScore = checks?.source === "ok" ? (checks.activeBounced > 0 ? Math.max(0, 100 - checks.activeBounced * 40) : 100) : null;
  const loansScore = loans?.source === "ok" ? (loans.overdue > 0 ? Math.max(0, 100 - loans.overdue * 40) : loans?.active > 0 ? 85 : 75) : null;
  const commitments = Math.max(0, 100 - (check.concurrentProviders || 0) * 20);
  return { payment, commitments, checks: checksScore, loans: loansScore };
}

function buildCustomerView(check, sources, extra = {}) {
  const loans = sources?.loans || { active: 0, totalCommitment: 0, settled: 0, overdue: 0, records: [], source: "unavailable" };
  const checks = sources?.checks || { activeBounced: 0, resolved: 0, issued: 0, records: [], source: "unavailable" };
  const exposureEvents = sources?.exposure?.events || [];

  const indicators = computeIndicators(check, sources);
  const knownIndicators = [indicators.payment, indicators.commitments, indicators.checks, indicators.loans].filter((v) => typeof v === "number");
  const overallHealth = knownIndicators.length ? Math.round(knownIndicators.reduce((a, b) => a + b, 0) / knownIndicators.length) : 0;
  const healthLabel = overallHealth >= 75 ? "بسیار خوب" : overallHealth >= 55 ? "خوب" : overallHealth >= 35 ? "متوسط" : "پرریسک";
  const healthSummary =
    check.decision === "approve"
      ? "بر اساس داده‌های در دسترس، وضعیت اعتباری این مشتری مطلوب ارزیابی شده است."
      : check.decision === "review"
      ? "وضعیت اعتباری این مشتری نیازمند بررسی دستی است."
      : "بر اساس داده‌های در دسترس، اعطای اعتبار در این مبلغ توصیه نمی‌شود.";

  const positives = [];
  const negatives = [];
  if (checks.activeBounced === 0) positives.push("بدون چک برگشتی فعال");
  else negatives.push(`${fa(checks.activeBounced)} چک برگشتی فعال`);
  if (loans.overdue === 0) positives.push("بدون تسهیلات معوق");
  else negatives.push(`${fa(loans.overdue)} تسهیلات معوق`);
  if ((check.concurrentProviders || 0) === 0) positives.push("بدون همپوشانی درخواست با سایر منابع داده");
  else negatives.push(`${fa(check.concurrentProviders)} منبع داده دیگر در ۷۲ ساعت اخیر فعالیت داشته‌اند`);
  if (checks.resolved > 0) positives.push(`${fa(checks.resolved)} چک رفع سوءاثر شده`);

  const sourceList = [
    {
      key: "loans",
      label: "تسهیلات",
      ok: loans.source !== "unavailable" && loans.source !== "error",
      note: loans.source === "unavailable" ? "هنوز به API تسهیلات متصل نشده" : loans.source === "error" ? "خطا در دریافت اطلاعات" : undefined,
    },
    {
      key: "checks",
      label: "چک برگشتی",
      ok: checks.source !== "unavailable" && checks.source !== "error",
      note: checks.source === "unavailable" ? "هنوز به API چک برگشتی متصل نشده" : checks.source === "error" ? "خطا در دریافت اطلاعات" : undefined,
    },
  ];

  const exposure = {
    windowHours: 72,
    providersCount: check.concurrentProviders || 0,
    totalOtherRequested: check.totalExternalExposure || 0,
    flagged: (check.concurrentProviders || 0) > 0,
    inquiries: exposureEvents.map((e) => ({
      provider: e.provider,
      hoursAgo: Math.max(0, Math.round((Date.now() - new Date(e.createdAt).getTime()) / 3600000)),
      amount: e.amount,
      type: e.type === "inquiry" ? "استعلام" : "تعهد جدید",
    })),
  };

  return {
    id: check.id,
    name: extra.name || "مشتری",
    nationalIdMasked: extra.nationalId ? maskNationalId(extra.nationalId) : "••••••••••",
    requestedAmount: check.requestedAmount,
    termMonths: check.termMonths,
    score: check.score,
    confidence: check.confidence,
    riskLevel: check.riskLevel,
    decision: check.decision,
    recommendedLimit: check.recommendedLimit,
    recommendedTermMonths: check.recommendedTermMonths,
    overrideNote: check.overrideReason,
    trend: [{ label: "وضعیت فعلی", value: check.score }],
    indicators,
    overallHealth,
    healthLabel,
    healthSummary,
    positives,
    negatives,
    sources: sourceList,
    loans,
    checks,
    exposure,
    lastUpdate: check.createdAt ? new Date(check.createdAt).toLocaleString("fa-IR") : "اکنون",
    hasFullDetail: !!sources,
  };
}

const PROVIDER_STATUS_FA = { connected: "متصل", degraded: "کاهش کیفیت", disconnected: "قطع" };
const EVENT_TYPE_FA = {
  inquiry: "استعلام",
  commitment_created: "تعهد جدید",
  settled: "تسویه شد",
  delay: "تأخیر",
  bounced_check: "چک برگشتی",
  bad_debt: "بدحسابی",
};

function buildProviderView(p) {
  return {
    id: p.id,
    name: p.name,
    businessId: p.businessId || "",
    status: PROVIDER_STATUS_FA[p.status] || p.status,
    statusRaw: p.status,
    integration: p.integrationType,
    lastSync: p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleString("fa-IR") : "—",
    quality: p.dataQuality,
    latency: p.latencyMs,
    errorRate: p.errorRate,
    events: p.events || [],
  };
}

/* --------------------------- signature visual ---------------------------- */

function VerdictSeal({ score, status, size = 232 }) {
  const [animated, setAnimated] = useState(0);
  const meta = decisionMeta[status] || decisionMeta.review;
  const tone = toneColor[meta.tone];
  const Icon = meta.icon;
  const strokeOuter = 1;
  const strokeMain = 10;
  const rOuter = size / 2 - 3;
  const rMain = size / 2 - 20;
  const cMain = 2 * Math.PI * rMain;

  useEffect(() => {
    setAnimated(0);
    const t = setTimeout(() => setAnimated(score), 60);
    return () => clearTimeout(t);
  }, [score]);

  const pct = Math.min(1, animated / 900);
  const offset = cMain * (1 - pct);
  const dashCount = 60;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2} cy={size / 2} r={rOuter}
          stroke={C.lineStrong} strokeWidth={strokeOuter} fill="none"
          strokeDasharray={`${(2 * Math.PI * rOuter) / dashCount / 2} ${(2 * Math.PI * rOuter) / dashCount / 2}`}
        />
        <circle cx={size / 2} cy={size / 2} r={rMain} stroke={C.line} strokeWidth={strokeMain} fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={rMain}
          stroke={tone.fg} strokeWidth={strokeMain} strokeLinecap="butt" fill="none"
          strokeDasharray={cMain} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.22,.9,.3,1)" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-6xl font-black leading-none tracking-tight" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>
          {fa(score)}
        </span>
        <div style={{ width: 30, height: 1, background: C.teal, margin: "10px 0 8px" }} />
        <span className="text-xs font-semibold" style={{ color: C.textMuted, letterSpacing: "0.05em" }}>امتیاز اعتبار</span>
        <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold" style={{ color: tone.fg }}>
          <Icon size={13} /> {meta.label}
        </span>
      </div>
    </div>
  );
}

function MiniRing({ icon: Icon, label, value, size = 82 }) {
  value = typeof value === "number" ? value : 0;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} stroke={C.line} strokeWidth={stroke} fill="none" />
          <circle cx={size / 2} cy={size / 2} r={r} stroke={C.teal} strokeWidth={stroke} fill="none"
            strokeDasharray={c} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon size={15} style={{ color: C.ink }} />
          <span className="mt-0.5 text-xs font-bold" style={{ color: C.ink }}>{fa(value)}٪</span>
        </div>
      </div>
      <span className="text-xs font-medium" style={{ color: C.textMuted }}>{label}</span>
    </div>
  );
}

function HealthWheel({ indicators, stability, overall, size = 260 }) {
  const dims = [
    { key: "payment", label: "رفتار پرداخت", value: indicators.payment, icon: CreditCard },
    { key: "commitments", label: "تعهدات", value: indicators.commitments, icon: Layers },
    { key: "checks", label: "چک", value: indicators.checks, icon: FileCheck2 },
    { key: "loans", label: "تسهیلات", value: indicators.loans, icon: Banknote },
    { key: "stability", label: "ثبات", value: stability, icon: Waves },
  ];
  const center = size / 2;
  const orbit = size * 0.42;
  const nodeR = size * 0.135;
  const hubR = size * 0.165;

  return (
    <div className="relative mx-auto" style={{ width: size, height: size + size * 0.1 }}>
      <svg width={size} height={size} className="absolute inset-0">
        {dims.map((d, i) => {
          const angle = (-90 + (360 / dims.length) * i) * (Math.PI / 180);
          const x1 = center + (hubR + 3) * Math.cos(angle);
          const y1 = center + (hubR + 3) * Math.sin(angle);
          const x2 = center + (orbit - nodeR - 3) * Math.cos(angle);
          const y2 = center + (orbit - nodeR - 3) * Math.sin(angle);
          return <line key={d.key} x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.lineStrong} strokeWidth={1.5} strokeDasharray="1 5" strokeLinecap="round" />;
        })}
      </svg>
      <div
        className="absolute flex flex-col items-center justify-center rounded-full"
        style={{ width: hubR * 2, height: hubR * 2, left: center - hubR, top: center - hubR, background: C.ink, border: `2px solid ${C.teal}`, boxShadow: "0 4px 14px -6px rgba(14,42,82,0.4)" }}
      >
        <span className="font-black leading-none" style={{ color: "#fff", fontFamily: FONT_DISPLAY, fontSize: hubR * 0.62 }}>{fa(overall)}</span>
        <div style={{ width: hubR * 0.55, height: 1, background: C.teal, opacity: 0.6, margin: `${hubR * 0.14}px 0 ${hubR * 0.1}px` }} />
        <span className="text-center font-medium" style={{ color: "#AEB9CC", fontSize: hubR * 0.19, lineHeight: 1.35 }}>
          سلامت<br />اعتباری
        </span>
      </div>
      {dims.map((d, i) => {
        const angle = (-90 + (360 / dims.length) * i) * (Math.PI / 180);
        const x = center + orbit * Math.cos(angle);
        const y = center + orbit * Math.sin(angle);
        const Icon = d.icon;
        const ringStroke = nodeR * 0.16;
        const circumference = 2 * Math.PI * (nodeR - ringStroke);
        const offset = circumference * (1 - d.value / 100);
        return (
          <div key={d.key} className="absolute flex flex-col items-center" style={{ left: x - nodeR, top: y - nodeR, width: nodeR * 2 }}>
            <div className="relative flex items-center justify-center rounded-full" style={{ width: nodeR * 2, height: nodeR * 2, background: C.surface, boxShadow: "0 2px 8px -3px rgba(14,42,82,0.25)" }}>
              <svg width={nodeR * 2} height={nodeR * 2} style={{ transform: "rotate(-90deg)" }}>
                <circle cx={nodeR} cy={nodeR} r={nodeR - ringStroke} stroke={C.line} strokeWidth={ringStroke} fill="none" />
                <circle cx={nodeR} cy={nodeR} r={nodeR - ringStroke} stroke={C.teal} strokeWidth={ringStroke} fill="none" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
              </svg>
              <div className="absolute flex flex-col items-center">
                <Icon size={nodeR * 0.46} style={{ color: C.ink }} />
                <span className="mt-0.5 font-black" style={{ color: C.ink, fontSize: nodeR * 0.34, fontFamily: FONT_DISPLAY }}>{fa(d.value)}</span>
              </div>
            </div>
            <span className="mt-2 whitespace-nowrap font-semibold" style={{ color: C.textMuted, fontSize: Math.max(11, nodeR * 0.3) }}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function TrendChart({ data, tone, height = 108 }) {
  return (
    <div style={{ height, width: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity={0.2} />
              <stop offset="100%" stopColor={tone} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin - 30", "dataMax + 30"]} />
          <Tooltip
            cursor={false}
            contentStyle={{ direction: "rtl", borderRadius: 2, border: `1px solid ${C.line}`, fontSize: 12, fontFamily: FONT_BODY }}
            formatter={(v) => [fa(v), "امتیاز"]}
          />
          <Area type="monotone" dataKey="value" stroke={tone} strokeWidth={2} fill="url(#trendFill)" dot={{ r: 2.5, fill: tone, strokeWidth: 0 }} activeDot={{ r: 4.5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DecisionSimulator({ recommendedLimit }) {
  const min = 50_000_000;
  const max = 150_000_000;
  const [amount, setAmount] = useState(Math.min(max, Math.max(min, recommendedLimit || 80_000_000)));
  const result = useMemo(() => simulateDecision(recommendedLimit, amount), [recommendedLimit, amount]);
  const pct = ((amount - min) / (max - min)) * 100;
  const t = toneColor[result.tone];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: C.textMuted }}>مبلغ اعتبار (شبیه‌سازی)</span>
        <span className="text-base font-bold" style={{ color: C.ink }}><span style={{ fontFamily: FONT_MONO }}>{compactM(amount)}</span> تومان</span>
      </div>
      <input
        type="range" min={min} max={max} step={5_000_000} value={amount}
        onChange={(e) => setAmount(Number(e.target.value))}
        className="w-full"
        style={{ height: 4, borderRadius: 2, background: `linear-gradient(to left, ${C.teal} ${pct}%, ${C.line} ${pct}%)`, accentColor: C.teal }}
      />
      <div className="mt-1 flex justify-between text-xs" style={{ color: C.textFaint, fontFamily: FONT_MONO }}>
        <span>{compactM(min)}</span>
        <span>{compactM(max)}</span>
      </div>
      <div className="mt-4 flex items-center justify-between rounded-sm px-4 py-3" style={{ background: t.bg, borderInlineStart: `3px solid ${t.fg}` }}>
        <span className="text-sm" style={{ color: C.text }}>نتیجه با این مبلغ</span>
        <span className="text-sm font-bold" style={{ color: t.fg }}>{result.label}</span>
      </div>
    </div>
  );
}

function Sheet({ open, onClose, title, children }) {
  return (
    <div className={cn("fixed inset-0 z-50 transition-opacity", open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0")}>
      <div className="absolute inset-0" style={{ background: "rgba(11,18,32,0.35)" }} onClick={onClose} />
      <div
        className={cn("absolute inset-y-0 right-0 w-full max-w-md transition-transform duration-300 ease-out", open ? "translate-x-0" : "translate-x-full")}
        style={{ background: C.surface, boxShadow: "-8px 0 30px rgba(11,18,32,0.18)" }}
      >
        <div style={{ borderBottom: `1px solid ${C.line}` }} className="flex items-center justify-between px-6 py-4">
          <h2 className="text-base font-bold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{title}</h2>
          <button onClick={onClose} className="rounded-sm p-1.5" style={{ color: C.textMuted }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ borderTop: `2px solid ${C.teal}` }} />
        <div className="h-full overflow-y-auto px-6 py-5" style={{ paddingBottom: 80 }}>{children}</div>
      </div>
    </div>
  );
}

/* -------------------------------- shell ----------------------------------- */

const NAV = [
  { key: "dashboard", label: "داشبورد", icon: Home },
  { key: "newcheck", label: "استعلام جدید", icon: PlusCircle },
  { key: "credits", label: "اعتبارها و تعهدات", icon: Landmark },
  { key: "history", label: "تاریخچه استعلام‌ها", icon: History },
  { key: "api", label: "اتصال API", icon: KeyRound },
  { key: "support", label: "پشتیبانی", icon: Headphones },
  { key: "faq", label: "سؤالات متداول", icon: HelpCircle },
  { key: "account", label: "حساب من", icon: ShieldCheck },
];

function Shell({ title, subtitle, screen, setScreen, auth, onLogout, children }) {
  const ent = auth?.entity || {};
  const status = ent.status;
  const notApproved = auth?.role === "business" && status && status !== "approved";
  const STATUS_TXT = { pending_docs: "در انتظار تأیید مدارک", pending_contract: "در انتظار امضای قرارداد", suspended: "تعلیق‌شده", rejected: "ردشده" };
  return (
    <div className="bx-app" style={{ direction: "rtl" }}>
      <header className="bx-header">
        <a className="bx-brand" href="#/dashboard" onClick={(e) => { e.preventDefault(); setScreen("dashboard"); }} aria-label="سابقه‌نو"><img src="/brand-lockup-horizontal.png" alt="سابقه‌نو" /></a>
        <span className="bx-header-sep" />
        <div className="bx-header-title"><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
        <div className="bx-header-actions">
          <NotificationBell />
          <button className="bx-user" onClick={onLogout} title="خروج از حساب">
            <BizLogo name={ent.name || auth?.mobile} src={ent.logoUrl} size={38} radius={12} />
            <span><b>{cleanName(ent.name || "کسب‌وکار")}</b><small>خروج</small></span>
          </button>
        </div>
      </header>
      <nav className="bx-nav" aria-label="منوی اصلی">
        {NAV.map((it) => (
          <button key={it.key} className={screen === it.key ? "active" : ""} onClick={() => setScreen(it.key)} aria-current={screen === it.key ? "page" : undefined}>
            <it.icon size={18} /><span>{it.label}</span>
          </button>
        ))}
      </nav>
      <main className="bx-main app-main">
        {status === "approved" && <ContractBanner />}
        {notApproved && !NEEDS_APPROVAL.has(screen) && <AccountChip status={status} setScreen={setScreen} />}
        {notApproved && NEEDS_APPROVAL.has(screen)
          ? <LockedScreen status={status} reason={ent.rejectionReason} setScreen={setScreen} />
          : children}
      </main>
    </div>
  );
}

/* -------------------------------- screens --------------------------------- */

function BusinessIdentity({ auth }) {
  const businessName = auth?.entity?.name || "کسب‌وکار شما";
  return (
    <Card className="mb-6 p-5 business-identity-card">
      <div className="flex flex-wrap items-center gap-4">
        <div className="business-logo-frame"><img src="/sabegheno-wordmark-transparent.png" alt="برند سابقه‌نو" /></div>
        <div className="flex-1 min-w-[220px]">
          <div className="eyebrow-inline">برند و حساب کسب‌وکار</div>
          <h3 className="text-xl font-extrabold" style={{ color: C.ink }}>{businessName}</h3>
          <p className="mt-1 text-sm" style={{ color: C.textMuted }}>حساب فعال در سامانهٔ تصمیم‌گیری اعتباری سابقه‌نو</p>
        </div>
        <div className="business-status"><CheckCircle2 size={17} /> فعال و آمادهٔ استعلام</div>
      </div>
    </Card>
  );
}

function DecisionDistribution({ approved, review, declined }) {
  const data = [
    { name: "تأییدشده", value: approved, color: C.good },
    { name: "نیازمند بررسی", value: review, color: C.warn },
    { name: "ردشده", value: declined, color: C.bad },
  ];
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return (
    <Card className="p-6 dashboard-decision-card">
      <div className="mb-3 flex items-center justify-between">
        <div><SectionEyebrow>نمای کلی تصمیم‌ها</SectionEyebrow><h3 className="text-lg font-extrabold" style={{ color: C.ink }}>توزیع کلی استعلام‌ها</h3></div>
        <PieChart size={20} style={{ color: C.teal }} />
      </div>
      <div className="decision-chart-layout">
        <div className="decision-donut">
          {total ? <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data} dataKey="value" innerRadius={58} outerRadius={86} paddingAngle={3} stroke="none">{data.map((item) => <Cell key={item.name} fill={item.color} />)}</Pie><Tooltip formatter={(value, name) => [fa(value), name]} /></PieChart></ResponsiveContainer> : <div className="decision-empty">هنوز داده‌ای ثبت نشده</div>}
          <div className="decision-total"><strong>{fa(total)}</strong><span>کل استعلام</span></div>
        </div>
        <div className="decision-legend">{data.map((item) => <div key={item.name} className="decision-legend-row"><span><i style={{ background: item.color }} />{item.name}</span><b>{fa(item.value)}</b></div>)}</div>
      </div>
    </Card>
  );
}

function WhyDecisionContent({ customer }) {
  const meta = decisionMeta[customer.decision] || decisionMeta.review;
  const t = toneColor[meta.tone];
  return (
    <div className="space-y-6">
      <div className="p-4" style={{ background: t.bg, borderInlineStart: `3px solid ${t.fg}` }}>
        <VerdictTag status={customer.decision} size="lg" />
        <p className="mt-3 text-sm leading-6" style={{ color: C.text }}>
          {customer.decision === "approve" && `سقف پیشنهادی ${tomanShort(customer.recommendedLimit)} برای مدت حداکثر ${fa(customer.recommendedTermMonths)} ماه است.`}
          {customer.decision === "review" && "این مشتری نیاز به بررسی دستی دارد؛ مبلغ درخواستی بیش از سقف قابل تأیید خودکار است."}
          {customer.decision === "decline" && "با توجه به ریسک شناسایی‌شده، اعطای اعتبار در این مبلغ توصیه نمی‌شود."}
        </p>
      </div>
      {customer.overrideNote && (
        <div className="flex items-start gap-2 p-4" style={{ background: C.badSoft, borderInlineStart: `3px solid ${C.bad}` }}>
          <AlertTriangle size={17} className="mt-0.5 shrink-0" style={{ color: C.bad }} />
          <p className="text-sm leading-6" style={{ color: C.text }}>{customer.overrideNote}</p>
        </div>
      )}
      <div>
        <h4 className="mb-3 text-xs font-bold" style={{ color: C.textMuted, letterSpacing: "0.05em" }}>عوامل مثبت</h4>
        <ul className="space-y-2.5">
          {customer.positives.map((p) => (
            <li key={p} className="flex items-start gap-2 text-sm" style={{ color: C.text }}>
              <CheckCircle2 size={16} className="mt-0.5 shrink-0" style={{ color: C.good }} /><span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
      {customer.negatives.length > 0 && (
        <div>
          <h4 className="mb-3 text-xs font-bold" style={{ color: C.textMuted, letterSpacing: "0.05em" }}>عوامل منفی</h4>
          <ul className="space-y-2.5">
            {customer.negatives.map((n) => (
              <li key={n} className="flex items-start gap-2 text-sm" style={{ color: C.text }}>
                <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: C.bad }} /><span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function LoansContent({ customer }) {
  const t2 = { "تسویه شد": "good", "settled": "good", "فعال": "warn", "active": "warn", "معوق": "bad", "overdue": "bad" };
  const arrearsLabels = { current: "جاری", past_due: "سررسید گذشته", arrears: "معوق", doubtful: "مشکوک‌الوصول" };
  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-3">
        {[
          { label: "تسهیلات فعال", value: fa(customer.loans.active) },
          { label: "مجموع تعهدات", value: tomanShort(customer.loans.totalCommitment) },
          { label: "تسویه‌شده", value: fa(customer.loans.settled) },
          { label: "معوق", value: fa(customer.loans.overdue) },
        ].map((s) => (
          <div key={s.label} className="p-3" style={{ border: `1px solid ${C.line}` }}>
            <div className="text-xs" style={{ color: C.textMuted }}>{s.label}</div>
            <div className="mt-1 text-base font-bold" style={{ color: C.ink }}>{s.value}</div>
          </div>
        ))}
      </div>
      {customer.loans.arrearsLevel && <div className="mb-5 rounded-xl p-4" style={{ background: C.warnSoft, borderInlineStart: `3px solid ${C.warn}` }}><div className="text-sm font-bold" style={{ color: C.ink }}>سطح معوقات</div><div className="mt-1 text-base font-black" style={{ color: C.warn }}>{arrearsLabels[customer.loans.arrearsLevel] || customer.loans.arrearsLevel}</div><div className="mt-1 text-xs" style={{ color: C.textMuted }}>بر اساس تعداد اقساط سررسیدشدهٔ دریافت‌شده از منبع داده</div></div>}
      {customer.loans.records.length === 0 ? (
        <div className="text-sm" style={{ color: C.textMuted }}>رکورد تسهیلاتی برای نمایش وجود ندارد.</div>
      ) : (
        <div className="space-y-4">
          {customer.loans.records.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-12 shrink-0 text-xs font-semibold" style={{ color: C.textMuted }}>{r.year}</div>
              <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.ink }} />
              <div className="flex-1 text-sm" style={{ color: C.text }}>تسهیلات {tomanShort(r.amount)}</div>
              <Tag tone={t2[r.status] || "neutral"}>{r.status}</Tag>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ChecksContent({ customer }) {
  const clean = customer.checks.activeBounced === 0;
  return (
    <div>
      <div className="mb-5 flex items-center gap-3 p-4" style={{ background: C.paper, border: `1px solid ${C.line}` }}>
        {clean ? <CheckCircle2 size={22} style={{ color: C.good }} /> : <XCircle size={22} style={{ color: C.bad }} />}
        <div>
          <div className="text-sm font-bold" style={{ color: C.ink }}>
            {clean ? "بدون چک برگشتی فعال" : `${fa(customer.checks.activeBounced)} چک برگشتی فعال شناسایی شد`}
          </div>
          <div className="text-xs" style={{ color: C.textMuted }}>در داده‌های قابل دسترس، وضعیت فوق شناسایی شده است.</div>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: "برگشتی فعال", value: customer.checks.activeBounced },
          { label: "رفع سوءاثر شده", value: customer.checks.resolved },
          { label: "صادرشده", value: customer.checks.issued },
        ].map((s) => (
          <div key={s.label} className="p-3" style={{ border: `1px solid ${C.line}` }}>
            <div className="text-xs" style={{ color: C.textMuted }}>{s.label}</div>
            <div className="mt-1 text-base font-bold" style={{ color: C.ink }}>{fa(s.value)}</div>
          </div>
        ))}
      </div>
      {customer.checks.records.length > 0 && (
        <div className="space-y-4">
          {customer.checks.records.map((r, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-20 shrink-0 text-xs" dir="ltr" style={{ color: C.textMuted }}>{r.date}</div>
              <div className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.resolved ? C.good : C.bad }} />
              <div className="flex-1 text-sm" style={{ color: C.text }}>{tomanShort(r.amount)}</div>
              <span className="text-xs font-bold" style={{ color: r.resolved ? C.good : C.bad }}>
                {r.resolved ? "رفع سوءاثر شد" : "رفع سوءاثر نشد"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const sourceRouteMap = { loans: "loans", checks: "checks" };
const sheetTitles = { loans: "تسهیلات", checks: "وضعیت چک", why: "چرا این تصمیم؟", exposure: "همپوشانی درخواست" };

function ExposureBanner({ exposure, onOpen }) {
  if (!exposure.flagged) {
    return (
      <Card className="mb-6 flex items-center gap-3 p-4" accent={C.good}>
        <Users size={20} style={{ color: C.good }} />
        <div className="flex-1">
          <div className="text-sm font-bold" style={{ color: C.ink }}>بدون همپوشانی درخواست</div>
          <div className="text-xs" style={{ color: C.textMuted }}>
            در {fa(exposure.windowHours)} ساعت گذشته، استعلام یا تعهد فعالی از سایر منابع داده برای این مشتری شناسایی نشد.
          </div>
        </div>
      </Card>
    );
  }
  return (
    <Card className="mb-6 p-4" accent={C.bad} style={{ background: C.badSoft }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" style={{ color: C.bad }} />
          <div>
            <div className="text-sm font-bold" style={{ color: C.ink }}>هشدار همپوشانی درخواست</div>
            <div className="mt-0.5 text-xs leading-6" style={{ color: C.text }}>
              در {fa(exposure.windowHours)} ساعت گذشته، {fa(exposure.providersCount)} منبع داده دیگر برای همین مشتری
              استعلام یا تعهد فعال ثبت کرده‌اند — مجموع درخواستی سایرین: {tomanShort(exposure.totalOtherRequested)}
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onOpen}>مشاهده جزئیات</Button>
      </div>
    </Card>
  );
}

function ExposureContent({ customer }) {
  const ex = customer.exposure;
  return (
    <div>
      <div className="mb-5 p-4" style={{ background: C.badSoft, borderInlineStart: `3px solid ${C.bad}` }}>
        <div className="text-sm font-bold" style={{ color: C.ink }}>
          {fa(ex.providersCount)} منبع داده دیگر در {fa(ex.windowHours)} ساعت گذشته
        </div>
        <p className="mt-2 text-sm leading-6" style={{ color: C.text }}>
          مجموع مبلغ درخواستی/تعهد ثبت‌شده نزد سایر منابع داده: <b>{tomanShort(ex.totalOtherRequested)}</b>.
          این مبلغ در محاسبه سقف پیشنهادی نهایی لحاظ شده است.
        </p>
      </div>
      {ex.inquiries.length === 0 ? (
        <div className="text-sm" style={{ color: C.textMuted }}>رویداد جزئی برای نمایش وجود ندارد.</div>
      ) : (
        <div className="space-y-3">
          {ex.inquiries.map((q, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2.5" style={{ border: `1px solid ${C.line}` }}>
              <div>
                <div className="text-sm font-medium" style={{ color: C.ink }} dir="ltr">{q.provider}</div>
                <div className="text-xs" style={{ color: C.textMuted }}>{q.type} · {fa(q.hoursAgo)} ساعت پیش</div>
              </div>
              <div className="text-sm font-bold" style={{ color: C.bad }}>{tomanShort(q.amount)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OfficialReportSection({ title, children }) {
  return <section className="mb-5 overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.line}`, borderRadius: 12 }}><div className="px-4 py-2.5 text-center text-sm font-extrabold" style={{ background: "#B9DDF5", color: C.ink }}>{title}</div>{children}</section>;
}

function OfficialReportHeader({ customer }) {
  const decisionText = customer.decision === "approve" ? "تأییدشده" : customer.decision === "review" ? "نیازمند بررسی" : "ردشده";
  return <>
    <div className="mb-5 rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.line}`, boxShadow: "0 10px 26px rgba(11,31,58,.06)" }}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="text-xs font-bold" style={{ color: C.textMuted }}>سابقه‌نو | سامانه تصمیم هوشمند اعتبار</div><h2 className="mt-2 text-xl font-black" style={{ color: C.ink }}>گزارش اعتباری شخص حقیقی</h2><div className="mt-1 text-xs" style={{ color: C.textMuted }}>شناسه گزارش: <span dir="ltr" style={{ fontFamily: FONT_MONO }}>{customer.id || "—"}</span></div></div>
        <div className="rounded-full px-4 py-2 text-sm font-extrabold" style={{ background: C.goodSoft, color: C.good }}>● گزارش تولید شد</div>
      </div>
    </div>
    <OfficialReportSection title="اطلاعات هویتی شخص">
      <div className="grid grid-cols-1 gap-px bg-slate-200 md:grid-cols-2">
        <div className="bg-white p-4"><div className="mb-1 text-xs" style={{ color: C.textMuted }}>نام و نام خانوادگی</div><div className="font-bold" style={{ color: C.ink }}>{customer.name || "اطلاعات دریافت نشده"}</div></div>
        <div className="bg-white p-4"><div className="mb-1 text-xs" style={{ color: C.textMuted }}>شناسه ملی محافظت‌شده</div><div className="font-bold" dir="ltr" style={{ color: C.ink, fontFamily: FONT_MONO }}>{customer.nationalIdMasked || "—"}</div></div>
        <div className="bg-white p-4"><div className="mb-1 text-xs" style={{ color: C.textMuted }}>آخرین بروزرسانی</div><div className="font-bold" style={{ color: C.ink }}>{customer.lastUpdate || "—"}</div></div>
        <div className="bg-white p-4"><div className="mb-1 text-xs" style={{ color: C.textMuted }}>وضعیت تصمیم سابقه‌نو</div><div className="font-bold" style={{ color: customer.decision === "approve" ? C.good : customer.decision === "review" ? C.warn : C.bad }}>{decisionText}</div></div>
      </div>
    </OfficialReportSection>
    <OfficialReportSection title="استعلام امتیاز اعتباری">
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_1.4fr_1fr] md:items-center">
        <div className="text-center"><div className="text-xs" style={{ color: C.textMuted }}>امتیاز اعتباری سابقه‌نو</div><div className="mt-1 text-4xl font-black" style={{ color: C.ink }}>{fa(customer.score)}</div></div>
        <div><div className="mb-2 flex justify-between text-xs" style={{ color: C.textMuted }}><span>ریسک بیشتر</span><span>ریسک کمتر</span></div><div className="h-4 overflow-hidden rounded-full" style={{ background: "linear-gradient(90deg,#F4A6A6 0%,#F4D48A 35%,#BCE8CA 68%,#4CC59C 100%)" }}><div className="h-full rounded-full border-2 border-white" style={{ width: `${Math.max(5, Math.min(100, ((customer.score - 300) / 600) * 100))}%`, background: C.ink }} /></div><div className="mt-2 text-center text-xs font-bold" style={{ color: C.textMuted }}>سطح تحلیل: {decisionText}</div></div>
        <div className="rounded-xl p-3 text-center" style={{ background: customer.decision === "approve" ? C.goodSoft : customer.decision === "review" ? C.warnSoft : C.badSoft }}><div className="text-xs" style={{ color: C.textMuted }}>پیشنهاد تصمیم</div><div className="mt-1 font-black" style={{ color: customer.decision === "approve" ? C.good : customer.decision === "review" ? C.warn : C.bad }}>{decisionText}</div></div>
      </div>
    </OfficialReportSection>
  </>;
}

function OfficialFactorTable({ customer }) {
  const rows = [
    ["رفتار پرداخت", `${fa(customer.indicators.payment)} از ۱۰۰`, customer.positives?.[0] || "اطلاعات کافی برای توضیح تکمیلی موجود نیست"],
    ["تسهیلات و تعهدات", `${fa(customer.indicators.loans)} از ۱۰۰`, customer.negatives?.[0] || "وضعیت تعهدات در محدوده قابل قبول"],
    ["چک و سوابق برگشتی", `${fa(customer.indicators.checks)} از ۱۰۰`, customer.negatives?.find((x) => x.includes("چک")) || "سابقه چک در محاسبه لحاظ شده است"],
    ["همپوشانی درخواست", `${fa(customer.indicators.commitments)} از ۱۰۰`, customer.exposure?.flagged ? "همپوشانی فعال شناسایی شد" : "همپوشانی فعال شناسایی نشد"],
  ];
  return <OfficialReportSection title="مهم‌ترین شاخص‌های مؤثر بر امتیاز اعتباری"><div className="overflow-x-auto"><table className="w-full text-right"><thead><tr style={{ background: "#F1F6F9" }}><th className="p-3 text-xs font-extrabold" style={{ color: C.ink }}>شاخص</th><th className="p-3 text-xs font-extrabold" style={{ color: C.ink }}>امتیاز شاخص</th><th className="p-3 text-xs font-extrabold" style={{ color: C.ink }}>توضیحات</th></tr></thead><tbody>{rows.map(([name, value, note], i) => <tr key={name} style={{ background: i % 2 ? "#FAFCFD" : "#fff", borderTop: `1px solid ${C.line}` }}><td className="p-3 text-sm font-bold" style={{ color: C.ink }}>{name}</td><td className="p-3 text-sm font-bold" style={{ color: C.tealDeep }}>{value}</td><td className="p-3 text-sm" style={{ color: C.text }}>{note}</td></tr>)}</tbody></table></div></OfficialReportSection>;
}

function CreditMapView({ customer }) {
  const [sheet, setSheet] = useState(null);
  const trendTone = customer.decision === "approve" ? C.good : customer.decision === "review" ? C.warn : C.bad;
  const stability = Math.round((customer.indicators.payment + customer.indicators.checks) / 2);

  return (
    <>
      <OfficialReportHeader customer={customer} />
      <OfficialFactorTable customer={customer} />
      {!customer.hasFullDetail && (
        <div className="mb-5 p-3 text-sm leading-6" style={{ background: C.warnSoft, borderInlineStart: `3px solid ${C.warn}`, color: C.text }}>
          جزئیات کامل منابع (تسهیلات، چک، همپوشانی) فقط بلافاصله پس از انجام استعلام در دسترس است. این نتیجه از تاریخچه بارگذاری شده و فقط خلاصه امتیاز/تصمیم را نشان می‌دهد.
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 px-6 py-4" style={{ background: C.surface, border: `1px solid ${C.line}`, borderTop: `3px solid ${C.teal}` }}>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold" style={{ color: C.ink, fontFamily: FONT_DISPLAY }}>{customer.name}</h2>
            <span className="text-xs" dir="ltr" style={{ color: C.textFaint, fontFamily: FONT_MONO }}>{customer.nationalIdMasked}</span>
          </div>
          <p className="mt-0.5 text-xs" style={{ color: C.textMuted }}>آخرین بروزرسانی: {customer.lastUpdate}</p>
        </div>
        <div className="text-left">
          <div className="text-xs" style={{ color: C.textMuted }}>مبلغ درخواست</div>
          <div className="text-lg font-bold" style={{ color: C.ink }}>{tomanShort(customer.requestedAmount)}</div>
        </div>
      </div>

      <ExposureBanner exposure={customer.exposure} onOpen={() => setSheet("exposure")} />

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-8 lg:col-span-2" accent={C.teal}>
          <div className="flex flex-wrap items-center justify-center gap-8">
            <div className="flex flex-col gap-8">
              <MiniRing icon={CreditCard} label="رفتار پرداخت" value={customer.indicators.payment} />
              <MiniRing icon={FileCheck2} label="چک" value={customer.indicators.checks} />
            </div>
            <VerdictSeal score={customer.score} status={customer.decision} />
            <div className="flex flex-col gap-8">
              <MiniRing icon={Layers} label="تعهدات" value={customer.indicators.commitments} />
              <MiniRing icon={Banknote} label="تسهیلات" value={customer.indicators.loans} />
            </div>
          </div>
          <div className="mt-3 text-center text-xs" style={{ color: C.textMuted }}>
            میزان اطمینان تحلیل: <span className="font-bold" style={{ color: C.ink }}>{fa(customer.confidence)}٪</span>
          </div>
        </Card>

        <Card className="flex flex-col justify-between p-6">
          <div>
            <SectionEyebrow>پیشنهاد سابقه‌نو</SectionEyebrow>
            <VerdictTag status={customer.decision} size="lg" />
            {customer.overrideNote && (
              <div className="mt-3 flex items-start gap-1.5 text-xs leading-5" style={{ color: C.bad }}>
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>{customer.overrideNote}</span>
              </div>
            )}
            <div className="mt-5 space-y-3">
              <div>
                <div className="text-xs" style={{ color: C.textMuted }}>سقف پیشنهادی</div>
                <div className="text-lg font-bold" style={{ color: C.ink }}>{customer.recommendedLimit > 0 ? tomanShort(customer.recommendedLimit) : "—"}</div>
              </div>
              <div>
                <div className="text-xs" style={{ color: C.textMuted }}>مدت پیشنهادی</div>
                <div className="text-lg font-bold" style={{ color: C.ink }}>{customer.recommendedTermMonths > 0 ? `حداکثر ${fa(customer.recommendedTermMonths)} ماه` : "—"}</div>
              </div>
            </div>
          </div>
          <Button variant="outline" className="mt-5 w-full" onClick={() => setSheet("why")}>مشاهده دلایل تصمیم</Button>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-bold" style={{ color: C.ink }}>روند اعتبار</h3>
          </div>
          <TrendChart data={customer.trend} tone={trendTone} />
        </Card>

        <Card className="p-5">
          <h3 className="mb-3 text-sm font-bold" style={{ color: C.ink }}>منابع بررسی‌شده</h3>
          <div className="space-y-2.5">
            {customer.sources.map((s) => (
              <button key={s.key} onClick={() => sourceRouteMap[s.key] && setSheet(sourceRouteMap[s.key])}
                className="flex w-full items-center justify-between px-3 py-2 text-right transition-colors"
                style={{ border: `1px solid ${C.line}` }}>
                <span className="text-sm font-medium" style={{ color: C.text }}>{s.label}</span>
                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: s.ok ? C.good : C.warn }}>
                  {s.ok ? "بررسی شد" : s.note}
                  {sourceRouteMap[s.key] && <ArrowUpRight size={12} />}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-6">
          <h3 className="mb-2 text-center text-sm font-bold" style={{ color: C.ink }}>چرخه سلامت اعتباری</h3>
          <HealthWheel indicators={customer.indicators} stability={stability} overall={customer.overallHealth} size={250} />
        </Card>

        <Card className="p-6">
          <h3 className="mb-3 text-sm font-bold" style={{ color: C.ink }}>سلامت اعتباری</h3>
          <div className="mb-2 flex items-end justify-between">
            <span className="text-2xl font-bold" style={{ color: C.ink }}>{fa(customer.overallHealth)}</span>
            <span className="text-xs" style={{ color: C.textFaint }}>از ۱۰۰</span>
          </div>
          <Progress value={customer.overallHealth} tone={customer.decision === "approve" ? "good" : customer.decision === "review" ? "warn" : "bad"} />
          <div className="mt-2 text-sm font-bold" style={{ color: C.ink }}>{customer.healthLabel}</div>
          <p className="mt-2 text-xs leading-6" style={{ color: C.textMuted }}>{customer.healthSummary}</p>
        </Card>

        <Card className="p-6">
          <h3 className="mb-3 text-sm font-bold" style={{ color: C.ink }}>عوامل ریسک</h3>
          <div className="space-y-3">
            {customer.positives.slice(0, 2).map((p) => (
              <div key={p} className="flex items-center gap-2 text-sm" style={{ color: C.text }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.good }} /> {p}</div>
            ))}
            {customer.negatives.slice(0, 2).map((n) => (
              <div key={n} className="flex items-center gap-2 text-sm" style={{ color: C.text }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: C.bad }} /> {n}</div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-2 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h3 className="mb-1 text-sm font-bold" style={{ color: C.ink }}>اگر اعتبار را تغییر دهیم؟</h3>
          <p className="mb-4 text-xs" style={{ color: C.textMuted }}>مبلغ را جابه‌جا کنید تا تصمیم به‌صورت زنده به‌روزرسانی شود.</p>
          <DecisionSimulator recommendedLimit={customer.recommendedLimit} />
        </Card>

        <Card className="p-6" style={{ background: C.ink, border: `1px solid ${C.ink}` }}>
          <h3 className="mb-3 text-xs font-bold" style={{ color: "#8A93A6", letterSpacing: "0.05em" }}>تصمیم پیشنهادی سابقه‌نو</h3>
          <div className="mb-4"><VerdictTag status={customer.decision} /></div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span style={{ color: "#8A93A6" }}>سقف پیشنهادی</span><span className="font-semibold" style={{ color: "#fff" }}>{customer.recommendedLimit > 0 ? tomanShort(customer.recommendedLimit) : "—"}</span></div>
            <div className="flex justify-between"><span style={{ color: "#8A93A6" }}>دوره پیشنهادی</span><span className="font-semibold" style={{ color: "#fff" }}>{customer.recommendedTermMonths > 0 ? `${fa(customer.recommendedTermMonths)} ماه` : "—"}</span></div>
          </div>
          <Button variant="teal" className="mt-5 w-full" onClick={() => setSheet("why")}>مشاهده گزارش کامل</Button>
        </Card>
      </div>

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={sheet ? sheetTitles[sheet] : ""}>
        {sheet === "why" && <WhyDecisionContent customer={customer} />}
        {sheet === "loans" && <LoansContent customer={customer} />}
        {sheet === "checks" && <ChecksContent customer={customer} />}
        {sheet === "exposure" && <ExposureContent customer={customer} />}
      </Sheet>
    </>
  );
}

function CreditMapScreen({ activeCheck }) {
  if (!activeCheck) {
    return <div className="py-10 text-center text-sm" style={{ color: C.textMuted }}>هیچ استعلامی انتخاب نشده است.</div>;
  }
  if (activeCheck.loading) return <Spinner label="در حال بارگذاری استعلام..." />;
  if (activeCheck.error) return <ErrorBanner>{activeCheck.error}</ErrorBanner>;
  return <CreditMapView customer={activeCheck.view} />;
}

function RuleRow({ label, comparator, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ border: `1px solid ${C.line}` }}>
      <span className="w-36 shrink-0 text-sm font-medium" style={{ color: C.text }}>{label}</span>
      <span className="shrink-0 text-xs" style={{ color: C.textMuted }}>{comparator}</span>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} dir="ltr"
        className="w-24 px-2 py-1.5 text-left text-sm outline-none" style={{ border: `1px solid ${C.line}`, fontFamily: FONT_MONO }} />
    </div>
  );
}

function PolicyScreen() {
  const [minScore, setMinScore] = useState(700);
  const [maxActiveBounced, setMaxActiveBounced] = useState(0);
  const [maxDelayDays, setMaxDelayDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.getPolicy()
      .then((rule) => {
        if (cancelled) return;
        setMinScore(rule.minScore);
        setMaxActiveBounced(rule.maxActiveBounced);
        setMaxDelayDays(rule.maxDelayDays);
      })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await api.updatePolicy({ minScore, maxActiveBounced, maxDelayDays });
      setSaved(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner />;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <h3 className="mb-5 text-sm font-bold" style={{ color: C.ink }}>سازنده قوانین</h3>
        <ErrorBanner>{error}</ErrorBanner>
        <div className="space-y-3">
          <RuleRow label="امتیاز" comparator="بیشتر از" value={minScore} onChange={setMinScore} />
          <div className="pr-2 text-xs font-semibold" style={{ color: C.textFaint }}>و</div>
          <RuleRow label="چک برگشتی فعال" comparator="کمتر یا مساوی" value={maxActiveBounced} onChange={setMaxActiveBounced} />
          <div className="pr-2 text-xs font-semibold" style={{ color: C.textFaint }}>و</div>
          <RuleRow label="بیشترین تأخیر (روز)" comparator="کمتر از" value={maxDelayDays} onChange={setMaxDelayDays} />
        </div>
        <div className="mt-6 flex items-center gap-3 p-4" style={{ background: C.goodSoft, borderInlineStart: `3px solid ${C.good}` }}>
          <span className="text-sm" style={{ color: C.text }}>تصمیم:</span>
          <span className="text-sm font-bold" style={{ color: C.good }}>تأیید خودکار اگر امتیاز بالاتر از {fa(minScore)}، چک برگشتی حداکثر {fa(maxActiveBounced)} و تأخیر کمتر از {fa(maxDelayDays)} روز باشد.</span>
        </div>
        <Button variant="teal" size="lg" className="mt-5 w-full" disabled={saving} onClick={save}>
          {saving ? "در حال ذخیره..." : "ذخیره تغییرات"}
        </Button>
        {saved && <div className="mt-3 text-center text-sm font-medium" style={{ color: C.good }}>ذخیره شد.</div>}
      </Card>
      <Card className="p-6">
        <h3 className="mb-4 text-sm font-bold" style={{ color: C.ink }}>درباره این قانون</h3>
        <p className="text-sm leading-7" style={{ color: C.textMuted }}>
          این قانون در حال حاضر فقط ذخیره می‌شود و به‌عنوان مرجع تصمیم کسب‌وکار شما در بک‌اند نگه‌داری می‌گردد.
          اعمال خودکار آن روی هر استعلام جدید در سرویس امتیازدهی (<code dir="ltr">scoring.service.js</code>) پیاده‌سازی خواهد شد.
        </p>
      </Card>
    </div>
  );
}

function ProviderDetail({ provider, businesses, onLinked }) {
  const isRealtime = provider.integration === "realtime";
  const [businessId, setBusinessId] = useState(provider.businessId || "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // A business can only be linked to one منبع داده, so only offer ones that
  // are either unlinked or already linked to THIS provider.
  const selectable = (businesses || []).filter(
    (b) => !b.providerLink || b.providerLink.id === provider.id
  );

  async function save() {
    setSaving(true);
    setSaveError("");
    try {
      await api.adminUpdateProvider(provider.id, { businessId: businessId || null });
      onLinked && onLinked();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <Tag tone={provider.statusRaw === "connected" ? "good" : "warn"}>{provider.status}</Tag>
        <Tag tone={isRealtime ? "teal" : "warn"}>{isRealtime ? "لحظه‌ای" : "فقط دسته‌ای"}</Tag>
      </div>
      {!isRealtime && (
        <div className="mb-5 p-4 text-sm leading-6" style={{ background: C.warnSoft, borderInlineStart: `3px solid ${C.warn}`, color: C.text }}>
          این منبع داده هنوز رویداد لحظه‌ای استعلام ارسال نمی‌کند، بنابراین درخواست‌های این منبع در تشخیص «همپوشانی درخواست» بین منابع داده دیده نمی‌شوند.
        </div>
      )}

      <div className="mb-5 p-4" style={{ border: `1px solid ${C.line}` }}>
        <h4 className="mb-2 text-xs font-bold" style={{ color: C.textMuted, letterSpacing: "0.05em" }}>کسب‌وکار متصل</h4>
        {businesses ? (
          <>
            <p className="mb-3 text-xs leading-5" style={{ color: C.textMuted }}>
              اگه این منبع داده خودش یک کسب‌وکار ثبت‌شده در سابقه‌نو هم هست (مثلاً یک شرکت BNPL)، حسابش رو اینجا وصل کنید تا بتونه از صفحه‌ی «ثبت گزارش کسب‌وکار» رویداد بفرسته.
            </p>
            <ErrorBanner>{saveError}</ErrorBanner>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={businessId}
                onChange={(e) => setBusinessId(e.target.value)}
                className="flex-1 px-3 py-2 text-sm outline-none"
                style={{ border: `1px solid ${C.line}`, background: C.paper, minWidth: 180 }}
              >
                <option value="">— هیچ‌کدام —</option>
                {selectable.map((b) => (
                  <option key={b.id} value={b.id}>{b.name} ({b.mobile})</option>
                ))}
              </select>
              <Button size="sm" variant="teal" disabled={saving} onClick={save}>
                {saving ? "در حال ذخیره…" : "ذخیره"}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-sm" style={{ color: C.textMuted }}>{provider.businessId ? "این منبع داده به یک کسب‌وکار متصل است." : "این منبع داده به هیچ کسب‌وکاری متصل نیست."}</div>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        {[
          { label: "کیفیت داده", value: `${provider.quality}%` },
          { label: "میانگین تأخیر", value: `${provider.latency}ms` },
          { label: "نرخ خطا", value: `${provider.errorRate}%` },
          { label: "تعداد رویداد", value: provider.events.length.toLocaleString("en-US") },
        ].map((s) => (
          <div key={s.label} className="p-3" style={{ border: `1px solid ${C.line}` }}>
            <div className="text-xs" style={{ color: C.textMuted }}>{s.label}</div>
            <div className="mt-1 text-base font-bold" style={{ color: C.ink, fontFamily: FONT_MONO }}>{s.value}</div>
          </div>
        ))}
      </div>
      <h4 className="mb-3 text-xs font-bold" style={{ color: C.textMuted, letterSpacing: "0.05em" }}>رویدادهای اخیر</h4>
      {provider.events.length === 0 ? (
        <div className="text-sm" style={{ color: C.textMuted }}>رویدادی ثبت نشده است.</div>
      ) : (
        <div className="space-y-3">
          {provider.events.map((l) => (
            <div key={l.id} className="flex items-start gap-3">
              <div className="w-14 shrink-0 text-xs" style={{ color: C.textFaint }}>{new Date(l.createdAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" })}</div>
              <div>
                <div className="text-sm font-medium" style={{ color: C.ink }}>{EVENT_TYPE_FA[l.eventType] || l.eventType}</div>
                <div className="text-xs" style={{ color: C.textMuted }}>{l.note || (l.amount > 0 ? tomanShort(l.amount) : "")}{l.delayDays > 0 ? ` — تأخیر ${fa(l.delayDays)} روز` : ""}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Read-only provider monitoring for a logged-in BUSINESS (no linking
// controls — those call admin-only endpoints a business token can't use).
function BusinessProvidersScreen() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sheetProvider, setSheetProvider] = useState(null);
  const [sheetLoading, setSheetLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.listProviders()
      .then((data) => { if (!cancelled) setProviders(data.map(buildProviderView)); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  async function openProvider(id) {
    setSheetProvider({ id, loading: true });
    setSheetLoading(true);
    try {
      const full = await api.getProvider(id);
      setSheetProvider(buildProviderView(full));
    } catch (e) {
      setSheetProvider({ id, error: e.message });
    } finally {
      setSheetLoading(false);
    }
  }

  const connectedCount = providers.filter((p) => p.statusRaw === "connected").length;
  const batchOnly = providers.filter((p) => p.integration !== "realtime");
  const avgQuality = providers.length ? Math.round(providers.reduce((s, p) => s + (p.quality || 0), 0) / providers.length) : 0;

  const overviewStats = [
    { label: "منابع داده متصل", value: `${connectedCount}/${providers.length}`, tone: "good" },
    { label: "میانگین کیفیت داده", value: `${avgQuality}%`, tone: "good" },
    { label: "بدون اتصال لحظه‌ای", value: `${batchOnly.length}`, tone: batchOnly.length > 0 ? "warn" : "good" },
  ];

  if (loading) return <Spinner />;

  return (
    <>
      <ErrorBanner>{error}</ErrorBanner>
      <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {overviewStats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="text-xs" style={{ color: C.textMuted }}>{s.label}</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="text-2xl font-bold" style={{ color: C.ink, fontFamily: FONT_MONO }}>{s.value}</span>
              <Tag tone={s.tone}>{s.tone === "warn" ? "بررسی شود" : "سالم"}</Tag>
            </div>
          </Card>
        ))}
      </div>

      {batchOnly.length > 0 && (
        <Card className="mb-6 p-4" style={{ background: C.warnSoft }} accent={C.warn}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0" style={{ color: C.warn }} />
            <div className="text-sm leading-6" style={{ color: C.text }}>
              <b>{fa(batchOnly.length)} منبع داده</b> فقط داده دوره‌ای می‌فرستند و در تشخیص «همپوشانی درخواست» بین
              منابع داده لحاظ نمی‌شوند: {batchOnly.map((p) => p.name).join("، ")}.
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="mb-4 text-sm font-bold" style={{ color: C.ink }}>منابع داده</h3>
        {providers.length === 0 ? (
          <div className="py-6 text-center text-sm" style={{ color: C.textMuted }}>منبع دادهی ثبت نشده است.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.line}`, color: C.textMuted }} className="text-right">
                  <th className="py-2.5 font-medium">منبع داده</th>
                  <th className="py-2.5 font-medium">وضعیت</th>
                  <th className="py-2.5 font-medium">نوع اتصال</th>
                  <th className="py-2.5 font-medium">آخرین همگام‌سازی</th>
                  <th className="py-2.5 font-medium">کیفیت داده</th>
                  <th className="py-2.5 font-medium">تأخیر</th>
                  <th className="py-2.5 font-medium">نرخ خطا</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => (
                  <tr key={p.id} className="cursor-pointer last:border-0" style={{ borderBottom: `1px solid ${C.line}` }} onClick={() => openProvider(p.id)}>
                    <td className="py-3 font-medium" style={{ color: C.ink }}>{p.name}</td>
                    <td className="py-3"><Tag tone={p.statusRaw === "connected" ? "good" : "warn"}>{p.status}</Tag></td>
                    <td className="py-3"><Tag tone={p.integration === "realtime" ? "teal" : "warn"}>{p.integration === "realtime" ? "لحظه‌ای" : "دسته‌ای"}</Tag></td>
                    <td className="py-3" style={{ color: C.textMuted }}>{p.lastSync}</td>
                    <td className="py-3" style={{ color: C.textMuted, fontFamily: FONT_MONO }}>{p.quality}%</td>
                    <td className="py-3" style={{ color: C.textMuted, fontFamily: FONT_MONO }}>{p.latency}ms</td>
                    <td className="py-3" style={{ color: C.textMuted, fontFamily: FONT_MONO }}>{p.errorRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Sheet open={!!sheetProvider} onClose={() => setSheetProvider(null)} title={sheetProvider?.name || ""}>
        {sheetLoading && <Spinner />}
        {sheetProvider?.error && <ErrorBanner>{sheetProvider.error}</ErrorBanner>}
        {sheetProvider && !sheetLoading && !sheetProvider.error && sheetProvider.id && sheetProvider.name && <ProviderDetail provider={sheetProvider} />}
      </Sheet>
    </>
  );
}



function MyReportScreen({ auth, onLogout }) {
  const [state, setState] = useState({ loading: true, error: "", view: null });

  useEffect(() => {
    let cancelled = false;
    api.getMyReport()
      .then((result) => {
        if (cancelled) return;
        const view = buildCustomerView(
          { id: "me", requestedAmount: 0, termMonths: 0, ...result },
          result.sources,
          { name: "گزارش من", nationalId: null }
        );
        setState({ loading: false, error: "", view });
      })
      .catch((e) => { if (!cancelled) setState({ loading: false, error: e.message, view: null }); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ minHeight: "100vh", direction: "rtl", background: C.paper }}>
      <div style={{ background: `linear-gradient(90deg, ${C.ink} 0%, ${C.inkSoft} 100%)` }}>
        <div className="flex items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <BrandMark size={22} chip />
            <span className="text-base font-extrabold" style={{ color: "#fff", fontFamily: FONT_DISPLAY }}>گزارش اعتباری من</span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={async () => { if (window.confirm("اطلاعات شخصی شما (شمارهٔ موبایل و پیوند کد ملی) فوراً حذف می‌شود و این کار قابل بازگشت نیست. ادامه می‌دهید؟")) { try { await api.deleteAccount(); } catch (e) { window.alert(e.message); return; } persistAuth(null); } }} className="text-xs font-medium" style={{ color: "#F3B8BD" }}>حذف حساب</button>
            <button onClick={onLogout} className="text-xs font-medium" style={{ color: "#B9C6DA" }}>خروج</button>
          </div>
        </div>
        <div style={{ height: 2, background: `linear-gradient(90deg, ${C.teal} 0%, ${C.tealDeep} 100%)` }} />
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
        <div className="mb-6 p-4 text-sm leading-6" style={{ background: C.tealSoft, borderInlineStart: `3px solid ${C.teal}`, color: C.text }}>
          این همان گزارشی است که کسب‌وکارها هنگام بررسی اعتبار شما مشاهده می‌کنند — فقط برای شما قابل مشاهده است.
        </div>

        {state.loading && <Spinner />}
        <ErrorBanner>{state.error}</ErrorBanner>

        {state.view && (
          <>
            <Card className="mb-6 p-8" accent={C.teal}>
              <div className="flex flex-wrap items-center justify-center gap-8">
                <div className="flex flex-col gap-8">
                  <MiniRing icon={CreditCard} label="رفتار پرداخت" value={state.view.indicators.payment} />
                  <MiniRing icon={FileCheck2} label="چک" value={state.view.indicators.checks} />
                </div>
                <VerdictSeal score={state.view.score} status={state.view.decision} />
                <div className="flex flex-col gap-8">
                  <MiniRing icon={Layers} label="تعهدات" value={state.view.indicators.commitments} />
                  <MiniRing icon={Banknote} label="تسهیلات" value={state.view.indicators.loans} />
                </div>
              </div>
            </Card>

            <div className="mb-6 grid grid-cols-1 gap-5 md:grid-cols-2">
              <Card className="p-5">
                <h3 className="mb-1 text-sm font-bold" style={{ color: C.ink }}>روند اعتبار</h3>
                <TrendChart data={state.view.trend} tone={state.view.decision === "approve" ? C.good : state.view.decision === "review" ? C.warn : C.bad} />
              </Card>
              <Card className="p-6">
                <h3 className="mb-2 text-center text-sm font-bold" style={{ color: C.ink }}>چرخه سلامت اعتباری</h3>
                <HealthWheel indicators={state.view.indicators} stability={Math.round((state.view.indicators.payment + state.view.indicators.checks) / 2)} overall={state.view.overallHealth} size={220} />
              </Card>
            </div>

            <Card className="mb-6 p-6">
              <h3 className="mb-3 text-sm font-bold" style={{ color: C.ink }}>چرا این وضعیت؟</h3>
              <WhyDecisionContent customer={state.view} />
            </Card>

            <Card className="p-5">
              <h3 className="mb-3 text-sm font-bold" style={{ color: C.ink }}>منابع بررسی‌شده</h3>
              <div className="space-y-2.5">
                {state.view.sources.map((s) => (
                  <div key={s.key} className="flex w-full items-center justify-between px-3 py-2" style={{ border: `1px solid ${C.line}` }}>
                    <span className="text-sm font-medium" style={{ color: C.text }}>{s.label}</span>
                    <span className="text-xs font-medium" style={{ color: s.ok ? C.good : C.warn }}>{s.ok ? "بررسی شد" : s.note}</span>
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------------------------- app ------------------------------------ */

export default function App() {
  const [auth, setAuthState] = useState(() => getAuth());
  const [screen, setScreen] = useState(() => {
    const a = getAuth();
    if (!a) return "login";
    if (a.role !== "business") return "myreport";
    return window.location.hash.replace(/^#\/?/, "") || "dashboard";
  });
  const [activeCheck, setActiveCheck] = useState(null); // { loading, error, view }

  useEffect(() => {
    const onAuthChanged = (event) => {
      const next = event.detail;
      setAuthState(next);
      if (next?.role === "business") setScreen("dashboard");
      else if (next?.role === "user") setScreen("myreport");
      if (!next) {
        setScreen("login");
        setActiveCheck(null);
      }
    };
    window.addEventListener("sabegheno-auth-changed", onAuthChanged);
    return () => window.removeEventListener("sabegheno-auth-changed", onAuthChanged);
  }, []);

  useEffect(() => {
    if (!auth) return;
    let cancelled = false;
    api.getSession().then((fresh) => {
      if (cancelled) return;
      const cur = getAuth() || auth; // read the CURRENT tokens — a silent refresh may have rotated them
      const next = { ...cur, role: fresh.role, entity: fresh.entity, mobile: fresh.mobile };
      localStorage.setItem("sabegheno_auth", JSON.stringify(next)); // no logout/login event needed
      setAuthState(next);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [auth?.token]);

  useEffect(() => {
    if (!auth || auth.role !== "business") return;
    const onPopState = () => {
      const next = window.location.hash.replace(/^#\/?/, "") || "dashboard";
      setScreen(next);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [auth?.role]);

  useEffect(() => {
    if (!auth || auth.role !== "business" || screen === "login") return;
    const nextHash = `#/${screen}`;
    if (window.location.hash !== nextHash) window.history.pushState({ screen }, "", nextHash);
  }, [screen, auth?.role]);

  function handleLoggedIn(a) {
    persistAuth(a);
    setAuthState(a);
    setScreen(a.role === "business" ? "dashboard" : "myreport");
  }

  async function handleLogout() {
    await api.logout(); // closes the session on the server too
    persistAuth(null);
    setAuthState(null);
    setScreen("login");
    setActiveCheck(null);
  }

  // Opens the Credit Map for a given check id. If `check`/`sources` are
  // already known (e.g. just created, or a full row from history) they're
  // used immediately; otherwise it fetches GET /credit-checks/:id (no
  // `sources` breakdown available there — see backend README).
  function openCheck(id, extra) {
    setScreen("creditmap");
    setActiveCheck({ id, key: Date.now(), print: !!(extra && extra.print) });
  }

  // the notification bell asks us to open the report an admin just decided
  useEffect(() => {
    const h = (e) => e.detail?.id && openCheck(e.detail.id);
    window.addEventListener("sabegheno:open-check", h);
    return () => window.removeEventListener("sabegheno:open-check", h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (window.location.pathname === "/payment/return") {
    return <ToastProvider><PaymentReturn /></ToastProvider>;
  }

  if (!auth) {
    return <ToastProvider><AuthPage onLoggedIn={handleLoggedIn} /></ToastProvider>;
  }

  if (auth.role === "user") {
    return <ToastProvider><SelfReport onLogout={handleLogout} /></ToastProvider>;
  }

  const titles = {
    dashboard: { title: "داشبورد", subtitle: "امروز چند تصمیم اعتباری گرفته‌ام؟" },
    newcheck: { title: "استعلام جدید", subtitle: "برای بررسی سابقه اعتباری مشتری، اطلاعات زیر را وارد کنید." },
    credits: { title: "اعتبارها و تعهدات", subtitle: "دفتر اقساط، پرداخت قسط، تسویه، چک برگشتی و بدحسابی — همه در یک‌جا" },
    providerreport: { title: "تعهدات و بدحسابان", subtitle: "تعهد جدید، تسویه، چک برگشتی و بدحسابی مشتریان را ثبت کنید" },
    facilities: { title: "اعتبارهای اعطایی", subtitle: "هر اعتبار یک ردیف: مبلغ، سررسید، مانده، جریمه و تسویه" },
    api: { title: "اتصال API", subtitle: "استعلام و اعلام تسویه به‌صورت خودکار از سیستم خودتان" },
    history: { title: "تاریخچه استعلام‌ها", subtitle: "جست‌وجو، فیلتر و دریافت گزارش PDF هر استعلام" },
    support: { title: "پشتیبانی", subtitle: "تیکت‌های شما و پاسخ‌های تیم سابقه‌نو" },
    faq: { title: "سؤالات متداول", subtitle: "پاسخ سریع به رایج‌ترین پرسش‌ها" },
    account: { title: "حساب من", subtitle: "نشست‌های فعال، امنیت و حذف اطلاعات شخصی" },
    // Admin-only screens are not part of this business/user client.
    creditmap: { title: "تصویر اعتباری مشتری" },
  };
  const { title, subtitle } = titles[screen] || titles.dashboard;

  return (
    <ToastProvider><div className="w-full" style={{ fontFamily: FONT_BODY }}>
      <style>{`
        input[type="range"] { -webkit-appearance: none; appearance: none; }
        body, #root { font-variant-numeric: tabular-nums; }
        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 16px; height: 16px; border-radius: 999px;
          background: #fff; border: 3px solid ${C.teal}; cursor: pointer;
        }
      `}</style>
      <Shell title={title} subtitle={subtitle} screen={screen} setScreen={setScreen} auth={auth} onLogout={handleLogout}>
        <div key={screen} className="screen-transition">
          {screen === "dashboard" && <Dashboard setScreen={setScreen} openCheck={openCheck} auth={auth} />}
          {screen === "newcheck" && <NewCheck setScreen={setScreen} openCheck={openCheck} />}
          {(screen === "credits" || screen === "providerreport" || screen === "facilities") && <CreditsHub />}
          {screen === "creditmap" && <ReportPage activeCheck={activeCheck} onBack={() => setScreen("history")} />}
          
          {screen === "api" && <ApiPage />}
          {screen === "history" && <HistoryPage openCheck={openCheck} auth={auth} />}
          {screen === "support" && <SupportPage />}
          {screen === "faq" && <Faq />}
          {screen === "account" && <AccountPage auth={auth} onLogout={handleLogout} />}
        </div>
        {/* Admin-only screens are served by the separate admin application. */}
      </Shell>
    </div></ToastProvider>
  );
}
