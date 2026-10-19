import React, { useEffect, useState } from "react";
import { CreditCard, Loader2, LogOut, Trash2, ShieldCheck } from "lucide-react";
import { api, setAuth } from "../api.js";
import { Card, CardHead, Spin, Empty, tomanFull, faDigits, useToast } from "./kit.jsx";
import { ReportView } from "./Report.jsx";

// A natural person's own report: OTP + Shahkar already proved the mobile belongs to the national ID;
// the report is shown after a (paid) gateway round-trip.
export default function SelfReport({ onLogout }) {
  const toast = useToast();
  const [st, setSt] = useState({ loading: true });
  const [paying, setPaying] = useState(false);

  async function load() {
    setSt({ loading: true });
    try {
      const s = await api.reportPaymentStatus();
      if (!s.paid) { setSt({ loading: false, needPay: true, price: s.priceToman, hours: s.accessHours }); return; }
      const r = await api.getMyReport();
      setSt({ loading: false, price: s.priceToman, data: { report: r.report, check: null, business: null, customer: r.customer } });
    } catch (e) {
      if (e.code === "PAYMENT_REQUIRED") { const s = await api.reportPaymentStatus().catch(() => ({})); setSt({ loading: false, needPay: true, price: s.priceToman, hours: s.accessHours }); }
      else setSt({ loading: false, error: e.message });
    }
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pay() {
    setPaying(true);
    try { const r = await api.startReportPayment(); window.location.assign(r.redirectUrl); }
    catch (e) { toast.error(e.message, "اتصال به درگاه انجام نشد"); setPaying(false); }
  }
  async function del() {
    if (!window.confirm("اطلاعات شخصی شما (شمارهٔ موبایل و پیوند کد ملی) فوراً حذف می‌شود و این کار قابل بازگشت نیست. ادامه می‌دهید؟")) return;
    try { await api.deleteAccount(); setAuth(null); } catch (e) { toast.error(e.message); }
  }

  return (
    <div className="bx-self">
      <header className="bx-self-head">
        <div className="bx-self-brand"><img src="/brand-mark.png" alt="" width="26" height="26" /><b>گزارش اعتباری من</b></div>
        <div className="bx-btn-row"><button className="bx-btn sm" onClick={del}><Trash2 size={15} /> حذف حساب</button><button className="bx-btn sm" onClick={onLogout}><LogOut size={15} /> خروج</button></div>
      </header>
      <main className="bx-self-main">
        {st.loading ? <div className="bx-center"><Spin /></div>
          : st.error ? <Card><Empty icon={ShieldCheck} text={st.error} /></Card>
          : st.needPay ? (
            <Card><CardHead eyebrow="PAYMENT" title="دریافت گزارش اعتباری" />
              <div className="bx-pay">
                <ShieldCheck size={38} />
                <p>شمارهٔ موبایل شما با کد ملی‌تان تطبیق داده شد. برای مشاهدهٔ رتبه و سوابق اعتباری خود، هزینهٔ گزارش را از درگاه پرداخت کنید.</p>
                <div className="bx-pay-price">{tomanFull(st.price ?? 0)}</div>
                <small>پس از پرداخت، گزارش تا {faDigits(st.hours ?? 24)} ساعت قابل مشاهده است.</small>
                <button className="bx-btn primary lg" onClick={pay} disabled={paying}>{paying ? <Loader2 size={18} className="spin" /> : <CreditCard size={18} />} پرداخت و مشاهدهٔ گزارش</button>
              </div>
            </Card>
          ) : (
            <>
              <div className="bx-again no-print">
                <div><b>استعلام تازه می‌خواهید؟</b><span>هر استعلام جدید {tomanFull(st.price ?? 0)} هزینه دارد؛ مشاهدهٔ مجدد همین گزارش تا {faDigits(24)} ساعت رایگان است.</span></div>
                <button className="bx-btn primary" onClick={pay} disabled={paying}>{paying ? <Loader2 size={16} className="spin" /> : <CreditCard size={16} />} استعلام جدید</button>
              </div>
              <ReportView data={st.data} mode="self" />
            </>
          )}
      </main>
    </div>
  );
}
