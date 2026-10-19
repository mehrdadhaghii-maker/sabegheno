import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X, Copy, Check } from "lucide-react";
import { assetUrl } from "../api.js";

/* ---------- numbers: ALWAYS thousand-separated, Persian digits ---------- */
const FA = "۰۱۲۳۴۵۶۷۸۹";
export const faDigits = (s) => String(s).replace(/[0-9]/g, (d) => FA[d]);
export const num = (v) => faDigits(Math.round(Number(v) || 0).toLocaleString("en-US")).replace(/,/g, "٬");
const trim1 = (v) => Number(v.toFixed(1)).toString();
export const toman = (n) => {
  n = Number(n) || 0;
  if (n >= 1e9) return `${faDigits(trim1(n / 1e9))} میلیارد تومان`;
  if (n >= 1e6) return `${faDigits(trim1(n / 1e6))} میلیون تومان`;
  return `${num(n)} تومان`;
};
// 240 000 000 → { value: "۲۴۰", unit: "میلیون تومان" } — big amounts never become a 12-digit wall
export const compactToman = (n) => {
  n = Number(n) || 0;
  if (n >= 1e9) return { value: faDigits(trim1(n / 1e9)), unit: "میلیارد تومان" };
  if (n >= 1e6) return { value: faDigits(trim1(n / 1e6)), unit: "میلیون تومان" };
  return { value: num(n), unit: "تومان" };
};
export const tomanFull = (n) => `${num(n)} تومان`;
export const parseNum = (v) => Number(String(v ?? "").replace(/[٬,\s]/g, "").replace(/[۰-۹]/g, (d) => FA.indexOf(d))) || 0;
export const dateFa = (d) => new Date(d).toLocaleDateString("fa-IR");
export const dateTimeFa = (d) => new Date(d).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" });
export function agoFa(d) {
  const m = Math.max(0, Math.round((Date.now() - new Date(d).getTime()) / 60000));
  if (m < 1) return "همین الان";
  if (m < 60) return `${num(m)} دقیقه پیش`;
  if (m < 1440) return `${num(Math.round(m / 60))} ساعت پیش`;
  return `${num(Math.round(m / 1440))} روز پیش`;
}
export const formatPhone = (m = "") => faDigits(String(m).replace(/^(\d{4})(\d{3})(\d{4})$/, "$1 $2 $3"));
export const cleanName = (n = "") => n.replace(/^\[دمو\]\s*/, "");

export const DECISION = {
  approve: { label: "تأییدشده", short: "تأیید", tone: "good", color: "#0FAF9E" },
  review: { label: "نیازمند بررسی", short: "بررسی", tone: "warn", color: "#FCA311" },
  decline: { label: "ردشده", short: "رد", tone: "bad", color: "#D64550" },
};

// "Waiting for advanced validation": a review decision no admin has decided yet.
const WAIT = { label: "منتظر اعتبارسنجی پیشرفته", short: "منتظر بررسی", tone: "warn", color: "#FCA311" };
export const decisionMeta = (c) => (c?.awaitingReview ? WAIT : DECISION[c?.finalDecision || c?.decision] || DECISION.review);

// Large amounts must never break a card: shrink the font by the length of the text.
export const fitCls = (v) => { const n = String(v ?? "").length; return n > 17 ? "fit-xs" : n > 13 ? "fit-s" : n > 9 ? "fit-m" : ""; };

/* ---------- toast system (modern snackbars) ---------- */
const ToastCtx = createContext({ push: () => {} });
export const useToast = () => useContext(ToastCtx);
const ICONS = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((message, kind = "success", opts = {}) => {
    const id = Math.random().toString(36).slice(2);
    setItems((xs) => [...xs.slice(-3), { id, message, kind, title: opts.title }]);
    setTimeout(() => dismiss(id), opts.duration || (kind === "error" ? 6500 : 4200));
  }, [dismiss]);
  const api = { push, success: (m, t) => push(m, "success", { title: t }), error: (m, t) => push(m, "error", { title: t }), info: (m, t) => push(m, "info", { title: t }), warning: (m, t) => push(m, "warning", { title: t }) };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" role="region" aria-live="polite" aria-label="اعلان‌ها">
        {items.map((t) => { const I = ICONS[t.kind] || Info; return (
          <div key={t.id} className={`toast-card ${t.kind}`} role="status">
            <span className="toast-ico"><I size={20} /></span>
            <div>{t.title && <b>{t.title}</b>}<p>{t.message}</p></div>
            <button onClick={() => dismiss(t.id)} aria-label="بستن"><X size={15} /></button>
            <i className="toast-bar" />
          </div>); })}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- small UI pieces ---------- */
