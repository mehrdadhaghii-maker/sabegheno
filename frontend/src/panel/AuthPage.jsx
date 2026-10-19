import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Eye, Smartphone, Building2, UserRound, ImagePlus, Loader2, ArrowLeft, ArrowRight, AlertCircle, CheckCircle2, ShieldCheck, KeyRound, BadgeCheck, Trash2 } from "lucide-react";
import { api, LOGOUT_REASON_KEY } from "../api.js";
import { faDigits, num, useToast, validNationalId } from "./kit.jsx";

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.2 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

function StepItem({ number, text, active, done }) {
  return (
    <motion.div variants={item} className={`aurora-step ${active ? "active" : ""} ${done ? "done" : ""}`}>
      <span>{done ? <CheckCircle2 size={18} /> : faDigits(number)}</span><p>{text}</p>
    </motion.div>
  );
}
function RoleButton({ icon: Icon, label, on, onClick }) {
  return <button type="button" className={`aurora-social ${on ? "on" : ""}`} onClick={onClick}><Icon size={18} />{label}</button>;
}
function InputGroup({ label, icon: Icon, error, hint, children }) {
  return (
    <label className={`aurora-field ${error ? "has-error" : ""}`}>
      <span className="aurora-label">{label}</span>
      <span className="aurora-input">{Icon && <Icon size={17} />}{children}</span>
      {error ? <small className="aurora-err"><AlertCircle size={13} /> {error}</small> : hint ? <small className="aurora-hint">{hint}</small> : null}
    </label>
  );
}

// Downscale to ≤512px so the upload is always well under the 1 MB server limit.
function toDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return reject(new Error("فقط تصویر PNG، JPG یا WebP مجاز است"));
    if (file.size > 8 * 1024 * 1024) return reject(new Error("حجم تصویر زیاد است (حداکثر ۸ مگابایت)"));
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 512 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL(file.type === "image/jpeg" ? "image/jpeg" : "image/png", 0.9));
    };
    img.onerror = () => reject(new Error("تصویر خوانده نشد"));
    img.src = URL.createObjectURL(file);
  });
}

