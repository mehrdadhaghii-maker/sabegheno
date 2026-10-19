import Services from "./Services.jsx";
import React, { useState } from "react";
import { Plus, Zap, Clock, AlertTriangle, RefreshCw } from "lucide-react";
import { Card, Badge, Drawer, Empty, BizLogo, Segmented } from "../ui.jsx";
import { Plug, Trash2, FlaskConical, KeyRound, Car, Contact, Power } from "lucide-react";
import { cleanName } from "../lib.js";
import { fa, num, ago, PROVIDER_STATUS } from "../lib.js";

function ProvidersTab({ rows, businesses, onCreate, onUpdate }) {
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", integrationType: "batch", businessId: "" });
  const current = sel && rows.find((p) => p.id === sel);
  const linked = new Set(rows.map((p) => p.businessId).filter(Boolean));

  async function create() {
    if (!form.name.trim()) return;
    await onCreate({ name: form.name.trim(), integrationType: form.integrationType, businessId: form.businessId || null });
    setCreating(false);
    setForm({ name: "", integrationType: "batch", businessId: "" });
  }

  return (
    <div className="stack">
      <div className="page-actions"><button className="btn primary" onClick={() => setCreating(true)}><Plus size={16} /> Provider جدید</button></div>
      {rows.length === 0 ? <Card><Empty text="هنوز Providerی ثبت نشده است." /></Card> : (
        <div className="provider-grid">
          {rows.map((p) => (
            <button key={p.id} className="provider-card" onClick={() => setSel(p.id)}>
              <div className="provider-head"><BizLogo name={p.name} src={(businesses.find((b) => b.id === p.businessId) || {}).logoUrl} size={36} radius={11} /><b style={{ flex: 1 }}>{cleanName(p.name)}</b><Badge tone={PROVIDER_STATUS[p.status].tone}>{PROVIDER_STATUS[p.status].label}</Badge></div>
              <div className="provider-type">{p.integrationType === "realtime" ? <><Zap size={14} /> لحظه‌ای</> : <><RefreshCw size={14} /> دسته‌ای (Batch)</>}</div>
              <div className="quality"><span>کیفیت داده</span><b>{fa(p.dataQuality)}٪</b></div>
              <div className="bar"><i style={{ width: `${p.dataQuality}%` }} /></div>
              <div className="provider-foot">
                <span><Clock size={13} /> {fa(p.latencyMs)} ms</span>
                <span><AlertTriangle size={13} /> خطا {fa(p.errorRate)}٪</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <Drawer open={!!current} onClose={() => setSel(null)} title={current?.name || ""}>
        {current && (
          <div className="stack">
            <label className="field">وضعیت اتصال
              <select value={current.status} onChange={(e) => onUpdate(current.id, { status: e.target.value })}>
                {Object.entries(PROVIDER_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label className="field">نوع یکپارچه‌سازی
              <select value={current.integrationType} onChange={(e) => onUpdate(current.id, { integrationType: e.target.value })}>
                <option value="realtime">لحظه‌ای (Realtime)</option>
                <option value="batch">دسته‌ای (Batch)</option>
              </select>
            </label>
            <label className="field">کسب‌وکار متصل
              <select value={current.businessId || ""} onChange={(e) => onUpdate(current.id, { businessId: e.target.value || null })}>
                <option value="">— بدون اتصال —</option>
                {businesses.filter((b) => !linked.has(b.id) || b.id === current.businessId).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <dl className="dl">
              <div><dt>کیفیت داده</dt><dd>{fa(current.dataQuality)}٪</dd></div>
              <div><dt>تأخیر</dt><dd>{fa(current.latencyMs)} ms</dd></div>
              <div><dt>نرخ خطا</dt><dd>{fa(current.errorRate)}٪</dd></div>
              <div><dt>آخرین همگام‌سازی</dt><dd>{current.lastSyncAt ? ago(current.lastSyncAt) : "—"}</dd></div>
            </dl>
          </div>
        )}
      </Drawer>

      <Drawer open={creating} onClose={() => setCreating(false)} title="ثبت Provider جدید"
        footer={<div className="btn-row"><button className="btn primary" disabled={!form.name.trim()} onClick={create}>ثبت</button></div>}>
        <div className="stack">
          <label className="field">نام Provider<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثلاً: شرکت اقساطی نمونه" /></label>
          <label className="field">نوع یکپارچه‌سازی
            <select value={form.integrationType} onChange={(e) => setForm({ ...form, integrationType: e.target.value })}>
              <option value="batch">دسته‌ای (Batch)</option><option value="realtime">لحظه‌ای (Realtime)</option>
            </select>
          </label>
          <label className="field">اتصال به کسب‌وکار (اختیاری)
            <select value={form.businessId} onChange={(e) => setForm({ ...form, businessId: e.target.value })}>
              <option value="">— بدون اتصال —</option>
              {businesses.filter((b) => !linked.has(b.id)).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
        </div>
      </Drawer>
    </div>
  );
}

const PRESETS = [
  { icon: Car, label: "تخلفات رانندگی (خودرو)", f: { key: "traffic_fines", name: "استعلام تخلفات رانندگی", unit: "تخلف", responsePath: "data.violations_count", description: "تعداد تخلفات رانندگی ثبت‌شده برای مالک خودرو" } },
  { icon: Contact, label: "نقاط منفی گواهینامه", f: { key: "license_points", name: "نقاط منفی گواهینامه", unit: "نقطه منفی", responsePath: "data.negative_points", description: "مجموع نقاط منفی گواهینامهٔ رانندگی" } },
];
const SVC_BLANK = { key: "", name: "", description: "", baseUrl: "https://", method: "GET", authType: "bearer", authName: "", apiKey: "", nationalIdParam: "nationalId", responsePath: "data.count", unit: "" };

function ServicesTab({ services, onCreate, onUpdate, onDelete, onTest }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(SVC_BLANK);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState({}); // id -> { nid, res, loading }
  const valid = /^[a-z0-9_-]{2,40}$/.test(f.key) && f.name.trim().length >= 2 && /^https?:\/\/.+\..+/.test(f.baseUrl);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  async function create() {
    setBusy(true);
    try { await onCreate({ ...f, description: f.description || undefined, authName: f.authName || undefined, apiKey: f.apiKey || undefined, unit: f.unit || undefined }); setOpen(false); setF(SVC_BLANK); } finally { setBusy(false); }
  }
  async function run(s) {
    const t = test[s.id] || {};
    setTest((x) => ({ ...x, [s.id]: { ...t, loading: true, res: null } }));
    const res = await onTest(s.id, t.nid || "");
    setTest((x) => ({ ...x, [s.id]: { ...x[s.id], loading: false, res } }));
  }

  return (
    <div className="stack">
      <div className="callout info"><Plug size={18} /><p>سرویس‌های متصل‌شده با کلید شما از سمت سرور صدا زده می‌شوند، نتیجه‌شان در جزئیات استعلام‌ها (گزارش‌ها) نمایش داده می‌شود و در بخش «سیاست اعتبار» برای ساخت قانون در دسترس‌اند. کلید API رمزنگاری‌شده ذخیره می‌شود و هرگز به مرورگر برنمی‌گردد.</p></div>
      <div className="page-actions"><button className="btn primary" onClick={() => setOpen(true)}><Plus size={16} /> اتصال سرویس جدید</button></div>
      {services.length === 0 ? <Card><Empty text="هنوز سرویس خارجی متصل نشده است. نمونه: تخلفات رانندگی یا نقاط منفی گواهینامه." /></Card> : (
        <div className="svc-grid">
          {services.map((s) => { const t = test[s.id] || {}; return (
            <Card key={s.id} className="svc-card">
              <div className="provider-head"><span className="kpi-icon navy"><Plug size={19} /></span><div style={{ flex: 1 }}><b>{s.name}</b><div className="muted small" dir="ltr" style={{ textAlign: "right" }}>{s.key}</div></div>
                <Badge tone={s.status === "connected" ? "good" : s.status === "error" ? "bad" : "neutral"}>{s.status === "connected" ? "متصل" : s.status === "error" ? "خطا" : "تست‌نشده"}</Badge></div>
              {s.description && <p className="muted small">{s.description}</p>}
              <dl className="dl">
                <div><dt>آدرس</dt><dd dir="ltr" style={{ fontSize: 12 }}>{s.baseUrl}</dd></div>
                <div><dt><KeyRound size={14} /> کلید API</dt><dd>{s.hasKey ? "ذخیره‌شده ••••••" : "—"}</dd></div>
                <div><dt>مسیر مقدار در پاسخ</dt><dd dir="ltr">{s.responsePath}</dd></div>
              </dl>
              <div className="svc-test"><input dir="ltr" inputMode="numeric" maxLength={10} placeholder="کد ملی برای تست" value={t.nid || ""} onChange={(e) => setTest((x) => ({ ...x, [s.id]: { ...t, nid: e.target.value.replace(/\D/g, "") } }))} />
                <button className="btn sm" disabled={t.loading || (t.nid || "").length !== 10} onClick={() => run(s)}><FlaskConical size={15} /> {t.loading ? "…" : "تست اتصال"}</button></div>
              {t.res && <div className={`callout ${t.res.ok ? "info" : "bad"}`}><p>{t.res.ok ? `پاسخ موفق: ${num(t.res.value)} ${s.unit || ""} (${num(t.res.ms)} ms)` : `ناموفق: ${t.res.error}`}</p></div>}
              {s.lastError && !t.res && <div className="callout bad"><p>آخرین خطا: {s.lastError}</p></div>}
              <div className="btn-row">
                <button className="btn sm" onClick={() => onUpdate(s.id, { enabled: !s.enabled })}><Power size={15} /> {s.enabled ? "غیرفعال‌سازی" : "فعال‌سازی"}</button>
                <button className="btn sm danger" onClick={() => window.confirm("سرویس و قوانین وابسته به آن حذف شود؟") && onDelete(s.id)}><Trash2 size={15} /> حذف</button>
              </div>
            </Card>); })}
        </div>
      )}

      <Drawer open={open} onClose={() => setOpen(false)} title="اتصال سرویس وب جدید"
        footer={<div className="btn-row"><button className="btn primary" disabled={!valid || busy} onClick={create}><Plug size={16} /> {busy ? "در حال ثبت…" : "ثبت و اتصال"}</button></div>}>
        <div className="stack">
          <div><div className="eyebrow" style={{ marginBottom: 8 }}>شروع سریع</div><div className="btn-row">{PRESETS.map((p) => <button key={p.label} className="chip-btn" onClick={() => set(p.f)}><p.icon size={15} /> {p.label}</button>)}</div></div>
          <label className="field">نام سرویس<input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="مثلاً: استعلام تخلفات رانندگی" /></label>
          <label className="field">کلید یکتا (انگلیسی)<input dir="ltr" value={f.key} onChange={(e) => set({ key: e.target.value.toLowerCase() })} placeholder="traffic_fines" /></label>
          <label className="field">آدرس سرویس (URL)<input dir="ltr" value={f.baseUrl} onChange={(e) => set({ baseUrl: e.target.value })} /></label>
          <div className="two"><label className="field">متد<select value={f.method} onChange={(e) => set({ method: e.target.value })}><option>GET</option><option>POST</option></select></label>
            <label className="field">نام پارامتر کد ملی<input dir="ltr" value={f.nationalIdParam} onChange={(e) => set({ nationalIdParam: e.target.value })} /></label></div>
          <div className="two"><label className="field">نوع احراز هویت<select value={f.authType} onChange={(e) => set({ authType: e.target.value })}><option value="bearer">Bearer Token</option><option value="header">Header سفارشی</option><option value="query">Query Param</option><option value="none">بدون احراز</option></select></label>
            {(f.authType === "header" || f.authType === "query") && <label className="field">نام {f.authType === "header" ? "هدر" : "پارامتر"}<input dir="ltr" value={f.authName} onChange={(e) => set({ authName: e.target.value })} placeholder={f.authType === "header" ? "x-api-key" : "api_key"} /></label>}</div>
          {f.authType !== "none" && <label className="field">کلید دسترسی / API Key<input type="password" dir="ltr" autoComplete="off" value={f.apiKey} onChange={(e) => set({ apiKey: e.target.value })} /></label>}
          <div className="two"><label className="field">مسیر مقدار عددی در پاسخ JSON<input dir="ltr" value={f.responsePath} onChange={(e) => set({ responsePath: e.target.value })} placeholder="data.count" /></label>
            <label className="field">واحد<input value={f.unit} onChange={(e) => set({ unit: e.target.value })} placeholder="تخلف" /></label></div>
          <label className="field">توضیح (اختیاری)<input value={f.description} onChange={(e) => set({ description: e.target.value })} /></label>
        </div>
      </Drawer>
    </div>
  );
}

export default function Providers({ rows, businesses, services, onCreate, onUpdate, svc, reload }) {
  const [tab, setTab] = useState("providers");
  return (
    <div className="stack">
      <div className="page-actions" style={{ justifyContent: "flex-start" }}>
        <Segmented value={tab} onChange={setTab} options={[["providers", "Providerها (کسب‌وکارها)", rows.length], ["services", "سرویس‌های خارجی", services.length]]} />
      </div>
      {tab === "providers" ? <ProvidersTab rows={rows} businesses={businesses} onCreate={onCreate} onUpdate={onUpdate} /> : <Services onChanged={reload} />}
    </div>
  );
}