export function BizLogo({ name = "", src, size = 44, radius = 14 }) {
  const [bad, setBad] = useState(false);
  const url = assetUrl(src);
  if (url && !bad) return <img className="bx-logo" src={url} alt={name} style={{ width: size, height: size, borderRadius: radius }} onError={() => setBad(true)} />;
  const w = cleanName(name).trim().split(/\s+/).filter(Boolean);
  const ini = w.length > 1 ? `${w[0][0]}\u200c${w[1][0]}` : (w[0] || "؟").slice(0, 2);
  return <span className="bx-logo fallback" style={{ width: size, height: size, borderRadius: radius, fontSize: size * 0.36 }}>{ini}</span>;
}

export const Card = ({ children, className = "", accent = "teal", ...p }) => <section className={`bx-card accent-${accent} ${className}`} {...p}>{children}</section>;

export function CardHead({ eyebrow, title, action }) {
  return <header className="bx-card-head"><div>{eyebrow && <span className="bx-eyebrow">{eyebrow}</span>}<h3>{title}</h3></div>{action}</header>;
}

export function Tile({ icon: Icon, label, value, unit, hint, tone = "teal", delta }) {
  return (
    <div className={`bx-tile v2 tone-${tone}`}>
      <div className="bx-tile-head">
        <span className="bx-tile-ico"><Icon size={21} /></span>
        <span className="bx-tile-label">{label}</span>
      </div>
      <div className="bx-tile-valuerow"><b className={`bx-tile-value ${fitCls(`${value}`)}`}>{value}</b>{unit && <small>{unit}</small>}{delta != null && delta !== 0 && <span className={`bx-tile-delta ${delta > 0 ? "up" : "down"}`}>{delta > 0 ? "▲" : "▼"} {faDigits(Math.abs(delta))}٪</span>}</div>
      {hint && <div className="bx-tile-hint">{hint}</div>}
    </div>
  );
}

export function Badge({ tone = "neutral", children }) { return <span className={`bx-badge ${tone}`}>{children}</span>; }

export function MoneyInput({ value, onChange, placeholder, suffix = "تومان", id, invalid }) {
  const shown = value ? Number(value).toLocaleString("en-US") : "";
  return (
    <span className={`bx-money ${invalid ? "invalid" : ""}`}>
      <input id={id} inputMode="numeric" dir="ltr" placeholder={placeholder} value={shown} onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)} />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

export function Donut({ data, total, label = "استعلام", size = 230, thickness = 38 }) {
  const sum = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - thickness / 2 - 4, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="bx-donut" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EBF0F4" strokeWidth={thickness} />
        {data.filter((d) => d.value > 0).map((d) => {
          const len = (d.value / sum) * c;
          const el = <circle key={d.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={thickness} strokeLinecap="butt"
            strokeDasharray={`${Math.max(0, len - 3)} ${c}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`}><title>{`${d.name}: ${num(d.value)}`}</title></circle>;
          off += len; return el;
        })}
      </svg>
      <div className="bx-donut-center"><b>{num(total ?? sum)}</b><span>{label}</span></div>
    </div>
  );
}

export function Field({ label, hint, error, children, required }) {
  return (
    <label className={`bx-field ${error ? "has-error" : ""}`}>
      <span className="bx-label">{label}{required && <i>*</i>}</span>
      {children}
      {error ? <small className="err">{error}</small> : hint ? <small className="hint">{hint}</small> : null}
    </label>
  );
}

export function Empty({ icon: Icon, text }) { return <div className="bx-empty">{Icon && <Icon size={30} />}<span>{text}</span></div>; }
export const Spin = () => <div className="bx-spin"><i /></div>;

