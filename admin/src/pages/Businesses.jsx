import React, { useMemo, useState } from "react";
import { XCircle, Search, Check, Ban, FileSignature, Phone, CalendarDays, Link2, LayoutGrid, Rows3, SlidersHorizontal, RotateCcw, Building2, Clock, CheckCircle2, ShieldOff, Sparkles, FileCheck2, Activity, X } from "lucide-react";
import { Card, Badge, Drawer, Empty, BizLogo } from "../ui.jsx";
import { fa, num, toman, dayOnly, ago, BUSINESS_STATUS, formatPhone, initials, avatarColors, cleanName } from "../lib.js";

const DAY = 864e5;
const STATUS_CHIPS = [
  ["pending_docs", "منتظر مدارک", Clock, "#FCA311"],
  ["pending_contract", "منتظر قرارداد", FileSignature, "#123B5D"],
  ["approved", "فعال", CheckCircle2, "#0FAF9E"],
  ["suspended", "تعلیق‌شده", ShieldOff, "#D64550"],
  ["rejected", "ردشده", XCircle, "#8A99AB"],
];
const SORTS = {
  newest: ["جدیدترین ثبت‌نام", (a, b) => new Date(b.createdAt) - new Date(a.createdAt)],
  checks: ["بیشترین استعلام", (a, b) => (b._count?.creditChecks || 0) - (a._count?.creditChecks || 0)],
  rate: ["بالاترین نرخ تأیید", (a, b) => rate(b) - rate(a)],
  activity: ["آخرین فعالیت", (a, b) => new Date(b.stats?.lastCheckAt || 0) - new Date(a.stats?.lastCheckAt || 0)],
  name: ["نام (الفبا)", (a, b) => a.name.localeCompare(b.name, "fa")],
};
const EMPTY = { q: "", statuses: [], contract: "", provider: "", activity: "", period: "", sort: "newest" };
const rate = (b) => { const t = b._count?.creditChecks || 0; return t ? Math.round(((b.stats?.approve || 0) / t) * 100) : 0; };

function Avatar({ name, src, size = 46 }) {
  return <BizLogo name={name} src={src} size={size} radius={Math.round(size * 0.3)} />;
}

function Steps({ b }) {
  const s = [
    ["ثبت‌نام", true],
    ["مدارک", b.isVerified || ["pending_contract", "approved"].includes(b.status)],
    ["قرارداد", b.contractSigned],
    ["فعال", b.status === "approved"],
  ];
  return (
    <div className="mini-steps" aria-label="مراحل فعال‌سازی">
      {s.map(([l, ok], i) => (<React.Fragment key={l}><span className={ok ? "on" : ""}><i />{l}</span>{i < 3 && <b className={s[i + 1][1] ? "on" : ""} />}</React.Fragment>))}
    </div>
  );
}

function DecisionBar({ st, total }) {
  if (!total) return <div className="dbar empty">بدون استعلام</div>;
  return (
    <div className="dbar" title={`تأیید ${st.approve} · بررسی ${st.review} · رد ${st.decline}`}>
      <i style={{ flex: st.approve, background: "#0FAF9E" }} /><i style={{ flex: st.review, background: "#FCA311" }} /><i style={{ flex: st.decline, background: "#D64550" }} />
    </div>
  );
}

function Actions({ b, onUpdate, onReject, size = "sm" }) {
  const cls = `btn ${size}`;
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const canApprove = b.status !== "approved";
  return (
    <>
      {b.status === "pending_docs" && <button className={cls} onClick={stop(() => onUpdate(b.id, { status: "pending_contract" }, "مدارک تأیید شد"))}><FileCheck2 size={15} /> تأیید مدارک</button>}
      {canApprove && <button className={`${cls} primary`} onClick={stop(() => onUpdate(b.id, { status: "approved", contractSigned: true }, "کسب‌وکار فعال شد"))}><Check size={15} /> {b.status === "suspended" || b.status === "rejected" ? "فعال‌سازی مجدد" : "تأیید"}</button>}
      {b.status === "approved" && <button className={`${cls} danger`} onClick={stop(() => onUpdate(b.id, { status: "suspended" }, "کسب‌وکار تعلیق شد"))}><Ban size={15} /> تعلیق</button>}
      {b.status !== "rejected" && b.status !== "approved" && <button className={`${cls} danger`} onClick={stop(() => onReject(b))}><XCircle size={15} /> رد</button>}
    </>
  );
}

