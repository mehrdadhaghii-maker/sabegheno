import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Plug, Plus, Pencil, Trash2, Play, Loader2, Check, X, ChevronLeft, ChevronRight, Zap, ShieldCheck, Gauge, Clock, Globe, KeyRound, ListPlus } from "lucide-react";
import { adminApi } from "../api.js";
import { Badge, Card, Drawer, Empty, Skeleton } from "../ui.jsx";
import { fa } from "../lib.js";
import { tehranDateTime } from "./monitor/format.js";

const PRESETS = [
  { id: "fines", title: "تخلفات رانندگی (خودرو)", icon: "🚗", d: { key: "traffic-fines", name: "تخلفات رانندگی", category: "رانندگی", unit: "فقره", method: "GET", nationalIdParam: "nationalId", outputs: [{ key: "count", label: "تعداد تخلف", path: "data.count", type: "number" }], scoreImpact: { enabled: true, output: "count", mode: "per_unit", perUnit: 5, cap: 40, label: "تخلفات رانندگی" } } },
  { id: "points", title: "نقاط منفی گواهینامه", icon: "🪪", d: { key: "license-points", name: "نقاط منفی گواهینامه", category: "رانندگی", unit: "نقطه", method: "GET", nationalIdParam: "nationalId", outputs: [{ key: "points", label: "نقاط منفی", path: "data.negativePoints", type: "number" }], scoreImpact: { enabled: true, output: "points", mode: "threshold", threshold: 10, points: 30, label: "نقاط منفی گواهینامه" } } },
  { id: "post", title: "سرویس POST با بدنهٔ JSON", icon: "🧩", d: { key: "custom-post", name: "سرویس سفارشی", category: "عمومی", method: "POST", bodyTemplate: '{\n  "nationalId": "{{nationalId}}",\n  "birthDate": "{{birthDate}}"\n}', outputs: [{ key: "value", label: "مقدار", path: "data.value", type: "number" }] } },
  { id: "blank", title: "از صفر", icon: "✨", d: {} },
];
const BLANK = { key: "", name: "", description: "", category: "", baseUrl: "https://", method: "GET", authType: "bearer", authName: "", apiKey: "", headers: [], nationalIdParam: "nationalId", queryParams: [], bodyTemplate: "", outputs: [], scoreImpact: { enabled: false, mode: "per_unit", perUnit: 5, cap: 40 }, timeoutMs: 6000, unit: "" };
const AUTH = [["none", "بدون احراز"], ["bearer", "Bearer Token"], ["header", "کلید در Header"], ["query", "کلید در Query"], ["basic", "Basic (user:pass)"]];
const STEPS = ["اطلاعات", "اتصال", "درخواست", "تست و خروجی", "اثر بر امتیاز"];
const HOLES = ["{{nationalId}}", "{{birthDate}}", "{{now}}"];
const MASK = "••••••••";

function Field({ label, hint, error, children }) { return <label className="sv-field"><span>{label}</span>{children}{hint && !error && <small>{hint}</small>}{error && <small className="bad">{error}</small>}</label>; }

function KV({ rows, onChange, namePh = "نام", valuePh = "مقدار", holes }) {
  const set = (i, p) => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <div className="sv-kv">
      {rows.map((r, i) => (
        <div key={i} className="sv-kv-row">
          <input dir="ltr" value={r.name} placeholder={namePh} onChange={(e) => set(i, { name: e.target.value })} />
          <input dir="ltr" value={r.value} placeholder={valuePh} onChange={(e) => set(i, { value: e.target.value })} />
          <button type="button" className="icon-btn" aria-label="حذف" onClick={() => onChange(rows.filter((_, j) => j !== i))}><X size={15} /></button>
        </div>
      ))}
      <div className="sv-kv-add">
        <button type="button" className="btn sm" onClick={() => onChange([...rows, { name: "", value: "" }])}><Plus size={14} /> افزودن</button>
        {holes && <span className="sv-holes">جایگزین‌ها: {HOLES.map((h) => <code key={h} dir="ltr">{h}</code>)}</span>}
      </div>
    </div>
  );
}

