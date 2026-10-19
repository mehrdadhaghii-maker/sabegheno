import React, { useCallback, useEffect, useState } from "react";
import { ShieldCheck, KeyRound, Smartphone, History, Trash2, Check, X, Loader2 } from "lucide-react";
import { adminApi, setAuth } from "../api.js";
import { Badge, Card, Empty, Skeleton } from "../ui.jsx";
import { fa } from "../lib.js";
import { tehranDateTime } from "./monitor/format.js";

// Mirrors backend utils/password.js (the server is the real gatekeeper).
const RULES = [
  ["حداقل ۸ کاراکتر", (p) => p.length >= 8],
  ["حرف کوچک انگلیسی", (p) => /[a-z]/.test(p)],
  ["حرف بزرگ انگلیسی", (p) => /[A-Z]/.test(p)],
  ["عدد", (p) => /\d/.test(p)],
  ["نماد (! @ # $ …)", (p) => /[^A-Za-z0-9]/.test(p)],
];
const REASON = { ok: "موفق", bad_password: "رمز اشتباه", locked: "حساب قفل بود", bad_2fa: "کد دومرحله‌ای اشتباه" };
const KIND = { data_retention: "داده‌های حساس", log_retention: "لاگ‌ها" };

function Msg({ m }) { return m ? <div className={`callout ${m.ok ? "info" : "bad"}`} role="status"><p>{m.text}</p></div> : null; }

function PasswordCard() {
  const [cur, setCur] = useState(""), [next, setNext] = useState("");
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const okAll = RULES.every(([, f]) => f(next));
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await adminApi.changePassword(cur, next); setAuth(null); } // server closed every session → back to login
    catch (x) { setMsg({ ok: false, text: x.message }); } finally { setBusy(false); }
  }
  return (
    <Card eyebrow="رمز عبور" title="تغییر رمز عبور">
      <form className="stack" onSubmit={submit}>
        <label className="field">رمز فعلی<input type="password" dir="ltr" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label>
        <label className="field">رمز جدید<input type="password" dir="ltr" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <ul className="sec-rules">{RULES.map(([t, f]) => <li key={t} className={f(next) ? "ok" : ""}>{f(next) ? <Check size={14} /> : <X size={14} />} {t}</li>)}</ul>
        <Msg m={msg} />
        <p className="muted small">پس از تغییر، همهٔ نشست‌ها بسته می‌شود و باید دوباره وارد شوید.</p>
        <button className="btn primary" disabled={busy || !cur || !okAll}>{busy ? <Loader2 size={16} className="spin-i" /> : <KeyRound size={16} />} تغییر رمز</button>
      </form>
    </Card>
  );
}

function TwoFactorCard({ enabled, onChanged }) {
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState(""), [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null);
  const run = async (fn, ok) => { setBusy(true); setMsg(null); try { const r = await fn(); if (ok) setMsg({ ok: true, text: ok }); return r; } catch (x) { setMsg({ ok: false, text: x.message }); return null; } finally { setBusy(false); } };

  return (
    <Card eyebrow="ورود امن‌تر" title="احراز هویت دومرحله‌ای (2FA)" action={<Badge tone={enabled ? "good" : "neutral"}>{enabled ? "فعال" : "غیرفعال"}</Badge>}>
      <div className="stack">
        {!enabled && !setup && (<>
          <p className="muted">با فعال‌سازی، علاوه بر رمز عبور یک کد ۶ رقمی از برنامهٔ Authenticator (Google Authenticator، Aegis، …) لازم است.</p>
          <button className="btn primary" disabled={busy} onClick={async () => setSetup(await run(() => adminApi.setup2fa()))}><ShieldCheck size={16} /> شروع فعال‌سازی</button>
        </>)}
        {!enabled && setup && (<>
          <p>در برنامهٔ Authenticator یک حساب جدید بسازید و این کلید را وارد کنید (نوع: مبتنی بر زمان):</p>
          <code className="sec-secret" dir="ltr">{setup.secret}</code>
          <details><summary className="muted small">آدرس otpauth (برای برنامه‌هایی که لینک می‌پذیرند)</summary><code className="sec-secret small" dir="ltr">{setup.otpauthUri}</code></details>
          <label className="field">کد ۶ رقمی نمایش‌داده‌شده<input dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" /></label>
          <button className="btn primary" disabled={busy || code.length !== 6} onClick={async () => { const r = await run(() => adminApi.enable2fa(code)); if (r) { setSetup(null); setCode(""); onChanged(); } }}>تأیید و فعال‌سازی</button>
        </>)}
        {enabled && (<>
          <p className="muted">برای غیرفعال‌سازی، رمز عبور و یک کد معتبر لازم است.</p>
          <label className="field">رمز عبور<input type="password" dir="ltr" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
          <label className="field">کد ۶ رقمی<input dir="ltr" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} /></label>
          <button className="btn danger" disabled={busy || !pw || code.length !== 6} onClick={async () => { const r = await run(() => adminApi.disable2fa(pw, code)); if (r) { setPw(""); setCode(""); onChanged(); } }}>غیرفعال‌سازی 2FA</button>
        </>)}
        <Msg m={msg} />
        <p className="muted small">اگر گوشی را گم کردید: روی سرور <code dir="ltr">npm run auth:unlock -- &lt;username&gt; --reset-2fa</code></p>
      </div>
    </Card>
  );
}