export default function Businesses({ rows, initialTab = "all", onUpdate, goChecks }) {
  const [f, setF] = useState({ ...EMPTY, statuses: initialTab === "pending" ? ["pending_docs", "pending_contract"] : [] });
  const [view, setView] = useState("cards");
  const [sel, setSel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null); // business being rejected
  const [reason, setReason] = useState("");
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const toggle = (k) => set({ statuses: f.statuses.includes(k) ? f.statuses.filter((x) => x !== k) : [...f.statuses, k] });

  const counts = useMemo(() => Object.fromEntries(STATUS_CHIPS.map(([k]) => [k, rows.filter((b) => b.status === k).length])), [rows]);
  const newThisMonth = rows.filter((b) => Date.now() - new Date(b.createdAt) < 30 * DAY).length;
  const activeFilters = [f.q, f.statuses.length, f.contract, f.provider, f.activity, f.period].filter(Boolean).length;

  const list = useMemo(() => rows.filter((b) => {
    const t = b._count?.creditChecks || 0;
    if (f.q && !(b.name.includes(f.q) || b.mobile.includes(f.q.replace(/\s/g, "")))) return false;
    if (f.statuses.length && !f.statuses.includes(b.status)) return false;
    if (f.contract === "signed" && !b.contractSigned) return false;
    if (f.contract === "unsigned" && b.contractSigned) return false;
    if (f.provider === "linked" && !b.providerLink) return false;
    if (f.provider === "none" && b.providerLink) return false;
    if (f.activity === "none" && t > 0) return false;
    if (f.activity === "active" && t === 0) return false;
    if (f.activity === "heavy" && t < 10) return false;
    if (f.period && Date.now() - new Date(b.createdAt) > Number(f.period) * DAY) return false;
    return true;
  }).sort(SORTS[f.sort][1]), [rows, f]);

  const current = sel && rows.find((b) => b.id === sel);
  async function act(body, msg) { setBusy(true); try { await onUpdate(current.id, body, msg); } finally { setBusy(false); } }

  const pipeline = [
    ["در انتظار مدارک", counts.pending_docs, "#FCA311"], ["در انتظار قرارداد", counts.pending_contract, "#123B5D"],
    ["فعال", counts.approved, "#0FAF9E"], ["تعلیق‌شده", counts.suspended, "#D64550"],
  ];

  return (
    <div className="stack">
      {/* ---- overview strip ---- */}
      <div className="biz-top">
        <div className="biz-total"><span className="kpi-icon navy"><Building2 size={22} /></span><div><b>{fa(rows.length)}</b><span>کسب‌وکار ثبت‌شده</span></div><em><Sparkles size={13} /> {fa(newThisMonth)} جدید در ۳۰ روز</em></div>
        <div className="pipeline">
          <div className="pipeline-bar">{pipeline.map(([l, v, c]) => <i key={l} style={{ flex: v || 0.0001, background: c }} title={`${l}: ${v}`} />)}</div>
          <div className="pipeline-legend">
            {STATUS_CHIPS.map(([k, l, Icon, c]) => (
              <button key={k} className={f.statuses.includes(k) ? "on" : ""} onClick={() => toggle(k)} style={{ "--c": c }}>
                <Icon size={16} /><span>{l}</span><b>{fa(counts[k])}</b>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ---- filters ---- */}
      <Card pad={false}>
        <div className="filterbar">
          <label className="search grow"><Search size={16} /><input placeholder="جستجوی نام یا شمارهٔ موبایل…" value={f.q} onChange={(e) => set({ q: e.target.value })} />{f.q && <button className="clear" onClick={() => set({ q: "" })} aria-label="پاک کردن"><X size={14} /></button>}</label>
          <div className="fsel"><SlidersHorizontal size={15} />
            <select value={f.contract} onChange={(e) => set({ contract: e.target.value })} aria-label="قرارداد"><option value="">قرارداد: همه</option><option value="signed">امضاشده</option><option value="unsigned">امضانشده</option></select>
          </div>
          <select className="fsel-plain" value={f.provider} onChange={(e) => set({ provider: e.target.value })} aria-label="Provider"><option value="">اتصال Provider: همه</option><option value="linked">متصل</option><option value="none">بدون اتصال</option></select>
          <select className="fsel-plain" value={f.activity} onChange={(e) => set({ activity: e.target.value })} aria-label="فعالیت"><option value="">فعالیت: همه</option><option value="active">دارای استعلام</option><option value="heavy">پرکار (۱۰+ استعلام)</option><option value="none">بدون استعلام</option></select>
          <select className="fsel-plain" value={f.period} onChange={(e) => set({ period: e.target.value })} aria-label="ثبت‌نام"><option value="">ثبت‌نام: همه زمان‌ها</option><option value="7">۷ روز اخیر</option><option value="30">۳۰ روز اخیر</option><option value="90">۹۰ روز اخیر</option></select>
          <select className="fsel-plain" value={f.sort} onChange={(e) => set({ sort: e.target.value })} aria-label="مرتب‌سازی">{Object.entries(SORTS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
          <div className="view-toggle">
            <button className={view === "cards" ? "on" : ""} onClick={() => setView("cards")} aria-label="نمای کارتی"><LayoutGrid size={17} /></button>
            <button className={view === "table" ? "on" : ""} onClick={() => setView("table")} aria-label="نمای جدول"><Rows3 size={17} /></button>
          </div>
        </div>
        <div className="filter-summary">
          <span>{fa(list.length)} از {fa(rows.length)} کسب‌وکار</span>
          {activeFilters > 0 && <button className="link" onClick={() => setF({ ...EMPTY })}><RotateCcw size={13} /> حذف {fa(activeFilters)} فیلتر</button>}
        </div>
      </Card>

      {/* ---- results ---- */}
      {list.length === 0 ? <Card><Empty text="کسب‌وکاری با این فیلترها پیدا نشد." /></Card> : view === "cards" ? (
        <div className="biz-grid">
          {list.map((b) => {
            const t = b._count?.creditChecks || 0, st = b.stats || {};
            return (
              <article key={b.id} className="biz-card" tabIndex={0} onClick={() => setSel(b.id)} onKeyDown={(e) => e.key === "Enter" && setSel(b.id)}>
                <header>
                  <Avatar name={b.name} src={b.logoUrl} />
                  <div className="biz-id"><h3>{cleanName(b.name)}</h3><span className="phone"><Phone size={12} />{formatPhone(b.mobile)}</span></div>
                  <Badge tone={BUSINESS_STATUS[b.status].tone}>{BUSINESS_STATUS[b.status].label}</Badge>
                </header>
                <Steps b={b} />
                <div className="biz-metrics">
                  <div><b>{num(t)}</b><span>استعلام</span></div>
                  <div><b>{t ? `${fa(rate(b))}٪` : "—"}</b><span>نرخ تأیید</span></div>
                  <div><b>{st.avgScore ? fa(st.avgScore) : "—"}</b><span>میانگین امتیاز</span></div>
                </div>
                <DecisionBar st={st} total={t} />
                <footer>
                  <span className="muted small"><Activity size={13} /> {st.lastCheckAt ? `آخرین فعالیت ${ago(st.lastCheckAt)}` : `ثبت‌نام ${dayOnly(b.createdAt)}`}</span>
                  <div className="btn-row"><Actions b={b} onUpdate={onUpdate} onReject={setRejecting} /></div>
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <Card pad={false}>
          <div className="table-wrap">
            <table className="table biz-table">
              <thead><tr><th>کسب‌وکار</th><th>موبایل</th><th>وضعیت</th><th>مراحل</th><th>استعلام</th><th>نرخ تأیید</th><th>آخرین فعالیت</th><th /></tr></thead>
              <tbody>
                {list.map((b) => { const t = b._count?.creditChecks || 0; return (
                  <tr key={b.id} tabIndex={0} onClick={() => setSel(b.id)} onKeyDown={(e) => e.key === "Enter" && setSel(b.id)}>
                    <td><div className="cell-id"><Avatar name={b.name} src={b.logoUrl} size={36} /><b>{cleanName(b.name)}</b></div></td>
                    <td><span className="phone">{formatPhone(b.mobile)}</span></td>
                    <td><Badge tone={BUSINESS_STATUS[b.status].tone}>{BUSINESS_STATUS[b.status].label}</Badge></td>
                    <td><Steps b={b} /></td>
                    <td>{num(t)}</td>
                    <td>{t ? <div className="rate"><div className="bar"><i style={{ width: `${rate(b)}%` }} /></div><span>{fa(rate(b))}٪</span></div> : <span className="muted">—</span>}</td>
                    <td className="muted">{b.stats?.lastCheckAt ? ago(b.stats.lastCheckAt) : "—"}</td>
                    <td className="row-actions"><Actions b={b} onUpdate={onUpdate} onReject={setRejecting} /></td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ---- detail drawer ---- */}
      <Drawer open={!!current} onClose={() => setSel(null)} title="پروندهٔ کسب‌وکار"
        footer={current && (
          <div className="btn-row">
            {current.status !== "approved" && <button className="btn primary" disabled={busy} onClick={() => act({ status: "approved", contractSigned: true }, "کسب‌وکار فعال شد")}><Check size={16} /> تأیید و فعال‌سازی</button>}
            {current.status === "approved" && <button className="btn danger" disabled={busy} onClick={() => act({ status: "suspended" }, "کسب‌وکار تعلیق شد")}><Ban size={16} /> تعلیق</button>}
            {current.status !== "rejected" && current.status !== "approved" && <button className="btn danger" disabled={busy} onClick={() => setRejecting(current)}><XCircle size={16} /> رد درخواست</button>}
            <button className="btn" onClick={() => { setSel(null); goChecks(current.id); }}>استعلام‌ها</button>
          </div>
        )}>
        {current && (() => { const t = current._count?.creditChecks || 0, st = current.stats || {}; return (
          <div className="stack">
            <div className="drawer-hero"><Avatar name={current.name} src={current.logoUrl} size={64} /><div><h3>{cleanName(current.name)}</h3><span className="phone"><Phone size={13} />{formatPhone(current.mobile)}</span></div><Badge tone={BUSINESS_STATUS[current.status].tone}>{BUSINESS_STATUS[current.status].label}</Badge></div>
            <div className="biz-metrics big">
              <div><b>{num(t)}</b><span>استعلام</span></div><div><b>{t ? `${fa(rate(current))}٪` : "—"}</b><span>نرخ تأیید</span></div><div><b>{st.avgScore ? fa(st.avgScore) : "—"}</b><span>میانگین امتیاز</span></div>
            </div>
            <div><div className="eyebrow" style={{ marginBottom: 8 }}>ترکیب تصمیم‌ها</div><DecisionBar st={st} total={t} />
              {t > 0 && <div className="dlegend"><span><i style={{ background: "#0FAF9E" }} />تأیید {fa(st.approve)}</span><span><i style={{ background: "#FCA311" }} />بررسی {fa(st.review)}</span><span><i style={{ background: "#D64550" }} />رد {fa(st.decline)}</span></div>}
            </div>
            <div className="steps"><b>مراحل فعال‌سازی</b><Steps b={current} /></div>
            <dl className="dl">
              <div><dt><CalendarDays size={15} /> تاریخ ثبت‌نام</dt><dd>{dayOnly(current.createdAt)}</dd></div>
              <div><dt><FileSignature size={15} /> قرارداد</dt><dd>{current.contractSigned ? "امضا شده" : "امضا نشده"}</dd></div>
              <div><dt><Link2 size={15} /> Provider متصل</dt><dd>{current.providerLink?.name || "—"}</dd></div>
              <div><dt>مجموع مبلغ درخواست‌ها</dt><dd>{toman(st.totalRequested || 0)}</dd></div>
              <div><dt>آخرین فعالیت</dt><dd>{st.lastCheckAt ? ago(st.lastCheckAt) : "—"}</dd></div>
            </dl>
            {current.status === "rejected" && <div className="callout bad"><XCircle size={18} /><p><b>دلیل رد:</b> {current.rejectionReason || "—"}</p></div>}
            {current.status === "pending_docs" && <button className="btn wide" disabled={busy} onClick={() => act({ status: "pending_contract" }, "مدارک تأیید شد")}><FileCheck2 size={16} /> فقط تأیید مدارک (رفتن به مرحلهٔ قرارداد)</button>}
          </div>); })()}
      </Drawer>
      <Drawer open={!!rejecting} onClose={() => { setRejecting(null); setReason(""); }} title="رد درخواست کسب‌وکار"
        footer={<div className="btn-row">
          <button className="btn danger" disabled={reason.trim().length < 3 || busy} onClick={async () => { setBusy(true); try { await onUpdate(rejecting.id, { status: "rejected", rejectionReason: reason.trim() }, "درخواست رد شد و دلیل برای کسب‌وکار ارسال شد"); setRejecting(null); setReason(""); } finally { setBusy(false); } }}><XCircle size={16} /> ثبت رد درخواست</button>
          <button className="btn" onClick={() => { setRejecting(null); setReason(""); }}>انصراف</button></div>}>
        {rejecting && (
          <div className="stack">
            <div className="drawer-hero"><Avatar name={rejecting.name} src={rejecting.logoUrl} size={54} /><div><h3>{cleanName(rejecting.name)}</h3><span className="phone">{formatPhone(rejecting.mobile)}</span></div></div>
            <label className="field">دلیل رد (برای کسب‌وکار نمایش داده می‌شود)
              <textarea rows={5} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="مثلاً: تصویر مدارک خوانا نیست؛ لطفاً مجدداً بارگذاری کنید." />
            </label>
            <div className="btn-row">
              {["مدارک ناقص یا ناخوانا است", "اطلاعات کسب‌وکار با مدارک مطابقت ندارد", "زمینهٔ فعالیت مشمول خدمات سابقه‌نو نیست"].map((t) => <button key={t} className="chip-btn" onClick={() => setReason(t)}>{t}</button>)}
            </div>
            <span className="muted small">{fa(reason.length)} / ۵۰۰ — کسب‌وکار این دلیل را در پنل خود و به‌صورت اعلان می‌بیند.</span>
          </div>
        )}
      </Drawer>
    </div>
  );
}