function Wizard({ initial, existing, onClose, onSaved }) {
  const [f, setF] = useState(initial);
  const [step, setStep] = useState(0);
  const [nid, setNid] = useState(""), [bd, setBd] = useState("");
  const [test, setTest] = useState(null), [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false), [err, setErr] = useState("");
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const imp = f.scoreImpact || {};

  const errors = useMemo(() => ({
    name: f.name.trim().length < 2 ? "نام سرویس را وارد کنید" : "",
    key: !existing && !/^[a-z0-9_-]{2,40}$/.test(f.key) ? "فقط حروف کوچک انگلیسی، عدد، - و _ (حداقل ۲ کاراکتر)" : "",
    baseUrl: !/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(f.baseUrl) ? "آدرس کامل سرویس را وارد کنید (https://…)" : "",
    outputs: f.outputs.length === 0 ? "حداقل یک خروجی لازم است — در مرحلهٔ «تست و خروجی» از پاسخ انتخاب کنید" : f.outputs.some((o) => !o.key || !o.path) ? "کلید و مسیر هر خروجی را کامل کنید" : "",
    body: f.method === "POST" && f.bodyTemplate && (() => { try { JSON.parse(f.bodyTemplate.replace(/\{\{\s*(nationalId|birthDate|now)\s*\}\}/g, "x")); return ""; } catch { return "قالب بدنه JSON معتبر نیست"; } })(),
  }), [f, existing]);
  const stepErr = [errors.name || errors.key, errors.baseUrl, errors.body, errors.outputs, ""];
  const canSave = !errors.name && !errors.key && !errors.baseUrl && !errors.outputs && !errors.body;

  const draft = () => ({
    ...(existing ? {} : { key: f.key }), name: f.name, description: f.description || undefined, category: f.category || undefined, baseUrl: f.baseUrl, method: f.method, authType: f.authType,
    authName: f.authName || undefined, ...(f.apiKey ? { apiKey: f.apiKey } : {}), headers: f.headers.filter((h) => h.name), nationalIdParam: f.nationalIdParam || "nationalId",
    queryParams: f.queryParams.filter((p) => p.name), bodyTemplate: f.bodyTemplate || undefined, outputs: f.outputs.length ? f.outputs : undefined, timeoutMs: Number(f.timeoutMs) || 6000, unit: f.unit || undefined,
    scoreImpact: imp.enabled ? { enabled: true, output: imp.output || f.outputs[0]?.key, mode: imp.mode || "per_unit", perUnit: Number(imp.perUnit) || 0, cap: Number(imp.cap) || 0, threshold: Number(imp.threshold) || 0, points: Number(imp.points) || 0, label: imp.label || undefined } : { enabled: false },
  });

  async function runTest() {
    if (!/^\d{10}$/.test(nid)) { setTest({ error: "کد ملی ۱۰ رقمی برای تست وارد کنید" }); return; }
    if (errors.baseUrl) { setTest({ error: errors.baseUrl }); return; }
    setTesting(true); setTest(null);
    try { setTest(await adminApi.previewService(draft(), nid, bd || undefined, existing?.id)); } catch (e) { setTest({ error: e.message }); } finally { setTesting(false); }
  }

  const addOutput = (row) => {
    const base = String(row.path).split(/[.\[\]]/).filter(Boolean).pop() || "value";
    let key = base.toLowerCase().replace(/[^a-z0-9_]/g, "") || "value"; let n = 2;
    while (f.outputs.some((o) => o.key === key)) key = `${base.toLowerCase().replace(/[^a-z0-9_]/g, "") || "value"}${n++}`;
    set({ outputs: [...f.outputs, { key, label: base, path: row.path, type: row.type === "text" ? "text" : row.type === "boolean" ? "boolean" : row.type === "count" ? "count" : "number" }] });
  };
  const upOut = (i, p) => set({ outputs: f.outputs.map((o, j) => (j === i ? { ...o, ...p } : o)) });
  const valueOf = (key) => test?.outputs?.find((o) => o.key === key);

  async function save() {
    setSaving(true); setErr("");
    try {
      const body = draft();
      const saved = existing ? await adminApi.updateService(existing.id, body) : await adminApi.createService(body);
      onSaved(saved);
    } catch (e) { setErr(e.fields?.[0] ? `${e.fields[0].path}: ${e.fields[0].message}` : e.message); setSaving(false); }
  }

  return (
    <div className="sv-wiz">
      <ol className="sv-steps">{STEPS.map((t, i) => <li key={t} className={i === step ? "on" : i < step ? "done" : ""}><button type="button" onClick={() => setStep(i)}><i>{i < step ? <Check size={13} /> : fa(i + 1)}</i>{t}</button></li>)}</ol>

      {step === 0 && (
        <div className="sv-pane">
          {!existing && <div className="sv-presets"><b>شروع سریع</b>{PRESETS.map((p) => <button key={p.id} type="button" className="chip-btn" onClick={() => setF({ ...BLANK, ...p.d })}><span>{p.icon}</span>{p.title}</button>)}</div>}
          <Field label="نام سرویس" error={errors.name}><input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="مثلاً تخلفات رانندگی" /></Field>
          <Field label="کلید یکتا (انگلیسی)" hint="در قوانین سفارشی به‌صورت service:کلید استفاده می‌شود؛ بعد از ساخت قابل تغییر نیست" error={errors.key}><input dir="ltr" value={f.key} disabled={!!existing} onChange={(e) => set({ key: e.target.value.toLowerCase() })} placeholder="traffic-fines" /></Field>
          <div className="sv-two"><Field label="دسته‌بندی"><input value={f.category || ""} onChange={(e) => set({ category: e.target.value })} placeholder="رانندگی، بیمه، …" /></Field><Field label="واحد نمایش"><input value={f.unit || ""} onChange={(e) => set({ unit: e.target.value })} placeholder="فقره" /></Field></div>
          <Field label="توضیح (اختیاری)"><textarea rows={2} value={f.description || ""} onChange={(e) => set({ description: e.target.value })} /></Field>
        </div>
      )}

      {step === 1 && (
        <div className="sv-pane">
          <Field label="آدرس سرویس (URL)" error={errors.baseUrl} hint="آدرس‌های داخلی (localhost، IP خصوصی) به‌دلیل امنیت مسدودند"><input dir="ltr" value={f.baseUrl} onChange={(e) => set({ baseUrl: e.target.value.trim() })} placeholder="https://api.example.ir/v1/fines" /></Field>
          <div className="sv-two">
            <Field label="متد"><div className="sv-seg">{["GET", "POST"].map((m) => <button key={m} type="button" className={f.method === m ? "on" : ""} onClick={() => set({ method: m })}>{m}</button>)}</div></Field>
            <Field label="مهلت پاسخ (میلی‌ثانیه)"><input dir="ltr" inputMode="numeric" value={f.timeoutMs} onChange={(e) => set({ timeoutMs: e.target.value.replace(/\D/g, "") })} /></Field>
          </div>
          <Field label="نوع احراز هویت"><div className="sv-seg wrap">{AUTH.map(([k, l]) => <button key={k} type="button" className={f.authType === k ? "on" : ""} onClick={() => set({ authType: k })}>{l}</button>)}</div></Field>
          {["header", "query"].includes(f.authType) && <Field label={f.authType === "header" ? "نام Header" : "نام پارامتر Query"}><input dir="ltr" value={f.authName || ""} onChange={(e) => set({ authName: e.target.value })} placeholder={f.authType === "header" ? "x-api-key" : "api_key"} /></Field>}
          {f.authType !== "none" && <Field label={f.authType === "basic" ? "نام‌کاربری:رمز" : "کلید دسترسی / API Key / Token"} hint={existing?.hasKey ? "کلید قبلی ذخیره شده است؛ فقط برای تغییر، مقدار جدید وارد کنید (رمزنگاری AES-256 ذخیره می‌شود)" : "به‌صورت رمزنگاری‌شده ذخیره می‌شود و دوباره نمایش داده نمی‌شود"}><input dir="ltr" type="password" autoComplete="off" value={f.apiKey} onChange={(e) => set({ apiKey: e.target.value })} placeholder={existing?.hasKey ? MASK : ""} /></Field>}
          <Field label="Headerهای سفارشی" hint="مثلاً X-Tenant — مقدارها هم رمزنگاری ذخیره می‌شوند"><KV rows={f.headers} onChange={(headers) => set({ headers })} namePh="Header" holes /></Field>
        </div>
      )}

      {step === 2 && (
        <div className="sv-pane">
          <p className="sv-note">مشخص کنید کد ملی (و در صورت نیاز تاریخ تولد) چگونه برای سرویس ارسال شود.</p>
          {f.method === "GET" && !f.queryParams.length && <Field label="نام پارامتر کد ملی (حالت ساده)" hint="اگر پارامترهای دقیق‌تری لازم است، پایین‌تر «افزودن» بزنید"><input dir="ltr" value={f.nationalIdParam} onChange={(e) => set({ nationalIdParam: e.target.value })} placeholder="nationalId" /></Field>}
          <Field label={f.method === "GET" ? "پارامترهای Query (حالت پیشرفته)" : "پارامترهای Query (اختیاری)"}><KV rows={f.queryParams} onChange={(queryParams) => set({ queryParams })} namePh="نام" valuePh="{{nationalId}}" holes /></Field>
          {f.method === "POST" && <Field label="بدنهٔ JSON" error={errors.body} hint={'خالی = {"nationalId": …} با نام پارامتر مرحلهٔ قبل'}><textarea dir="ltr" rows={7} className="sv-code" value={f.bodyTemplate || ""} onChange={(e) => set({ bodyTemplate: e.target.value })} placeholder={'{\n  "nationalId": "{{nationalId}}"\n}'} /></Field>}
          <div className="sv-holes-row">{HOLES.map((h) => <button key={h} type="button" className="chip-btn" onClick={() => f.method === "POST" ? set({ bodyTemplate: `${f.bodyTemplate || ""}${h}` }) : navigator.clipboard?.writeText(h)}><code dir="ltr">{h}</code></button>)}</div>
        </div>
      )}

      {step === 3 && (
        <div className="sv-pane">
          <div className="sv-test">
            <Field label="کد ملی نمونه برای تست"><input dir="ltr" inputMode="numeric" maxLength={10} value={nid} onChange={(e) => setNid(e.target.value.replace(/\D/g, ""))} placeholder="0012345678" /></Field>
            <Field label="تاریخ تولد شمسی (اختیاری)"><input dir="ltr" value={bd} onChange={(e) => setBd(e.target.value)} placeholder="1371/5/12" /></Field>
            <button type="button" className="btn primary" disabled={testing} onClick={runTest}>{testing ? <Loader2 size={16} className="spin-i" /> : <Play size={16} />} ارسال درخواست آزمایشی</button>
          </div>

          {test?.error && !test.preview && <div className="callout bad"><p>{test.error}</p></div>}
          {test?.preview && (
            <div className="sv-console">
              <div className="sv-res-head"><Badge tone={test.ok ? "good" : "bad"}>{test.ok ? "موفق" : "ناموفق"}</Badge>{test.status != null && <code dir="ltr">HTTP {test.status}</code>}<span><Clock size={13} /> {fa(test.ms)} ms</span>{test.error && <span className="bad">{test.error}</span>}</div>
              <details><summary>درخواست ارسال‌شده (کلیدها مخفی‌اند)</summary><pre dir="ltr">{`${test.preview.method} ${test.preview.url}\n${Object.entries(test.preview.headers).map(([k, v]) => `${k}: ${v}`).join("\n")}${test.preview.body ? `\n\n${test.preview.body}` : ""}`}</pre></details>
              {test.sample && <details open={test.ok}><summary>پاسخ سرویس</summary><pre dir="ltr">{test.sample}</pre></details>}
              {test.paths?.length > 0 && (
                <div className="sv-paths"><b><ListPlus size={14} /> روی یک مقدار کلیک کنید تا به‌عنوان خروجی اضافه شود</b>
                  {test.paths.map((p) => <button key={p.path} type="button" className="sv-path" onClick={() => addOutput(p)}><code dir="ltr">{p.path}</code><span>{String(p.value).slice(0, 40)}</span><Plus size={13} /></button>)}
                </div>
              )}
            </div>
          )}

          <Field label="خروجی‌ها" error={errors.outputs && step === 3 ? errors.outputs : ""}>
            <div className="sv-outs">
              {f.outputs.length === 0 && <p className="sv-note">هنوز خروجی‌ای ندارید. پس از تست، مسیر مقدار را از پاسخ انتخاب کنید یا دستی بنویسید.</p>}
              {f.outputs.map((o, i) => {
                const ev = valueOf(o.key);
                return (
                  <div key={i} className="sv-out">
                    <input dir="ltr" value={o.key} placeholder="کلید" onChange={(e) => upOut(i, { key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} />
                    <input value={o.label || ""} placeholder="عنوان" onChange={(e) => upOut(i, { label: e.target.value })} />
                    <input dir="ltr" value={o.path} placeholder="data.items[0].count" onChange={(e) => upOut(i, { path: e.target.value })} />
                    <select value={o.type} onChange={(e) => upOut(i, { type: e.target.value })}><option value="number">عدد</option><option value="count">تعداد آرایه</option><option value="boolean">بله/خیر</option><option value="text">متن</option></select>
                    <span className={`sv-val ${ev ? (ev.ok ? "ok" : "bad") : ""}`}>{ev ? (ev.ok ? String(ev.value) : ev.error) : "—"}</span>
                    <button type="button" className="icon-btn" aria-label="حذف" onClick={() => set({ outputs: f.outputs.filter((_, j) => j !== i) })}><X size={15} /></button>
                  </div>
                );
              })}
              <button type="button" className="btn sm" onClick={() => set({ outputs: [...f.outputs, { key: `value${f.outputs.length + 1}`, label: "", path: "", type: "number" }] })}><Plus size={14} /> خروجی دستی</button>
            </div>
          </Field>
        </div>
      )}

      {step === 4 && (
        <div className="sv-pane">
          <label className="sv-switch"><input type="checkbox" checked={!!imp.enabled} onChange={(e) => set({ scoreImpact: { ...imp, enabled: e.target.checked, output: imp.output || f.outputs[0]?.key } })} /><span /><b>کسر امتیاز بر اساس نتیجهٔ این سرویس</b></label>
          {imp.enabled ? (
            <>
              <div className="sv-two">
                <Field label="خروجی مؤثر"><select value={imp.output || ""} onChange={(e) => set({ scoreImpact: { ...imp, output: e.target.value } })}>{f.outputs.map((o) => <option key={o.key} value={o.key}>{o.label || o.key}</option>)}</select></Field>
                <Field label="روش"><div className="sv-seg">{[["per_unit", "به‌ازای هر واحد"], ["threshold", "آستانه‌ای"]].map(([k, l]) => <button key={k} type="button" className={(imp.mode || "per_unit") === k ? "on" : ""} onClick={() => set({ scoreImpact: { ...imp, mode: k } })}>{l}</button>)}</div></Field>
              </div>
              {(imp.mode || "per_unit") === "per_unit" ? (
                <div className="sv-two"><Field label="امتیاز کسرشده برای هر واحد"><input dir="ltr" inputMode="numeric" value={imp.perUnit ?? ""} onChange={(e) => set({ scoreImpact: { ...imp, perUnit: e.target.value.replace(/\D/g, "") } })} /></Field><Field label="سقف کل کسر"><input dir="ltr" inputMode="numeric" value={imp.cap ?? ""} onChange={(e) => set({ scoreImpact: { ...imp, cap: e.target.value.replace(/\D/g, "") } })} /></Field></div>
              ) : (
                <div className="sv-two"><Field label="اگر مقدار از این عدد بیشتر یا مساوی بود"><input dir="ltr" inputMode="numeric" value={imp.threshold ?? ""} onChange={(e) => set({ scoreImpact: { ...imp, threshold: e.target.value.replace(/\D/g, "") } })} /></Field><Field label="این‌قدر امتیاز کسر شود"><input dir="ltr" inputMode="numeric" value={imp.points ?? ""} onChange={(e) => set({ scoreImpact: { ...imp, points: e.target.value.replace(/\D/g, "") } })} /></Field></div>
              )}
              <Field label="عنوان در گزارش" hint="در بخش «تحلیل امتیاز» گزارش چاپ می‌شود"><input value={imp.label || ""} onChange={(e) => set({ scoreImpact: { ...imp, label: e.target.value } })} placeholder={f.name} /></Field>
            </>
          ) : <p className="sv-note">بدون کسر امتیاز: نتیجه فقط در گزارش دیده می‌شود و می‌توانید با «قانون سفارشی» (metric: <code dir="ltr">service:{f.key || "کلید"}</code>) تصمیم‌گیری را تغییر دهید.</p>}
        </div>
      )}

      {err && <div className="callout bad"><p>{err}</p></div>}
      <footer className="sv-foot">
        <button type="button" className="btn" disabled={step === 0} onClick={() => setStep(step - 1)}><ChevronRight size={16} /> قبلی</button>
        {step < STEPS.length - 1 ? <button type="button" className="btn primary" onClick={() => setStep(step + 1)}>بعدی <ChevronLeft size={16} /></button> : null}
        <button type="button" className="btn primary sv-save" disabled={!canSave || saving} onClick={save} title={canSave ? "" : stepErr.find(Boolean)}>{saving ? <Loader2 size={16} className="spin-i" /> : <Check size={16} />} {existing ? "ذخیرهٔ تغییرات" : "ساخت سرویس"}</button>
      </footer>
      {!canSave && <p className="sv-note bad">برای ذخیره: {stepErr.find(Boolean)}</p>}
    </div>
  );
}

const STATUS = { connected: ["متصل", "good"], error: ["خطا", "bad"], untested: ["تست‌نشده", "neutral"] };

export default function Services({ onChanged }) {
  const [rows, setRows] = useState(null), [err, setErr] = useState("");
  const [wiz, setWiz] = useState(null);           // { existing?, initial }
  const [testing, setTesting] = useState({}), [nidFor, setNidFor] = useState({});
  const load = useCallback(() => adminApi.services().then((r) => { setRows(r); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  const done = () => { setWiz(null); load(); onChanged?.(); };

  async function quickTest(s) {
    const nid = nidFor[s.id];
    if (!/^\d{10}$/.test(nid || "")) { setNidFor((x) => ({ ...x, [s.id]: nid || "", [`${s.id}:e`]: "کد ملی ۱۰ رقمی" })); return; }
    setTesting((x) => ({ ...x, [s.id]: true }));
    try { await adminApi.testService(s.id, nid); } catch { /* the result is stored server-side */ }
    setTesting((x) => ({ ...x, [s.id]: false })); load();
  }
  async function toggle(s) { await adminApi.updateService(s.id, { enabled: !s.enabled }); load(); onChanged?.(); }
  async function del(s) { if (window.confirm(`سرویس «${s.name}» و قوانین وابسته به آن حذف شود؟`)) { await adminApi.deleteService(s.id); done(); } }
  const edit = (s) => setWiz({ existing: s, initial: { ...BLANK, ...s, apiKey: "", headers: s.headers || [], queryParams: s.queryParams || [], outputs: s.outputs || [], scoreImpact: s.scoreImpact || BLANK.scoreImpact, timeoutMs: s.timeoutMs || 6000, bodyTemplate: s.bodyTemplate || "" } });

  return (
    <div className="stack">
      <div className="sv-head"><div><h3>اتصال سازمان‌های بیرونی</h3><p className="muted small">هر سازمان (تخلفات رانندگی، بیمه، …) یک سرویس وب است؛ نتیجهٔ آن در گزارش دیده می‌شود، می‌تواند از امتیاز بکاهد و در قوانین سفارشی استفاده شود.</p></div><button className="btn primary" onClick={() => setWiz({ initial: BLANK })}><Plus size={16} /> اتصال سرویس جدید</button></div>
      {err && <div className="callout bad"><p>{err}</p></div>}
      {!rows ? <Skeleton h={160} /> : rows.length === 0 ? <Empty icon={Plug} text="هنوز سرویسی متصل نکرده‌اید. «اتصال سرویس جدید» را بزنید و از قالب‌های آماده شروع کنید." /> : (
        <div className="sv-cards">
          {rows.map((s) => {
            const st = !s.enabled ? ["غیرفعال", "neutral"] : STATUS[s.status] || STATUS.untested;
            let host = ""; try { host = new URL(s.baseUrl).host; } catch { /* ignore */ }
            return (
              <Card key={s.id} className="sv-card">
                <div className="sv-card-top"><span className="sv-ic"><Plug size={18} /></span><div><b>{s.name}</b><small dir="ltr">{s.key}</small></div><Badge tone={st[1]}>{st[0]}</Badge></div>
                <div className="sv-meta"><span><Globe size={13} /> <code dir="ltr">{host}</code></span><span>{s.method}</span>{s.category && <span>{s.category}</span>}{s.lastLatencyMs != null && <span><Gauge size={13} /> {fa(s.lastLatencyMs)} ms</span>}{s.hasKey && <span><KeyRound size={13} /> کلید ذخیره‌شده</span>}</div>
                <div className="sv-chips">{(s.outputs || [{ key: "value", label: "مقدار" }]).map((o) => <Badge key={o.key} tone="neutral">{o.label || o.key}</Badge>)}{s.scoreImpact?.enabled && <Badge tone="warn"><Zap size={11} /> اثر بر امتیاز</Badge>}</div>
                {s.lastError && <p className="sv-err">{s.lastError}</p>}
                {s.lastTestAt && <small className="muted">آخرین تست: {tehranDateTime(s.lastTestAt)}</small>}
                <div className="sv-actions">
                  <input dir="ltr" inputMode="numeric" maxLength={10} placeholder="کد ملی برای تست" value={nidFor[s.id] || ""} onChange={(e) => setNidFor((x) => ({ ...x, [s.id]: e.target.value.replace(/\D/g, ""), [`${s.id}:e`]: "" }))} />
                  <button className="btn sm" disabled={testing[s.id]} onClick={() => quickTest(s)}>{testing[s.id] ? <Loader2 size={14} className="spin-i" /> : <Play size={14} />} تست</button>
                  <button className="btn sm" onClick={() => edit(s)}><Pencil size={14} /> ویرایش</button>
                  <button className="btn sm" onClick={() => toggle(s)}>{s.enabled ? "غیرفعال" : "فعال"}</button>
                  <button className="btn sm danger" aria-label="حذف" onClick={() => del(s)}><Trash2 size={14} /></button>
                </div>
                {nidFor[`${s.id}:e`] && <small className="bad">{nidFor[`${s.id}:e`]}</small>}
              </Card>
            );
          })}
        </div>
      )}
      <Drawer open={!!wiz} onClose={() => setWiz(null)} title={wiz?.existing ? `ویرایش «${wiz.existing.name}»` : "اتصال سرویس وب جدید"}>
        {wiz && <Wizard key={wiz.existing?.id || "new"} initial={wiz.initial} existing={wiz.existing} onClose={() => setWiz(null)} onSaved={done} />}
      </Drawer>
    </div>
  );
}