export default function Security() {
  const [d, setD] = useState(null), [err, setErr] = useState(""), [ret, setRet] = useState(null), [busy, setBusy] = useState(false);
  const load = useCallback(() => adminApi.security().then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function closeAll() { try { await adminApi.logoutAll(); } catch { /* ignore */ } setAuth(null); }
  async function runRetention() {
    setBusy(true); setRet(null);
    try { setRet({ ok: true, text: `انجام شد: ${JSON.stringify(await adminApi.runRetention())}` }); load(); }
    catch (e) { setRet({ ok: false, text: e.message }); } finally { setBusy(false); }
  }

  if (err && !d) return <div className="callout bad" role="alert"><p>{err}</p></div>;
  if (!d) return <Skeleton h={320} />;
  return (
    <div className="stack">
      <div className="grid-3 sec-grid">
        <PasswordCard />
        <TwoFactorCard enabled={d.admin.twoFactorEnabled} onChanged={load} />
        <Card eyebrow="نشست‌ها" title="نشست فعال" action={<Smartphone size={18} />}>
          <div className="stack">
            <p className="muted small">هر حساب فقط یک نشست فعال دارد؛ با ورود جدید، نشست قبلی بسته می‌شود. بی‌فعالیتی {fa(d.idleMinutes)} دقیقه‌ای نشست را می‌بندد. قفل حساب: {fa(d.maxFailedLogins)} رمز اشتباه ⇒ {fa(d.lockHours)} ساعت.</p>
            {d.sessions.map((s) => (
              <div key={s.id} className="sec-session">
                <b>{s.current ? "این دستگاه" : "دستگاه دیگر"}</b>
                <span className="muted small" dir="ltr">{s.ip || "—"}</span>
                <span className="muted small">ورود: {tehranDateTime(s.createdAt)}</span>
                <span className="muted small">آخرین فعالیت: {tehranDateTime(s.lastActivityAt)}</span>
              </div>
            ))}
            <button className="btn danger" onClick={closeAll}>بستن همهٔ نشست‌ها و خروج</button>
          </div>
        </Card>
      </div>

      <Card eyebrow="گزارش ورود" title="آخرین تلاش‌های ورود ادمین" action={<History size={18} />} pad={false}>
        {d.attempts.length === 0 ? <Empty text="تلاشی ثبت نشده است" /> : (
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>زمان (تهران)</th><th>نام کاربری</th><th>نتیجه</th><th>IP</th></tr></thead>
            <tbody>{d.attempts.map((a, i) => (
              <tr key={i}><td className="muted small">{tehranDateTime(a.createdAt)}</td><td dir="ltr">{a.identifier}</td>
                <td><Badge tone={a.success ? "good" : "bad"}>{REASON[a.reason] || a.reason || "—"}</Badge></td><td dir="ltr" className="muted small">{a.ip || "—"}</td></tr>
            ))}</tbody></table></div>
        )}
      </Card>

      <Card eyebrow="حریم خصوصی" title="گزارش پاک‌سازی داده‌ها" action={<button className="btn sm" disabled={busy} onClick={runRetention}><Trash2 size={14} /> اجرای دستی</button>} pad={false}>
        <Msg m={ret} />
        {d.cleanupReports.length === 0 ? <Empty text="هنوز پاک‌سازی‌ای اجرا نشده (هر شب ساعت ۰۳ به وقت تهران اجرا می‌شود)" /> : (
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>زمان</th><th>نوع</th><th>تعداد حذف‌شده</th><th>جزئیات</th></tr></thead>
            <tbody>{d.cleanupReports.map((r) => (
              <tr key={r.id}><td className="muted small">{tehranDateTime(r.createdAt)}</td><td>{KIND[r.kind] || r.kind}</td><td><b>{fa(r.total)}</b></td><td dir="ltr" className="muted small">{JSON.stringify(r.details)}</td></tr>
            ))}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
