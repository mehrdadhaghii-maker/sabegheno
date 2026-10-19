import React, { useEffect, useState } from "react";
import { Loader2, XCircle, CheckCircle2 } from "lucide-react";
import { api } from "../api.js";

// The payment gateway sends the browser back to /payment/return?Authority=…&Status=OK
export default function PaymentReturn() {
  const [st, setSt] = useState({ phase: "verifying", message: "" });
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const authority = q.get("Authority");
    if (!authority) { setSt({ phase: "failed", message: "پارامتر پرداخت یافت نشد" }); return; }
    api.verifyReportPayment(authority, q.get("Status") || undefined)
      .then(() => { setSt({ phase: "ok", message: "" }); setTimeout(() => window.location.replace("/"), 1200); })
      .catch((e) => setSt({ phase: "failed", message: e.message }));
  }, []);
  return (
    <div className="bx-pay-return" dir="rtl">
      {st.phase === "verifying" && <><Loader2 size={42} className="spin" /><h2>در حال تأیید پرداخت…</h2></>}
      {st.phase === "ok" && <><CheckCircle2 size={42} style={{ color: "#12805C" }} /><h2>پرداخت موفق بود</h2><p>در حال انتقال به گزارش شما…</p></>}
      {st.phase === "failed" && <><XCircle size={42} style={{ color: "#D64550" }} /><h2>پرداخت تأیید نشد</h2><p>{st.message}</p><button className="bx-btn primary" onClick={() => window.location.replace("/")}>بازگشت</button></>}
    </div>
  );
}
