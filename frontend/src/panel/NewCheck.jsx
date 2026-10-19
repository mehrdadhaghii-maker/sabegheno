import React, { useMemo, useState } from "react";
import { Loader2, ScanSearch, UserRound, Wallet, CalendarClock, ShieldCheck, Lock, Info, Percent } from "lucide-react";
import { api } from "../api.js";
import { Card, CardHead, Field, MoneyInput, validNationalId, num, toman, faDigits, useToast } from "./kit.jsx";
import JalaliInput from "./JalaliInput.jsx";
import { parseJalali } from "./jalali.js";

const TERMS = [3, 6, 9, 12, 18, 24, 36];
const AMOUNT_PRESETS = [10, 20, 50, 80, 100, 200].map((m) => m * 1e6);

export default function NewCheck({ openCheck }) {
  const toast = useToast();
  const [f, setF] = useState({ nationalId: "", name: "", birth: "", amount: 80000000, term: 6 });
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  const err = useMemo(() => ({
    nationalId: !f.nationalId ? "کد ملی را وارد کنید" : !/^\d{10}$/.test(f.nationalId) ? "کد ملی باید دقیقاً ۱۰ رقم باشد" : !validNationalId(f.nationalId) ? "این کد ملی معتبر نیست؛ ارقام را دوباره بررسی کنید" : "",
    amount: !f.amount ? "مبلغ را وارد کنید" : f.amount < 1e6 ? "حداقل مبلغ ۱٬۰۰۰٬۰۰۰ تومان است" : f.amount > 5e10 ? "مبلغ بیش از حد مجاز است" : "",
    term: f.term < 1 || f.term > 60 ? "مدت باید بین ۱ تا ۶۰ ماه باشد" : "",
    birth: f.birth && !parseJalali(f.birth) ? "تاریخ تولد نامعتبر است" : "",
  }), [f]);
  const show = (k) => (touched[k] || touched.all) && err[k];
  const monthly = f.amount && f.term ? Math.round(f.amount / f.term) : 0;

  async function submit(e) {
    e.preventDefault();
    setTouched({ all: true });
    if (err.nationalId || err.amount || err.term || err.birth) { toast.warning("لطفاً خطاهای فرم را برطرف کنید", "فرم کامل نیست"); return; }
    setLoading(true);
    try {
      const payload = { nationalId: f.nationalId, requestedAmount: f.amount, termMonths: f.term };
      if (f.birth) payload.customerBirthDate = f.birth;
      const record = await api.createCreditCheck(payload);
      const { sources, ...check } = record;
      toast.success("درخواست استعلام دریافت و بررسی شد", "استعلام ثبت شد");
      openCheck(check.id, { name: f.name, nationalId: f.nationalId }, check, sources);
    } catch (e2) { toast.error(e2.message, "استعلام انجام نشد"); } finally { setLoading(false); }
  }

  return (
    <form className="bx-newcheck" onSubmit={submit} noValidate>
      <div className="bx-stack">
        <Card><CardHead eyebrow="STEP 1" title="مشخصات مشتری" />
          <div className="bx-form-grid">
            <Field label="کد ملی" required error={show("nationalId")} hint="۱۰ رقم؛ فقط به‌صورت هش ذخیره می‌شود">
              <span className="bx-input"><UserRound size={18} /><input dir="ltr" inputMode="numeric" maxLength={10} value={f.nationalId} placeholder="0012345678" onChange={(e) => set({ nationalId: e.target.value.replace(/\D/g, "") })} onBlur={() => setTouched((t) => ({ ...t, nationalId: true }))} /></span>
            </Field>
            <Field label="نام مشتری" hint="اختیاری — فقط برای نمایش در همین مرورگر">
              <span className="bx-input"><input value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="مثلاً: علی رضایی" /></span>
            </Field>
            <Field label="تاریخ تولد (شمسی)" error={show("birth")} hint="اختیاری — با ثبت آن، هویت مشتری از ثبت‌احوال تطبیق داده می‌شود">
              <JalaliInput value={f.birth} onChange={(v) => set({ birth: v })} yearsBack={100} yearsFromEnd={10} />
            </Field>
          </div>
        </Card>

        <Card accent="navy"><CardHead eyebrow="STEP 2" title="شرایط اعتبار درخواستی" />
          <div className="bx-stack">
            <Field label="مبلغ اعتبار درخواستی" required error={show("amount")}>
              <MoneyInput value={f.amount} onChange={(v) => set({ amount: v })} invalid={!!show("amount")} />
            </Field>
            <div className="bx-chips">{AMOUNT_PRESETS.map((a) => <button type="button" key={a} className={f.amount === a ? "on" : ""} onClick={() => set({ amount: a })}>{num(a / 1e6)} میلیون</button>)}</div>
            <Field label="مدت بازپرداخت (ماه)" required error={show("term")}>
              <div className="bx-chips">{TERMS.map((t) => <button type="button" key={t} className={f.term === t ? "on" : ""} onClick={() => set({ term: t })}>{num(t)} ماه</button>)}
                <span className="bx-input small"><input dir="ltr" inputMode="numeric" value={TERMS.includes(f.term) ? "" : f.term || ""} placeholder="دلخواه" onChange={(e) => set({ term: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></span></div>
            </Field>
          </div>
        </Card>
      </div>

      <aside className="bx-stack">
        <Card accent="amber" className="bx-summary"><CardHead eyebrow="SUMMARY" title="خلاصهٔ درخواست" />
          <dl>
            <div><dt><Wallet size={16} /> مبلغ</dt><dd>{toman(f.amount)}</dd></div>
            <div><dt><CalendarClock size={16} /> مدت</dt><dd>{num(f.term)} ماه</dd></div>
            <div><dt><Percent size={16} /> قسط تقریبی ماهانه (بدون کارمزد)</dt><dd>{toman(monthly)}</dd></div>
          </dl>
          <button className="bx-btn primary lg wide" disabled={loading}>{loading ? <><Loader2 size={19} className="spin" /> در حال بررسی…</> : <><ScanSearch size={19} /> شروع استعلام</>}</button>
          <ul className="bx-checklist"><li><ShieldCheck size={16} /> بررسی سوابق وام، چک و هم‌پوشانی نزد سایر کسب‌وکارها</li><li><ShieldCheck size={16} /> بررسی فهرست بدحسابان کل شبکه</li><li><Lock size={16} /> کد ملی هرگز به‌صورت متن ذخیره نمی‌شود</li></ul>
        </Card>
        <div className="bx-note"><Info size={18} /><p>هر استعلام در گزارش «تاریخچه» ثبت می‌شود و می‌توانید آن را به‌صورت PDF دریافت یا چاپ کنید.</p></div>
      </aside>
    </form>
  );
}