export default function AuthPage({ onLoggedIn }) {
  const toast = useToast();
  useEffect(() => {
    try {
      const r = sessionStorage.getItem(LOGOUT_REASON_KEY);
      if (r) { sessionStorage.removeItem(LOGOUT_REASON_KEY); toast.info(r, "خروج از حساب"); }
    } catch { /* private mode */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [mode, setMode] = useState("login");        // login | register
  const [role, setRole] = useState("business");     // business | user
  const [step, setStep] = useState("mobile");       // mobile | otp | logo
  const [f, setF] = useState({ name: "", mobile: "", code: "", nationalId: "" });
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState("");
  const [hint, setHint] = useState(null);            // "register" | "login" — suggested switch after NOT_REGISTERED / ALREADY_REGISTERED
  const [ttl, setTtl] = useState(0);
  const [session, setSession] = useState(null);     // { token, role, entity, mobile } waiting for the logo step
  const [logo, setLogo] = useState(null);           // data URL
  const [videoOk, setVideoOk] = useState(true);
  const fileRef = useRef(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  useEffect(() => { if (ttl <= 0) return; const t = setTimeout(() => setTtl(ttl - 1), 1000); return () => clearTimeout(t); }, [ttl]);

  const reg = mode === "register";
  const err = {
    name: reg && role === "business" && f.name.trim().length < 2 ? "نام کسب‌وکار را وارد کنید" : "",
    mobile: !f.mobile ? "شماره موبایل را وارد کنید" : !/^09\d{9}$/.test(f.mobile) ? "شماره باید ۱۱ رقم و با ۰۹ شروع شود" : "",
    code: !f.code ? "کد تأیید را وارد کنید" : !/^\d{6}$/.test(f.code) ? "کد تأیید ۶ رقمی است" : "",
    nationalId: role === "user" && !validNationalId(f.nationalId) ? "کد ملی معتبر ۱۰ رقمی وارد کنید" : "",
  };
  const bad = (k) => (touched[k] || touched.all) && err[k];

  const steps = reg ? ["اطلاعات کسب‌وکار", "تأیید شمارهٔ موبایل", "لوگو و فعال‌سازی"] : ["شمارهٔ موبایل", "کد تأیید", "ورود به پنل"];
  const stepIdx = { mobile: 0, otp: 1, logo: 2 }[step];

  async function requestCode(e) {
    e.preventDefault(); setServerErr(""); setHint(null);
    setTouched({ all: true });
    if (err.name || err.mobile) return;
    setBusy(true);
    try { const r = await api.requestOtp(f.mobile, role, reg ? "register" : "login", reg && role === "business" ? f.name.trim() : undefined); setTtl(r.expiresInSeconds || 120); setStep("otp"); setTouched({}); toast.info("کد تأیید برای شما پیامک شد.", "کد ارسال شد"); }
    catch (x) { setServerErr(x.message); setHint(x.code === "NOT_REGISTERED" ? "register" : x.code === "ALREADY_REGISTERED" ? "login" : null); } finally { setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault(); setServerErr("");
    setTouched({ all: true });
    if (err.code || err.nationalId) return;
    setBusy(true);
    try {
      const payload = { mobile: f.mobile, code: f.code, role, intent: reg ? "register" : "login" };
      if (reg && role === "business" && f.name.trim()) payload.businessName = f.name.trim();
      if (role === "user") payload.nationalId = f.nationalId;
      const res = await api.verifyOtp(payload);
      const s = { token: res.token, refreshToken: res.refreshToken, role, entity: role === "business" ? res.business : res.user, mobile: f.mobile };
      if (reg && role === "business") { setSession(s); setStep("logo"); setTouched({}); toast.success("شمارهٔ شما تأیید شد؛ یک قدم تا پایان ثبت‌نام.", "تأیید موفق"); }
      else { toast.success("به سابقه‌نو خوش آمدید.", "ورود موفق"); onLoggedIn(s); }
    } catch (x) { setServerErr(x.message); } finally { setBusy(false); }
  }

  async function pickLogo(file) {
    if (!file) return;
    try { setLogo(await toDataUrl(file)); } catch (x) { toast.error(x.message, "لوگو پذیرفته نشد"); }
  }

  async function finish(skip) {
    setBusy(true);
    try {
      let entity = session.entity;
      if (logo && !skip) { const r = await api.uploadLogo(logo, session.token); entity = { ...entity, logoUrl: r.logoUrl }; }
      toast.success("ثبت‌نام شما کامل شد. پس از تأیید مدارک توسط مدیر، حساب شما فعال می‌شود.", "ثبت‌نام کامل شد");
      onLoggedIn({ ...session, entity });
    } catch (x) { toast.error(x.message, "بارگذاری لوگو ناموفق"); } finally { setBusy(false); }
  }

  const switchMode = (m) => { setMode(m); setStep("mobile"); setServerErr(""); setHint(null); setTouched({}); if (m === "register") setRole("business"); };

  return (
    <main className="aurora" dir="rtl">
      <section className="aurora-hero">
        <div className="aurora-bg" aria-hidden="true"><i /><i /><i /></div>
        {videoOk && <video className="aurora-video" autoPlay muted loop playsInline onError={() => setVideoOk(false)}><source src="/auth-hero.mp4" type="video/mp4" /></video>}
        <motion.div className="aurora-copy" variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="aurora-brand"><img src="/favicon.png" alt="" /><span>سابقه‌نو</span></motion.div>
          <motion.h1 variants={item}>{reg ? "کسب‌وکارتان را به شبکهٔ اعتبار هوشمند بیاورید" : "تصمیم مطمئن، با داده‌ای که می‌توان به آن اعتماد کرد"}</motion.h1>
          <motion.p variants={item}>استعلام اعتبار، تشخیص هم‌پوشانی درخواست‌ها و شبکهٔ مشترک بدحسابان؛ همه در یک پنل ساده.</motion.p>
          <div className="aurora-steps">{steps.map((t, i) => <StepItem key={t} number={i + 1} text={t} active={i === stepIdx} done={i < stepIdx} />)}</div>
        </motion.div>
      </section>

      <section className="aurora-form-col">
        <motion.div className="aurora-form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: "easeOut" }}>
          <div className="aurora-head">
            <span className="aurora-badge"><ShieldCheck size={15} /> {reg ? "ثبت‌نام کسب‌وکار" : "ورود به حساب"}</span>
            <h2>{step === "logo" ? "لوگوی کسب‌وکار شما" : step === "otp" ? "کد تأیید را وارد کنید" : reg ? "حساب جدید بسازید" : "خوش آمدید"}</h2>
            <p>{step === "logo" ? "لوگو کنار نام شما در همهٔ بخش‌های سامانه نمایش داده می‌شود." : step === "otp" ? `کد ۶ رقمی به ${faDigits(f.mobile)} پیامک شد.` : reg ? "اطلاعات اولیه را وارد کنید؛ فعال‌سازی پس از تأیید مدارک انجام می‌شود." : "برای ورود، شمارهٔ موبایل خود را وارد کنید."}</p>
          </div>

          {step === "mobile" && (
            <div className="aurora-modes"><button type="button" className={mode === "login" ? "on" : ""} onClick={() => switchMode("login")}>ورود</button><button type="button" className={mode === "register" ? "on" : ""} onClick={() => switchMode("register")}>ثبت‌نام</button></div>
          )}
          {serverErr && (
            <div className="aurora-alert" role="alert"><AlertCircle size={17} /><span>{serverErr}</span>
              {hint && <button type="button" className="aurora-alert-act" onClick={() => switchMode(hint)}>{hint === "register" ? "رفتن به ثبت‌نام" : "رفتن به ورود"}</button>}
            </div>
          )}

          <AnimatePresence mode="wait">
            {step === "mobile" && (
              <motion.form key="m" onSubmit={requestCode} noValidate className="aurora-fields" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {!reg && <div className="aurora-social-grid"><RoleButton icon={Building2} label="کسب‌وکار" on={role === "business"} onClick={() => setRole("business")} /><RoleButton icon={UserRound} label="گزارش شخصی" on={role === "user"} onClick={() => setRole("user")} /></div>}
                {!reg && <div className="aurora-divider"><span>یا</span></div>}
                {reg && <InputGroup label="نام برند کسب‌وکار (الزامی)" icon={Building2} error={bad("name")}><input value={f.name} onChange={(e) => set({ name: e.target.value })} onBlur={() => setTouched((t) => ({ ...t, name: true }))} placeholder="مثلاً: فروشگاه دیجیتال آرمان" /></InputGroup>}
                <InputGroup label="شماره موبایل" icon={Smartphone} error={bad("mobile")} hint="کد تأیید به این شماره پیامک می‌شود">
                  <input dir="ltr" inputMode="tel" maxLength={11} value={f.mobile} placeholder="09123456789" onChange={(e) => set({ mobile: e.target.value.replace(/\D/g, "") })} onBlur={() => setTouched((t) => ({ ...t, mobile: true }))} />
                </InputGroup>
                <button className="aurora-submit" disabled={busy}>{busy ? <><Loader2 size={18} className="spin" /> در حال ارسال…</> : <>{reg ? "ادامه و دریافت کد" : "دریافت کد تأیید"} <ArrowLeft size={18} /></>}</button>
              </motion.form>
            )}

            {step === "otp" && (
              <motion.form key="o" onSubmit={verify} noValidate className="aurora-fields" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <InputGroup label="کد تأیید ۶ رقمی" icon={KeyRound} error={bad("code")} hint={ttl > 0 ? `اعتبار کد: ${num(ttl)} ثانیه` : "کد منقضی شد؛ دوباره درخواست دهید"}>
                  <input autoFocus dir="ltr" inputMode="numeric" maxLength={6} value={f.code} placeholder="••••••" onChange={(e) => set({ code: e.target.value.replace(/\D/g, "") })} onBlur={() => setTouched((t) => ({ ...t, code: true }))} />
                </InputGroup>
                {role === "user" && <InputGroup label="کد ملی" icon={BadgeCheck} error={bad("nationalId")}><input dir="ltr" inputMode="numeric" maxLength={10} value={f.nationalId} onChange={(e) => set({ nationalId: e.target.value.replace(/\D/g, "") })} onBlur={() => setTouched((t) => ({ ...t, nationalId: true }))} placeholder="0012345678" /></InputGroup>}
                <button className="aurora-submit" disabled={busy}>{busy ? <><Loader2 size={18} className="spin" /> در حال بررسی…</> : <>{reg ? "تأیید و ادامه" : "ورود به حساب"} <ArrowLeft size={18} /></>}</button>
                <div className="aurora-links"><button type="button" onClick={() => { setStep("mobile"); setF((x) => ({ ...x, code: "" })); setServerErr(""); }}><ArrowRight size={14} /> تغییر شماره</button>
                  <button type="button" disabled={ttl > 90 || busy} onClick={requestCode}>ارسال مجدد کد</button></div>
              </motion.form>
            )}

            {step === "logo" && (
              <motion.div key="l" className="aurora-fields" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <button type="button" className={`aurora-drop ${logo ? "has" : ""}`} onClick={() => fileRef.current?.click()}>
                  {logo ? <img src={logo} alt="پیش‌نمایش لوگو" /> : <><ImagePlus size={34} /><b>انتخاب لوگو</b><small>PNG، JPG یا WebP — ترجیحاً مربع</small></>}
                </button>
                <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
                {logo && <button type="button" className="aurora-link-btn" onClick={() => setLogo(null)}><Trash2 size={14} /> حذف تصویر</button>}
                <button className="aurora-submit" disabled={busy || !logo} onClick={() => finish(false)}>{busy ? <><Loader2 size={18} className="spin" /> در حال ذخیره…</> : <>ذخیره لوگو و پایان ثبت‌نام <CheckCircle2 size={18} /></>}</button>
                <button type="button" className="aurora-link-btn center" disabled={busy} onClick={() => finish(true)}>فعلاً رد می‌شوم (بعداً از طریق پشتیبانی)</button>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="aurora-foot">{reg && step === "mobile" ? <>قبلاً ثبت‌نام کرده‌اید؟ <button type="button" onClick={() => switchMode("login")}>ورود</button></> : step === "mobile" ? <>عضو نیستید؟ <button type="button" onClick={() => switchMode("register")}>ثبت‌نام</button></> : "ورود شما به معنی پذیرش شرایط استفاده و حریم خصوصی سابقه‌نو است."}</p>
        </motion.div>
      </section>
    </main>
  );
}
