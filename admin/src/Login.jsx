import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Eye, EyeOff, User, Lock, Loader2, ShieldCheck, LayoutDashboard, Zap, AlertCircle } from "lucide-react";
import { adminApi, setAuth, LOGOUT_REASON_KEY } from "./api.js";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.2 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

function StepItem({ number, text, active }) {
  return (
    <motion.div variants={item} className={`aurora-step ${active ? "active" : ""}`}>
      <span>{number}</span><p>{text}</p>
    </motion.div>
  );
}

function InputGroup({ label, icon: Icon, error, hint, children }) {
  return (
    <label className={`aurora-field ${error ? "has-error" : ""}`}>
      <span className="aurora-label">{label}</span>
      <span className="aurora-input"><Icon size={17} />{children}</span>
      {error ? <small className="aurora-err"><AlertCircle size={13} /> {error}</small> : hint ? <small className="aurora-hint">{hint}</small> : null}
    </label>
  );
}

export default function Login({ onDone }) {
  const [u, setU] = useState(""), [p, setP] = useState("");
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState({});
  const [serverErr, setServerErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [videoOk, setVideoOk] = useState(true);
  const [needTotp, setNeedTotp] = useState(false);
  const [totp, setTotp] = useState("");
  const [notice, setNotice] = useState("");

  // Why we were signed out (idle timeout / signed in elsewhere / password changed…)
  useEffect(() => {
    try { const r = sessionStorage.getItem(LOGOUT_REASON_KEY); if (r) { setNotice(r); sessionStorage.removeItem(LOGOUT_REASON_KEY); } } catch { /* ignore */ }
  }, []);

  const errors = {
    u: !u.trim() ? "نام کاربری را وارد کنید" : u.trim().length < 3 ? "نام کاربری حداقل ۳ کاراکتر است" : "",
    p: !p ? "رمز عبور را وارد کنید" : p.length < 8 ? "رمز عبور حداقل ۸ کاراکتر است" : "",
  };
  const show_ = (k) => (touched[k] || touched.all) && errors[k];

  async function submit(e) {
    e.preventDefault();
    setTouched({ all: true }); setServerErr("");
    if (errors.u || errors.p) return;
    setBusy(true);
    try {
      const r = await adminApi.login(u.trim(), p, needTotp ? totp.trim() : undefined);
      setAuth({ token: r.token, refreshToken: r.refreshToken, admin: r.admin });
      onDone();
    } catch (x) {
      if (x.data?.twoFactorRequired) {
        setNeedTotp(true);
        if (x.code === "TOTP_INVALID") setServerErr(x.message); // wrong code; "TOTP_REQUIRED" is just the prompt
      } else setServerErr(x.message);
    } finally { setBusy(false); }
  }

  return (
    <main className="aurora">
      <section className="aurora-hero">
        <div className="aurora-bg" aria-hidden="true"><i /><i /><i /></div>
        {videoOk && <video className="aurora-video" autoPlay muted loop playsInline onError={() => setVideoOk(false)}><source src="/auth-hero.mp4" type="video/mp4" /></video>}
        <motion.div className="aurora-copy" variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="aurora-brand"><img src="/favicon.png" alt="" /><span>سابقه‌نو</span></motion.div>
          <motion.h1 variants={item}>مرکز فرماندهی تصمیم‌های اعتباری</motion.h1>
          <motion.p variants={item}>کسب‌وکارها، منابع داده و قواعد اعتبارسنجی را یک‌جا ببینید و با اطمینان تصمیم بگیرید.</motion.p>
          <div className="aurora-steps">
            <StepItem number="۱" text="ورود به حساب مدیریتی" active />
            <StepItem number="۲" text="مشاهدهٔ وضعیت لحظه‌ای سامانه" />
            <StepItem number="۳" text="مدیریت کسب‌وکارها و سیاست اعتبار" />
          </div>
        </motion.div>
      </section>

      <section className="aurora-form-col">
        <motion.form className="aurora-form" onSubmit={submit} noValidate initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: "easeOut" }}>
          <div className="aurora-head"><span className="aurora-badge"><ShieldCheck size={15} /> پنل مدیریت</span><h2>ورود مدیر سیستم</h2><p>برای ادامه با حساب مدیریتی خود وارد شوید.</p></div>
          {notice && !serverErr && <div className="aurora-alert" role="status"><AlertCircle size={17} />{notice}</div>}
          {serverErr && <div className="aurora-alert" role="alert"><AlertCircle size={17} />{serverErr}</div>}
          <InputGroup label="نام کاربری" icon={User} error={show_("u")}>
            <input value={u} dir="ltr" autoComplete="username" placeholder="admin" onChange={(e) => setU(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, u: true }))} aria-invalid={!!show_("u")} />
          </InputGroup>
          <InputGroup label="رمز عبور" icon={Lock} error={show_("p")} hint="حداقل ۸ کاراکتر لازم است">
            <input value={p} dir="ltr" type={show ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" onChange={(e) => setP(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, p: true }))} aria-invalid={!!show_("p")} />
            <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? "پنهان کردن رمز" : "نمایش رمز"}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
          </InputGroup>
          {needTotp && (
            <InputGroup label="کد احراز هویت دومرحله‌ای" icon={ShieldCheck} hint="کد ۶ رقمی را از برنامهٔ Authenticator وارد کنید">
              <input value={totp} dir="ltr" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" autoFocus onChange={(e) => setTotp(e.target.value.replace(/\D/g, ""))} />
            </InputGroup>
          )}
          <button className="aurora-submit" disabled={busy}>{busy ? <><Loader2 size={18} className="spin-i" /> در حال ورود…</> : <>ورود به پنل <Zap size={17} /></>}</button>
          <p className="aurora-foot"><LayoutDashboard size={14} /> دسترسی فقط برای مدیران مجاز سابقه‌نو</p>
        </motion.form>
      </section>
    </main>
  );
}
