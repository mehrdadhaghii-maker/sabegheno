import React, { useState } from "react";
import { LogOut, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { api, setAuth } from "../api.js";
import { Card, CardHead, useToast, formatPhone, dateTimeFa } from "./kit.jsx";

// Account & privacy: close sessions, delete the account (data.md).
export default function AccountPage({ auth, onLogout }) {
  const toast = useToast();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState(false);
  const ent = auth?.entity || {};

  async function closeAll() {
    setClosing(true);
    try { await api.logoutAll(); } catch { /* ignore */ }
    setAuth(null);
  }

  async function del() {
    setBusy(true);
    try {
      const r = await api.deleteAccount();
      try { sessionStorage.setItem("sabegheno_logout_reason", "حساب شما حذف شد و اطلاعات شخصی‌تان پاک شد."); } catch { /* ignore */ }
      toast.success(`اطلاعات شخصی شما همین حالا حذف شد؛ ردیف باقی‌ماندهٔ حساب تا ${r.hardDeleteAfterDays} روز دیگر نیز به‌طور کامل پاک می‌شود.`, "حساب حذف شد");
      setAuth(null);
    } catch (e) { toast.error(e.message); setBusy(false); }
  }

  return (
    <div className="bx-grid-2">
      <Card>
        <CardHead eyebrow="ACCOUNT" title="نشست و امنیت حساب" />
        <div className="bx-acc-list">
          <p><b>شمارهٔ موبایل:</b> <span dir="ltr">{formatPhone(ent.mobile || auth?.mobile)}</span></p>
          {ent.createdAt && <p><b>تاریخ ثبت‌نام:</b> {dateTimeFa(ent.createdAt)}</p>}
          <p className="bx-muted">برای امنیت بیشتر هر حساب فقط یک نشست فعال دارد: با ورود از دستگاه دیگر، نشست قبلی بسته می‌شود و پس از ۳۰ دقیقه بی‌فعالیتی نیز از حساب خارج می‌شوید.</p>
        </div>
        <div className="bx-btn-row">
          <button className="bx-btn" onClick={onLogout}><LogOut size={16} /> خروج از این دستگاه</button>
          <button className="bx-btn" onClick={closeAll} disabled={closing}>{closing ? <Loader2 size={16} className="spin" /> : <ShieldCheck size={16} />} بستن همهٔ نشست‌ها</button>
        </div>
      </Card>

      <Card accent="navy">
        <CardHead eyebrow="PRIVACY" title="حذف حساب و اطلاعات شخصی" />
        <div className="bx-acc-list">
          <p>با حذف حساب، <b>شمارهٔ موبایل، نام، لوگو، پیام‌های پشتیبانی و اعلان‌های شما فوراً پاک می‌شود</b> و از همهٔ دستگاه‌ها خارج می‌شوید. باقی‌ماندهٔ ردیف حساب و سوابق استعلام ظرف ۳۰ روز نیز به‌طور کامل حذف می‌شود.</p>
          <p className="bx-muted">این کار قابل بازگشت نیست. برای تأیید، عبارت «حذف» را بنویسید.</p>
          <input className="bx-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="حذف" aria-label="تأیید حذف حساب" />
        </div>
        <button className="bx-btn danger-solid wide" disabled={confirm.trim() !== "حذف" || busy} onClick={del}>
          {busy ? <Loader2 size={16} className="spin" /> : <Trash2 size={16} />} حذف دائمی حساب من
        </button>
      </Card>
    </div>
  );
}
