import React, { useEffect, useMemo, useState } from "react";
import { Save, Plus, Trash2, Layers, Globe2, Building2, ShieldAlert, Gauge, Wallet, Ban, Plug, Info } from "lucide-react";
import { Card, Badge, Drawer, Empty, BizLogo, MoneyInput } from "../ui.jsx";
import { fa, num, cleanName, METRICS, OPERATORS, ACTIONS } from "../lib.js";

const DEFAULTS = { minScore: 700, reviewMinScore: 550, maxActiveBounced: 0, maxDelayDays: 30, overlapWindowHours: 72, overlapMinBusinesses: 1, overlapAction: "review", overlapLimitPercent: 50, maxRequestedAmount: 0, maxExternalExposure: 0, blockOnBadDebt: true };
const MONEY_METRICS = ["requestedAmount", "externalExposure"];
const KEYS = Object.keys(DEFAULTS);

function Slider({ label, hint, value, onChange, min, max, step = 1, unit = "" }) {
  return (
    <div className="slider">
      <div className="slider-top"><label>{label}</label><b>{num(value)} {unit}</b></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <div className="slider-scale"><span>{num(min)}</span>{hint && <em>{hint}</em>}<span>{num(max)}</span></div>
    </div>
  );
}

function Section({ icon: Icon, tone = "teal", title, sub, children }) {
  return (
    <Card className="policy-card">
      <div className="policy-head"><span className={`kpi-icon ${tone}`}><Icon size={20} /></span><div><h3>{title}</h3><p>{sub}</p></div></div>
      <div className="stack lg">{children}</div>
    </Card>
  );
}

