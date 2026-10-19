import React, { useEffect, useRef, useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { X, TrendingUp, TrendingDown, Minus, Inbox, Eye, EyeOff, Copy } from "lucide-react";
import { fa, fitCls } from "./lib.js";

export const Badge = ({ tone = "neutral", children }) => <span className={`badge ${tone}`}>{children}</span>;

export function Card({ eyebrow, title, action, children, className = "", pad = true }) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="card-head">
          <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}{title && <h2>{title}</h2>}</div>
          {action}
        </header>
      )}
      <div className={pad ? "card-body" : ""}>{children}</div>
    </section>
  );
}

// delta = % change vs the previous period (null hides it). invert: lower is better.
export function Kpi({ label, value, unit, icon: Icon, tone = "teal", delta, invert, spark, hint }) {
  const good = delta == null || delta === 0 ? null : invert ? delta < 0 : delta > 0;
  const Arrow = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  return (
    <div className="kpi">
      <div className="kpi-top">
        <span className={`kpi-icon ${tone}`}><Icon size={19} /></span>
        {delta != null && (
          <span className={`delta ${good === null ? "flat" : good ? "up" : "down"}`} title="نسبت به بازهٔ قبلی">
            <Arrow size={14} /> {fa(Math.abs(delta))}٪
          </span>
        )}
      </div>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${fitCls(`${value}${unit || ""}`)}`}>{value}{unit && <small>{unit}</small>}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
      {spark && (
        <div className="kpi-spark" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={spark} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
              <Area type="monotone" dataKey="v" stroke="var(--teal)" strokeWidth={2} fill="var(--teal)" fillOpacity={0.12} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="tablist">
      {options.map(([v, l, count]) => (
        <button key={v} role="tab" aria-selected={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>
          {l}{count != null && <em>{fa(count)}</em>}
        </button>
      ))}
    </div>
  );
}

export function Drawer({ open, onClose, title, children, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    ref.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="drawer-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header><h3>{title}</h3><button className="icon-btn" onClick={onClose} aria-label="بستن"><X size={18} /></button></header>
        <div className="drawer-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </aside>
    </div>
  );
}

export const Empty = ({ text = "داده‌ای برای نمایش نیست." }) => (
  <div className="empty"><Inbox size={26} /><span>{text}</span></div>
);
export const Skeleton = ({ h = 120 }) => <div className="skeleton" style={{ height: h }} />;

export function ChartTip({ active, payload, label, fmt }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      {label && <b>{label}</b>}
      {payload.map((p) => (
        <div key={p.dataKey}><i style={{ background: p.color || p.fill }} />{p.name}: <b>{fmt ? fmt(p.value, p) : fa(p.value)}</b></div>
      ))}
    </div>
  );
}

export function useToast() {
  const [t, setT] = useState(null);
  const show = (msg, tone = "good") => { setT({ msg, tone }); setTimeout(() => setT(null), 3200); };
  const node = t ? <div className={`toast ${t.tone}`} role="status">{t.msg}</div> : null;
  return [show, node];
}

export function ScoreRing({ score, size = 96 }) {
  const pct = Math.max(0, Math.min(1, (score - 300) / 600));
  const r = size / 2 - 8, c = 2 * Math.PI * r;
  const color = score >= 700 ? "#0FAF9E" : score >= 550 ? "#FCA311" : "#D64550";
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E8EDF2" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b>{fa(score)}</b>
    </div>
  );
}

/* ---------- business logo (uploaded) with initials fallback ---------- */
import { assetUrl, adminApi } from "./api.js";
import { initials, avatarColors } from "./lib.js";

export function BizLogo({ name = "", src, size = 40, radius = 12 }) {
  const [bad, setBad] = useState(false);
  const url = assetUrl(src);
  if (url && !bad) {
    return <img className="biz-logo" src={url} alt={name} width={size} height={size} style={{ width: size, height: size, borderRadius: radius }} onError={() => setBad(true)} />;
  }
  const [bg, fg] = avatarColors(name);
  return <span className="biz-logo fallback" style={{ width: size, height: size, borderRadius: radius, background: bg, color: fg, fontSize: size * 0.36 }}>{initials(name)}</span>;
}

/* ---------- money / number input that keeps thousand separators while typing ---------- */
export function MoneyInput({ value, onChange, placeholder, suffix = "تومان", ...rest }) {
  const shown = value ? Number(value).toLocaleString("en-US") : "";
  return (
    <span className="money-input">
      <input inputMode="numeric" dir="ltr" placeholder={placeholder} value={shown}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, "")) || 0)} {...rest} />
      {suffix && <em>{suffix}</em>}
    </span>
  );
}

export function Donut({ data, total, label = "استعلام", size = 220, thickness = 34 }) {
  const sum = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = size / 2 - thickness / 2 - 4, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="donut2" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#EBF0F4" strokeWidth={thickness} />
        {data.filter((d) => d.value > 0).map((d) => {
          const len = (d.value / sum) * c;
          const el = <circle key={d.key || d.name} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={d.color} strokeWidth={thickness}
            strokeDasharray={`${Math.max(0, len - 3)} ${c}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`}><title>{`${d.name}: ${d.value}`}</title></circle>;
          off += len;
          return el;
        })}
      </svg>
      <div className="donut2-center"><b>{Number(total ?? sum).toLocaleString("en-US").replace(/[0-9]/g, (x) => "۰۱۲۳۴۵۶۷۸۹"[x])}</b><span>{label}</span></div>
    </div>
  );
}


/* National ID for admins: masked by default; "show" asks the server (every reveal is written to the audit log),
   displays the full number for 30 s, then hides it again. */
export function NationalIdCell({ masked, kind, id }) {
  const [full, setFull] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setFull(null); }, [id]);
  if (!masked && !kind) return <span className="muted">—</span>;
  async function reveal(e) {
    e.stopPropagation();
    setBusy(true); setErr("");
    try {
      const r = await adminApi.revealNationalId(kind, id);
      setFull(r.nationalId);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setFull(null), 30000);
    } catch (x) { setErr(x.message || "خطا"); } finally { setBusy(false); }
  }
  const hide = (e) => { e.stopPropagation(); clearTimeout(timer.current); setFull(null); };
  const copy = (e) => { e.stopPropagation(); navigator.clipboard?.writeText(full).catch(() => {}); };
  return (
    <span className="nid-cell" dir="ltr" title={err || undefined}>
      <bdi className="mono">{full || masked || "—"}</bdi>
      {kind && id && !full && masked && <button type="button" className="nid-btn" onClick={reveal} disabled={busy} aria-label="نمایش کد ملی (ثبت در لاگ ممیزی)" title="نمایش کامل — در لاگ ممیزی ثبت می‌شود"><Eye size={14} /></button>}
      {full && <><button type="button" className="nid-btn" onClick={copy} aria-label="کپی" title="کپی"><Copy size={14} /></button><button type="button" className="nid-btn" onClick={hide} aria-label="پنهان" title="پنهان کردن"><EyeOff size={14} /></button></>}
      {err && <small className="neg">!</small>}
    </span>
  );
}
