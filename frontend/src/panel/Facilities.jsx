import React, { useEffect, useMemo, useState } from "react";
import { Plus, CheckCheck, Loader2, Landmark, UserRound, ChevronDown, CalendarClock, Layers } from "lucide-react";
import { api } from "../api.js";
import { Card, CardHead, Field, MoneyInput, Badge, Empty, Spin, validNationalId, tomanFull, dateFa, faDigits, useToast, NationalId } from "./kit.jsx";
import JalaliInput from "./JalaliInput.jsx";
import { jalaliToISO, parseJalali, todayJalali, formatJalali, isoToJalaliString } from "./jalali.js";

const TONE = { current: "good", overdue: "warn", delinquent: "bad", doubtful: "bad", settled: "neutral" };
const INST = { paid: ["پرداخت‌شده", "good"], paid_late: ["با تأخیر پرداخت شد", "warn"], overdue: ["عقب‌افتاده", "bad"], due: ["در انتظار", "neutral"] };
const t0 = () => formatJalali(todayJalali());
const EMPTY = { nationalId: "", title: "", ref: "", amount: 0, remaining: null, penalty: 0, disbursed: t0(), due: "", scheduled: false, count: 6, first: "", every: 1, each: 0 };

// same rule as the server: equal installments, remainder on the last, month-end clamped
function addMonths(date, k) {
  const d = new Date(date), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + k);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d;
}
function preview({ amount, count, first, every, each }) {
  const iso = jalaliToISO(first);
  if (!iso || !amount || !count) return [];
  const base = each || Math.floor(amount / count);
  return Array.from({ length: count }, (_, i) => ({ seq: i + 1, due: addMonths(iso, i * every), amount: !each && i === count - 1 ? base + amount - base * count : base }));
}

function Installments({ f, onPaid }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  async function pay(seq) {
    setBusy(seq);
    try {
      const out = await api.payInstallment(f.id, seq);
      toast.success(out.settledNow ? "آخرین قسط پرداخت شد؛ اعتبار تسویه و از تعهدات جاری خارج شد." : `قسط ${faDigits(seq)} ثبت شد.`);
      onPaid();
    } catch (x) { toast.error(x.message); } finally { setBusy(null); }
  }
  return (
    <div className="fc-inst">
      {f.installments.map((i) => (
        <div key={i.seq} className={`fc-inst-row s-${i.status}`}>
          <b>قسط {faDigits(i.seq)}</b><span>{dateFa(i.dueDate)}</span><span>{tomanFull(i.amount)}</span>
          <Badge tone={INST[i.status][1]}>{INST[i.status][0]}{i.daysLate ? ` (${faDigits(i.daysLate)} روز)` : ""}</Badge>
          <span className="fc-paid">{i.paidAt ? `پرداخت: ${dateFa(i.paidAt)}` : ""}</span>
          {!i.paidAt && <button className="bx-btn sm" disabled={busy === i.seq} onClick={() => pay(i.seq)}>{busy === i.seq ? <Loader2 size={14} className="spin" /> : <CheckCheck size={14} />} پرداخت شد</button>}
        </div>
      ))}
    </div>
  );
}

