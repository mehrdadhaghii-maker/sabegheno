import React, { useState } from "react";
import { AlertTriangle, Lock, Hourglass, FileSignature, Download, LifeBuoy, ShieldOff, XCircle, Loader2 } from "lucide-react";
import { api } from "../api.js";
import { useToast } from "./kit.jsx";

// Screens that need an APPROVED business (they call APIs that answer 403 otherwise).
export const NEEDS_APPROVAL = new Set(["dashboard", "newcheck", "providerreport", "history", "creditmap", "credits", "facilities", "api"]);

const COPY = {
  pending_docs: { tone: "warn", icon: Hourglass, title: "در انتظار تأیید مدارک",
    text: "مدارک شما در حال بررسی توسط تیم سابقه‌نو است. تا پایان بررسی، استعلام، ثبت اعتبار و اتصال API غیرفعال است؛ نیازی به اقدام دیگری نیست و پس از تأیید، نتیجه با اعلان به شما می‌رسد.", next: "support" },
  pending_contract: { tone: "warn", icon: FileSignature, title: "در انتظار امضای قرارداد",
    text: "مدارک شما تأیید شد. مرحلهٔ آخر قرارداد است: آن را دریافت و امضا کنید و فایل امضاشده را به‌صورت پیوست در یک تیکت پشتیبانی بفرستید. پس از ثبت، حساب شما فعال می‌شود.", next: "contract" },
  suspended: { tone: "bad", icon: ShieldOff, title: "حساب تعلیق شده است",
    text: "دسترسی شما به استعلام، ثبت اعتبار و API موقتاً قطع شده است. برای اطلاع از دلیل و رفع تعلیق با پشتیبانی تماس بگیرید.", next: "support" },
  rejected: { tone: "bad", icon: XCircle, title: "درخواست ثبت‌نام رد شد",
    text: "برای اصلاح و بررسی مجدد، از بخش «پشتیبانی» تیکت ثبت کنید و مدارک اصلاح‌شده را پیوست کنید.", next: "support" },
};

function Actions({ kind, setScreen }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const dl = async () => { setBusy(true); try { await api.downloadContract("contract.pdf"); } catch (e) { toast.error(e.message); } finally { setBusy(false); } };
  return (
    <div className="acct-actions">
      {kind === "contract" && <button className="bx-btn sm primary" onClick={dl} disabled={busy}>{busy ? <Loader2 size={15} className="spin" /> : <Download size={15} />} دریافت قرارداد</button>}
      <button className="bx-btn sm" onClick={() => setScreen("support")}><LifeBuoy size={15} /> {kind === "contract" ? "ارسال قرارداد امضاشده" : "رفتن به پشتیبانی"}</button>
    </div>
  );
}

/** Slim notice for screens that do NOT need approval (support, FAQ, account). */
export function AccountChip({ status, setScreen }) {
  const c = COPY[status]; if (!c) return null;
  return (
    <div className={`acct-chip ${c.tone}`} role="status"><c.icon size={16} /><span><b>{c.title}</b> — برخی بخش‌ها تا فعال‌شدن حساب قفل است.</span>{c.next === "contract" && <button onClick={() => setScreen("account")}>جزئیات</button>}</div>
  );
}

/** Replaces a screen that would only answer 403 — explains WHY and WHAT to do next. */
export function LockedScreen({ status, reason, setScreen }) {
  const c = COPY[status] || COPY.pending_docs;
  return (
    <section className={`acct-locked ${c.tone}`} role="alert">
      <span className="acct-lock"><Lock size={30} /></span>
      <div className="acct-ic"><c.icon size={22} /></div>
      <h2>{c.title}</h2>
      <p>{c.text}</p>
      {status === "rejected" && reason && <p className="acct-reason"><AlertTriangle size={16} /> دلیل رد: {reason}</p>}
      <Actions kind={c.next} setScreen={setScreen} />
    </section>
  );
}