export default function Policy({ policy, rules, businesses, services, checks, onSave, onCreateRule, onUpdateRule, onDeleteRule }) {
  const [v, setV] = useState({ ...DEFAULTS, ...(policy || {}) });
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const blank = { name: "", businessId: "", metric: "score", operator: "lt", value: 0, action: "review", actionValue: 0, message: "" };
  const [rule, setRule] = useState(blank);
  useEffect(() => { if (policy) setV({ ...DEFAULTS, ...policy }); }, [policy]);

  const dirty = policy && KEYS.some((k) => v[k] !== (policy[k] ?? DEFAULTS[k]));
  const set = (patch) => setV((x) => ({ ...x, ...patch }));

  const sim = useMemo(() => {
    const n = checks.length;
    if (!n) return null;
    const at = (t) => checks.filter((c) => c.score >= t).length;
    const now = at(v.minScore), cur = at(policy?.minScore ?? v.minScore);
    return { n, now, pct: Math.round((now / n) * 100), diff: now - cur };
  }, [checks, v.minScore, policy]);

  const metricOptions = [...Object.entries(METRICS), ...services.filter((s) => s.enabled).map((s) => [`service:${s.key}`, `${s.name}${s.unit ? ` (${s.unit})` : ""}`])];
  const metricLabel = (m) => METRICS[m] || services.find((s) => `service:${s.key}` === m)?.name || m;
  const isMoney = MONEY_METRICS.includes(rule.metric);

  async function save() {
    setSaving(true);
    try { await onSave(Object.fromEntries(KEYS.map((k) => [k, v[k]]))); } finally { setSaving(false); }
  }
  async function createRule() {
    const needsValue = ["cap_limit", "reduce_limit"].includes(rule.action);
    await onCreateRule({ name: rule.name.trim(), businessId: rule.businessId || null, metric: rule.metric, operator: rule.operator, value: Number(rule.value) || 0, action: rule.action, actionValue: needsValue ? Number(rule.actionValue) || 0 : null, message: rule.message.trim() || null });
    setOpen(false); setRule(blank);
  }
  const sentence = (r) => `اگر ${metricLabel(r.metric)} ${OPERATORS[r.operator]} ${num(r.value)} بود ← ${ACTIONS[r.action]}${r.actionValue != null ? ` ${num(r.actionValue)}${r.action === "reduce_limit" ? "٪" : " تومان"}` : ""}`;

  return (
    <div className="stack">
      {dirty && (
        <div className="savebar"><Info size={18} /><span>تغییرات ذخیره‌نشده دارید؛ فقط برای استعلام‌های جدید اعمال می‌شود.</span>
          <button className="btn" onClick={() => setV({ ...DEFAULTS, ...policy })}>بازگردانی</button>
          <button className="btn primary" disabled={saving} onClick={save}><Save size={16} /> {saving ? "در حال ذخیره…" : "ذخیرهٔ سیاست"}</button></div>
      )}

      <div className="policy-grid">
        <Section icon={Gauge} title="آستانه‌های امتیاز" sub="مرز بین تأیید خودکار، ارجاع به بررسی و رد">
          <div className="zones" aria-label="نوار مناطق تصمیم">
            <i style={{ flex: v.reviewMinScore - 300, background: "#D64550" }}><span>رد</span></i>
            <i style={{ flex: Math.max(1, v.minScore - v.reviewMinScore), background: "#FCA311" }}><span>بررسی</span></i>
            <i style={{ flex: 900 - v.minScore, background: "#0FAF9E" }}><span>تأیید</span></i>
          </div>
          <Slider label="حداقل امتیاز تأیید خودکار" value={v.minScore} min={300} max={900} step={10} onChange={(x) => set({ minScore: x, reviewMinScore: Math.min(v.reviewMinScore, x) })} />
          <Slider label="حداقل امتیاز برای «نیازمند بررسی» (زیر آن رد)" value={v.reviewMinScore} min={300} max={v.minScore} step={10} onChange={(x) => set({ reviewMinScore: x })} />
        </Section>

        <Section icon={Ban} tone="amber" title="چک برگشتی و تأخیر" sub="حدود مجاز سوابق منفی مشتری">
          <Slider label="حداکثر چک برگشتی فعال" value={v.maxActiveBounced} min={0} max={10} unit="چک" onChange={(x) => set({ maxActiveBounced: x })} />
          <Slider label="حداکثر تأخیر مجاز" value={v.maxDelayDays} min={0} max={180} step={5} unit="روز" onChange={(x) => set({ maxDelayDays: x })} />
        </Section>

        <Section icon={ShieldAlert} tone="amber" title="تشخیص هم‌پوشانی" sub="یک کد ملی، چند کسب‌وکار، هم‌زمان">
          <Slider label="بازهٔ بررسی" value={v.overlapWindowHours} min={1} max={168} unit="ساعت" onChange={(x) => set({ overlapWindowHours: x })} />
          <Slider label="حداقل تعداد کسب‌وکارهای دیگر برای هشدار" value={v.overlapMinBusinesses} min={1} max={5} unit="کسب‌وکار" onChange={(x) => set({ overlapMinBusinesses: x })} />
          <Slider label="سقف پیشنهادی هنگام هشدار (درصد از حالت عادی)" value={v.overlapLimitPercent} min={0} max={100} step={5} unit="٪" onChange={(x) => set({ overlapLimitPercent: x })} />
          <div className="field">اقدام هنگام هشدار
            <div className="segmented"><button className={v.overlapAction === "review" ? "on" : ""} onClick={() => set({ overlapAction: "review" })}>ارجاع به بررسی</button><button className={v.overlapAction === "decline" ? "on" : ""} onClick={() => set({ overlapAction: "decline" })}>رد درخواست</button></div></div>
        </Section>

        <Section icon={Wallet} tone="navy" title="سقف‌های مالی و بدحسابی" sub="۰ یعنی بدون محدودیت">
          <label className="field">حداکثر مبلغ هر درخواست<MoneyInput value={v.maxRequestedAmount} onChange={(x) => set({ maxRequestedAmount: x })} placeholder="بدون محدودیت" /></label>
          <label className="field">حداکثر تعهد فعال نزد سایر کسب‌وکارها<MoneyInput value={v.maxExternalExposure} onChange={(x) => set({ maxExternalExposure: x })} placeholder="بدون محدودیت" /></label>
          <label className="switch-row">
            <input type="checkbox" checked={v.blockOnBadDebt} onChange={(e) => set({ blockOnBadDebt: e.target.checked })} />
            <span className="switch" /><div><b>مسدودسازی بدحسابان در کل شبکه</b><small>اگر یک کسب‌وکار فردی را بدحساب ثبت کند، هیچ کسب‌وکار دیگری به او اعتبار نمی‌دهد.</small></div>
          </label>
        </Section>
      </div>

      {sim && (
        <Card eyebrow="SIMULATION" title="پیش‌نمایش اثر آستانهٔ تأیید">
          <div className="sim-row"><div className="sim-big"><b>{fa(sim.pct)}٪</b><span>از {num(sim.n)} استعلام اخیر با این آستانه واجد تأیید خودکار بودند{dirty && sim.diff !== 0 ? ` (${sim.diff > 0 ? "+" : ""}${num(sim.diff)} نسبت به الان)` : ""}</span></div><div className="bar lg" style={{ flex: 1 }}><i style={{ width: `${sim.pct}%` }} /></div></div>
        </Card>
      )}

      <Card eyebrow="CUSTOM RULES" title="قوانین سفارشی (سراسری یا ویژهٔ یک کسب‌وکار)"
        action={<button className="btn primary" onClick={() => setOpen(true)}><Plus size={16} /> قانون جدید</button>} pad={false}>
        {rules.length === 0 ? <div className="card-body"><Empty text="هنوز قانون سفارشی تعریف نشده است. مثال: «اگر نقاط منفی گواهینامه بیشتر از ۱۰ بود ← رد»" /></div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>نام قانون</th><th>دامنه</th><th>شرط و اقدام</th><th>فعال</th><th /></tr></thead>
            <tbody>{rules.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b></td>
                <td>{r.business ? <span className="chip-on"><BizLogo name={r.business.name} size={20} radius={6} />{cleanName(r.business.name)}</span> : <Badge tone="info"><Globe2 size={12} /> همهٔ کسب‌وکارها</Badge>}</td>
                <td className="muted">{sentence(r)}</td>
                <td><label className="switch-only"><input type="checkbox" checked={r.enabled} onChange={(e) => onUpdateRule(r.id, { enabled: e.target.checked })} /><span className="switch" /></label></td>
                <td className="row-actions"><button className="icon-btn" aria-label="حذف" onClick={() => window.confirm("این قانون حذف شود؟") && onDeleteRule(r.id)}><Trash2 size={16} /></button></td>
              </tr>))}</tbody></table></div>
        )}
      </Card>

      <Drawer open={open} onClose={() => setOpen(false)} title="قانون سفارشی جدید"
        footer={<div className="btn-row"><button className="btn primary" disabled={rule.name.trim().length < 2} onClick={createRule}><Layers size={16} /> ثبت قانون</button></div>}>
        <div className="stack">
          <label className="field">نام قانون<input value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} placeholder="مثلاً: رد مشتری با تخلف رانندگی زیاد" /></label>
          <label className="field">دامنه اعمال
            <select value={rule.businessId} onChange={(e) => setRule({ ...rule, businessId: e.target.value })}>
              <option value="">همهٔ کسب‌وکارها</option>
              {businesses.filter((b) => b.status === "approved").map((b) => <option key={b.id} value={b.id}>{cleanName(b.name)}</option>)}
            </select></label>
          <div className="rule-builder">
            <span className="rb-if">اگر</span>
            <select value={rule.metric} onChange={(e) => setRule({ ...rule, metric: e.target.value })}>{metricOptions.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <select value={rule.operator} onChange={(e) => setRule({ ...rule, operator: e.target.value })}>{Object.entries(OPERATORS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {isMoney ? <MoneyInput value={rule.value} onChange={(x) => setRule({ ...rule, value: x })} /> : <input type="number" dir="ltr" value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} />}
          </div>
          <div className="rule-builder">
            <span className="rb-if then">آنگاه</span>
            <select value={rule.action} onChange={(e) => setRule({ ...rule, action: e.target.value })}>{Object.entries(ACTIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {rule.action === "cap_limit" && <MoneyInput value={rule.actionValue} onChange={(x) => setRule({ ...rule, actionValue: x })} />}
            {rule.action === "reduce_limit" && <MoneyInput value={rule.actionValue} suffix="٪ باقی بماند" onChange={(x) => setRule({ ...rule, actionValue: Math.min(100, x) })} />}
          </div>
          <label className="field">پیام برای نتیجهٔ استعلام (اختیاری)<textarea rows={3} value={rule.message} onChange={(e) => setRule({ ...rule, message: e.target.value })} /></label>
          {services.filter((s) => s.enabled).length > 0 && <div className="callout info"><Plug size={18} /><p>سرویس‌های متصل ({services.filter((s) => s.enabled).map((s) => s.name).join("، ")}) در فهرست «اگر» قابل انتخاب هستند.</p></div>}
        </div>
      </Drawer>
    </div>
  );
}