// Iranian national-ID checksum (catches typos before we spend an inquiry)
export function validNationalId(id) {
  if (!/^\d{10}$/.test(id) || /^(\d)\1{9}$/.test(id)) return false;
  const s = [...id].slice(0, 9).reduce((a, d, i) => a + Number(d) * (10 - i), 0) % 11;
  const c = Number(id[9]);
  return s < 2 ? c === s : c === 11 - s;
}


/* ---------- national ID ----------
   The owner (a business, or the person themself) always sees the FULL number, copyable.
   Rows saved before the encrypted copy existed show "—" (a hash cannot be turned back into a number). */
export function NationalId({ value, masked, copy = true, onFill }) {
  const [done, setDone] = useState(false);
  const [edit, setEdit] = useState(false);
  const [txt, setTxt] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const full = value && /^\d{10}$/.test(String(value)) ? String(value) : null;
  if (!full && !masked) {
    if (!onFill) return <span className="bx-nid none" title="این رکورد پیش از نسخهٔ جدید ثبت شده و کد ملی آن ذخیره نشده است">—</span>;
    async function save(e) {
      e.preventDefault(); e.stopPropagation();
      if (!/^\d{10}$/.test(txt)) { setErr("۱۰ رقم"); return; }
      setSaving(true); setErr("");
      try { await onFill(txt); setEdit(false); } catch (x) { setErr(x.message || "خطا"); } finally { setSaving(false); }
    }
    return edit ? (
      <form className="bx-nid-fill" onSubmit={save} onClick={(e) => e.stopPropagation()}>
        <input dir="ltr" inputMode="numeric" maxLength={10} autoFocus value={txt} onChange={(e) => setTxt(e.target.value.replace(/\D/g, ""))} placeholder="کد ملی ۱۰ رقمی" />
        <button type="submit" disabled={saving}>{saving ? "…" : "ثبت"}</button>
        <button type="button" onClick={() => { setEdit(false); setErr(""); }}>×</button>
        {err && <small className="neg">{err}</small>}
      </form>
    ) : <button type="button" className="bx-nid-add" onClick={(e) => { e.stopPropagation(); setEdit(true); }} title="این رکورد قدیمی است؛ یک‌بار کد ملی را وارد کنید تا همیشه نمایش داده شود">+ افزودن کد ملی</button>;
  }
  async function doCopy(e) {
    e.stopPropagation();
    try { await navigator.clipboard.writeText(full); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard blocked: the number is still selectable */ }
  }
  return (
    <span className="bx-nid" dir="ltr">
      <bdi>{full || masked}</bdi>
      {full && copy && <button type="button" className="bx-nid-copy" onClick={doCopy} aria-label="کپی کد ملی" title="کپی">{done ? <Check size={13} /> : <Copy size={13} />}</button>}
    </span>
  );
}

/* ---------- live refresh ----------
   Re-runs `load` when the tab regains focus, when something elsewhere announces a data change
   (window event "sabegheno:data-changed", fired by the notification bell), and — only while `active` —
   on a timer. Used so a decision made by our admins shows up without the user pressing anything. */
export function useLiveRefresh(load, { active = false, ms = 20000 } = {}) {
  const ref = useRef(load);
  ref.current = load;
  useEffect(() => {
    const run = () => { if (!document.hidden) ref.current(true); };
    const onChange = () => ref.current(true);
    window.addEventListener("focus", run);
    window.addEventListener("sabegheno:data-changed", onChange);
    document.addEventListener("visibilitychange", run);
    const timer = active ? setInterval(run, ms) : null;
    return () => {
      window.removeEventListener("focus", run);
      window.removeEventListener("sabegheno:data-changed", onChange);
      document.removeEventListener("visibilitychange", run);
      if (timer) clearInterval(timer);
    };
  }, [active, ms]);
}

// What a row's status really is: a "review" inquiry that an admin has decided counts as that decision.
export const effectiveStatus = (c) => (c?.awaitingReview ? "review" : (c?.finalDecision || c?.decision));
