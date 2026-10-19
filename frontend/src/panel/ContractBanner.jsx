import React, { useEffect, useState } from "react";
import { FileSignature, Download, Check, Loader2 } from "lucide-react";
import { api } from "../api.js";
import { dateFa, faDigits, useToast } from "./kit.jsx";

// Shows up when the admin published a new contract that every business has to read and accept.
export default function ContractBanner() {
  const toast = useToast();
  const [c, setC] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { api.getContract().then(setC).catch(() => {}); }, []);
  if (!c?.current || !c.needsAcceptance) return null;
  const cur = c.current;
  async function accept() { setBusy(true); try { await api.acceptContract(); toast.success("قرارداد جدید تأیید شد."); setC({ ...c, needsAcceptance: false }); } catch (e) { toast.error(e.message); } finally { setBusy(false); } }
  return (
    <section className="bx-contract" role="alert">
      <span className="bx-contract-ic"><FileSignature size={22} /></span>
      <div><b>قرارداد جدید — نسخهٔ {faDigits(cur.version)}</b><p>«{cur.title}» از {dateFa(cur.createdAt)} جایگزین قرارداد قبلی شده است. لطفاً آن را مطالعه و تأیید کنید.{cur.note ? ` ${cur.note}` : ""}</p></div>
      <div className="bx-contract-act">
        <button className="bx-btn sm" onClick={() => api.downloadContract(cur.fileName).catch((e) => toast.error(e.message))}><Download size={15} /> دریافت قرارداد</button>
        <button className="bx-btn sm primary" disabled={busy} onClick={accept}>{busy ? <Loader2 size={15} className="spin" /> : <Check size={15} />} مطالعه کردم و می‌پذیرم</button>
      </div>
    </section>
  );
}