export default function Facilities() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [settling, setSettling] = useState(null);
  const [open, setOpen] = useState(null);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  const load = () => api.listFacilities().then(setRows).catch((e) => { toast.error(e.message); setRows([]); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sched = useMemo(() => (f.scheduled ? preview(f) : []), [f]);
  const err = useMemo(() => ({
    nationalId: !validNationalId(f.nationalId) ? "کد ملی معتبر ۱۰ رقمی وارد کنید" : "",
    amount: !f.amount ? "مبلغ اعتبار را وارد کنید" : "",
    disbursed: !parseJalali(f.disbursed) ? "تاریخ دریافت را کامل انتخاب کنید" : "",
    due: !f.scheduled && !parseJalali(f.due) ? "تاریخ سررسید را کامل انتخاب کنید" : !f.scheduled && jalaliToISO(f.due) < jalaliToISO(f.disbursed || f.due) ? "سررسید قبل از تاریخ دریافت است" : "",
    first: f.scheduled && !parseJalali(f.first) ? "تاریخ سررسید قسط اول را انتخاب کنید" : f.scheduled && jalaliToISO(f.first) < jalaliToISO(f.disbursed || f.first) ? "قسط اول قبل از تاریخ دریافت است" : "",
    count: f.scheduled && (f.count < 2 || f.count > 120) ? "تعداد اقساط بین ۲ تا ۱۲۰ باشد" : "",
    remaining: !f.scheduled && f.remaining != null && f.remaining > f.amount ? "مانده بیشتر از مبلغ اعتبار است" : "",
  }), [f]);
  const bad = Object.values(err).some(Boolean);

  async function submit(e) {
    e.preventDefault(); setTouched(true);
    if (bad) { toast.warning("لطفاً خطاهای فرم را برطرف کنید"); return; }
    setBusy(true);
    try {
      const body = { nationalId: f.nationalId, title: f.title.trim() || undefined, externalRef: f.ref.trim() || undefined, amount: f.amount, disbursedAt: jalaliToISO(f.disbursed), penaltyAmount: f.penalty || 0 };
      if (f.scheduled) Object.assign(body, { installmentCount: Number(f.count), firstDueDate: jalaliToISO(f.first), intervalMonths: Number(f.every), ...(f.each ? { installmentAmount: f.each } : {}) });
      else Object.assign(body, { dueDate: jalaliToISO(f.due), remainingAmount: f.remaining == null ? f.amount : f.remaining });
      await api.createFacility(body);
      toast.success("اعتبار ثبت شد و همین حالا در سوابق مشتری لحاظ می‌شود.");
      setF({ ...EMPTY, disbursed: t0() }); setTouched(false); load();
    } catch (x) { toast.error(x.message); } finally { setBusy(false); }
  }

  async function settle(r) {
    if (!window.confirm(`اعتبار ${r.nationalId ? `مشتری با کد ملی ${r.nationalId} ` : ""}یکجا تسویه‌شده ثبت شود؟ بلافاصله اعمال می‌شود و مشتری می‌تواند دوباره اعتبار بگیرد.`)) return;
    setSettling(r.id);
    try {
      const out = await api.settleFacility(r.id);
      toast.success(out.releasedDefault ? "تسویه ثبت شد و ثبت بدحسابی این مشتری نیز آزاد شد." : "تسویه ثبت شد.");
      load();
    } catch (x) { toast.error(x.message); } finally { setSettling(null); }
  }

  const sh = (k) => touched && err[k];
  return (
    <div className="bx-stack">
      <Card><CardHead eyebrow="NEW CREDIT" title="ثبت اعتبار اعطایی" />
        <p className="bx-muted">اعتبار از لحظهٔ پرداخت در سوابق مشتری ثبت می‌شود و با تسویهٔ آخرین قسط از تعهدات جاری خارج می‌شود. نحوهٔ پرداخت اقساط روی رتبهٔ اعتباری او اثر مستقیم دارد.</p>
        <form onSubmit={submit} noValidate>
          <div className="bx-form-grid">
            <Field label="کد ملی مشتری" required error={sh("nationalId")} hint="فقط برای خود شما نمایش داده می‌شود و رمزنگاری‌شده ذخیره می‌شود">
              <span className="bx-input"><UserRound size={18} /><input dir="ltr" inputMode="numeric" maxLength={10} value={f.nationalId} onChange={(e) => set({ nationalId: e.target.value.replace(/\D/g, "") })} placeholder="0012345678" /></span>
            </Field>
            <Field label="عنوان اعتبار" hint="مثلاً «خرید اقساطی گوشی»"><span className="bx-input"><Landmark size={18} /><input value={f.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} /></span></Field>
            <Field label="مبلغ اعتبار" required error={sh("amount")}><MoneyInput value={f.amount} onChange={(v) => set({ amount: v })} invalid={!!sh("amount")} /></Field>
            <Field label="تاریخ دریافت (شمسی)" required error={sh("disbursed")}><JalaliInput value={f.disbursed} onChange={(v) => set({ disbursed: v })} yearsBack={6} yearsAhead={0} /></Field>
          </div>

          <div className="fc-mode" role="tablist" aria-label="نوع بازپرداخت">
            <button type="button" className={!f.scheduled ? "on" : ""} onClick={() => set({ scheduled: false })}><CalendarClock size={16} /> پرداخت یکجا (یک سررسید)</button>
            <button type="button" className={f.scheduled ? "on" : ""} onClick={() => set({ scheduled: true })}><Layers size={16} /> اقساطی</button>
          </div>

          {!f.scheduled ? (
            <div className="bx-form-grid">
              <Field label="تاریخ سررسید (شمسی)" required error={sh("due")}><JalaliInput value={f.due} onChange={(v) => set({ due: v })} yearsBack={6} yearsAhead={6} /></Field>
              <Field label="مانده فعلی" error={sh("remaining")} hint="خالی = کل مبلغ"><MoneyInput value={f.remaining ?? f.amount} onChange={(v) => set({ remaining: v })} invalid={!!sh("remaining")} /></Field>
            </div>
          ) : (
            <>
              <div className="bx-form-grid">
                <Field label="تعداد اقساط" required error={sh("count")}><span className="bx-input"><input dir="ltr" inputMode="numeric" value={f.count} onChange={(e) => set({ count: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></span></Field>
                <Field label="فاصلهٔ اقساط"><select className="bx-select" value={f.every} onChange={(e) => set({ every: Number(e.target.value) })}>{[1, 2, 3, 6, 12].map((m) => <option key={m} value={m}>{m === 1 ? "ماهانه" : `هر ${faDigits(m)} ماه`}</option>)}</select></Field>
                <Field label="سررسید قسط اول (شمسی)" required error={sh("first")}><JalaliInput value={f.first} onChange={(v) => set({ first: v })} yearsBack={1} yearsAhead={6} /></Field>
                <Field label="مبلغ هر قسط" hint="خالی = تقسیم مساوی؛ می‌تواند شامل سود باشد"><MoneyInput value={f.each} onChange={(v) => set({ each: v })} /></Field>
              </div>
              {sched.length > 0 && (
                <div className="fc-prev"><b>پیش‌نمایش برنامهٔ اقساط</b>
                  <div className="fc-prev-grid">{sched.slice(0, 24).map((r) => <span key={r.seq}><i>{faDigits(r.seq)}</i>{isoToJalaliString(r.due)}<em>{tomanFull(r.amount)}</em></span>)}</div>
                  {sched.length > 24 && <small className="bx-muted">و {faDigits(sched.length - 24)} قسط دیگر…</small>}
                  <small className="bx-muted">جمع اقساط: {tomanFull(sched.reduce((s, r) => s + r.amount, 0))}</small>
                </div>
              )}
            </>
          )}

          <div className="bx-form-grid">
            <Field label="جریمهٔ دیرکرد" hint="اگر جریمه‌ای اعمال شده"><MoneyInput value={f.penalty} onChange={(v) => set({ penalty: v })} /></Field>
            <Field label="شناسهٔ داخلی شما" hint="اختیاری — برای تسویه و پرداخت قسط از طریق API"><span className="bx-input"><input dir="ltr" value={f.ref} maxLength={100} onChange={(e) => set({ ref: e.target.value })} placeholder="INV-1024" /></span></Field>
          </div>
          <div className="bx-btn-row"><button className="bx-btn primary lg" disabled={busy}>{busy ? <Loader2 size={18} className="spin" /> : <Plus size={18} />} ثبت اعتبار</button></div>
        </form>
      </Card>

      <Card><CardHead eyebrow="LEDGER" title="اعتبارهای ثبت‌شدهٔ شما" />
        {!rows ? <div className="bx-center"><Spin /></div> : rows.length === 0 ? <Empty icon={Landmark} text="هنوز اعتباری ثبت نکرده‌اید." /> : (
          <div className="bx-table-wrap"><table className="bx-table bx-ledger">
            <thead><tr><th>شناسه</th><th>کد ملی</th><th>مبلغ</th><th>دریافت</th><th>{`سررسید / قسط بعدی`}</th><th>مانده</th><th>اقساط</th><th>وضعیت</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <React.Fragment key={r.id}>
                <tr>
                  <td><b>{r.externalRef || `#${String(r.id).slice(-6)}`}</b>{r.title && <small>{r.title}</small>}<small>{r.source === "api" ? "API" : "پنل"}</small></td>
                  <td><NationalId value={r.nationalId} masked={r.nationalIdMasked} onFill={async (n) => { await api.fillFacilityNid(r.id, n); await load(); }} /></td><td>{tomanFull(r.amount)}</td><td>{dateFa(r.disbursedAt)}</td><td>{r.settledAt ? "—" : dateFa(r.nextDue || r.dueDate)}</td><td>{tomanFull(r.remainingAmount)}</td>
                  <td>{r.installmentCount ? <button className="fc-toggle" onClick={() => setOpen(open === r.id ? null : r.id)}>{faDigits(r.paidCount)}/{faDigits(r.installmentCount)} <ChevronDown size={14} className={open === r.id ? "up" : ""} /></button> : "—"}</td>
                  <td><Badge tone={TONE[r.status]}>{r.statusLabel}</Badge>{r.status !== "settled" && r.daysLate > 0 && <small>{faDigits(r.daysLate)} روز تأخیر</small>}{r.settledAt && <small>تسویه: {dateFa(r.settledAt)}</small>}{r.penaltyAmount > 0 && <small className="neg">جریمه: {tomanFull(r.penaltyAmount)}</small>}</td>
                  <td className="row-actions">{!r.settledAt && <button className="bx-btn sm" disabled={settling === r.id} onClick={() => settle(r)}>{settling === r.id ? <Loader2 size={14} className="spin" /> : <CheckCheck size={14} />} تسویه کامل</button>}</td>
                </tr>
                {open === r.id && r.installmentCount > 0 && <tr className="fc-exp"><td colSpan={9}><Installments f={r} onPaid={load} /></td></tr>}
              </React.Fragment>))}</tbody>
          </table></div>)}
      </Card>
    </div>
  );
}
