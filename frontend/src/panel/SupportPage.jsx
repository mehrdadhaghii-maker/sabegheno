import React, { useEffect, useRef, useState } from "react";
import { Send, Plus, LifeBuoy, Paperclip, Loader2, MessageCircle } from "lucide-react";
import { api } from "../api.js";
import { Card, CardHead, Badge, Field, Empty, Spin, num, dateTimeFa, agoFa, useToast } from "./kit.jsx";

const STATUS = { open: ["در انتظار پاسخ", "warn"], answered: ["پاسخ داده شد", "info"], closed: ["بسته‌شده", "good"] };
const CAT = { general: "عمومی", technical: "فنی", billing: "مالی", inquiry: "استعلام", account: "حساب کاربری" };

export default function SupportPage() {
  const toast = useToast();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState(null);
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ subject: "", category: "general", priority: "normal", body: "" });
  const [touched, setTouched] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef(null);

  const load = (poll) => api.listTickets(poll === true).then((t) => { setTickets(t); return t; }).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  useEffect(() => { load().then((t) => t?.[0] && setSel(t[0].id)); const i = setInterval(() => load(true), 30000); return () => clearInterval(i); }, []);
  const current = tickets.find((t) => t.id === sel);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [current?.messages?.length, sel]);

  const errs = { subject: f.subject.trim().length < 3 ? "موضوع حداقل ۳ کاراکتر باشد" : "", body: f.body.trim().length < 5 ? "شرح مشکل را بنویسید (حداقل ۵ کاراکتر)" : "" };
  async function create(e) {
    e.preventDefault(); setTouched(true);
    if (errs.subject || errs.body) return;
    setBusy(true);
    try {
      const t = await api.createTicket({ ...f, subject: f.subject.trim(), body: f.body.trim() });
      toast.success("تیکت شما ثبت شد و به‌زودی توسط پشتیبانی پاسخ داده می‌شود.", "تیکت ثبت شد");
      setF({ subject: "", category: "general", priority: "normal", body: "" }); setTouched(false); setCreating(false);
      await load(); setSel(t.id);
    } catch (e2) { toast.error(e2.message, "ثبت تیکت ناموفق"); } finally { setBusy(false); }
  }
  async function send() {
    if (!reply.trim()) return;
    setBusy(true);
    try { await api.replyTicket(current.id, reply.trim()); setReply(""); toast.success("پیام شما ارسال شد"); await load(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="bx-support">
      <Card className="no-pad bx-tlist">
        <div className="bx-card-pad"><button className="bx-btn primary wide" onClick={() => { setCreating(true); setSel(null); }}><Plus size={17} /> تیکت جدید</button></div>
        {loading ? <Spin /> : tickets.length === 0 ? <Empty icon={LifeBuoy} text="هنوز تیکتی ثبت نکرده‌اید." /> : (
          <ul>{tickets.map((t) => (
            <li key={t.id}><button className={sel === t.id && !creating ? "on" : ""} onClick={() => { setSel(t.id); setCreating(false); }}>
              <div><b>{t.subject}</b><small>{CAT[t.category]} · {agoFa(t.updatedAt)}</small></div><Badge tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge></button></li>))}</ul>
        )}
      </Card>

      <Card className="no-pad bx-thread">
        {creating || (!current && !loading) ? (
          <form className="bx-card-pad bx-stack" onSubmit={create} noValidate>
            <CardHead eyebrow="NEW TICKET" title="ثبت تیکت پشتیبانی" />
            <Field label="موضوع" required error={touched && errs.subject}><span className="bx-input"><input value={f.subject} maxLength={120} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="مثلاً: خطا در ثبت استعلام" /></span></Field>
            <div className="bx-form-grid">
              <Field label="دسته‌بندی"><select className="bx-select" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(CAT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
              <Field label="اولویت"><select className="bx-select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="low">کم</option><option value="normal">عادی</option><option value="high">فوری</option></select></Field>
            </div>
            <Field label="شرح مشکل" required error={touched && errs.body} hint="شناسهٔ استعلام و جزئیات خطا را بنویسید تا سریع‌تر بررسی شود."><textarea className="bx-textarea" rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field>
            <button className="bx-btn primary lg" disabled={busy}>{busy ? <><Loader2 size={18} className="spin" /> در حال ارسال…</> : <><Send size={17} /> ارسال تیکت</>}</button>
          </form>
        ) : current ? (
          <>
            <header className="bx-thread-head"><div><h3>{current.subject}</h3><small>{CAT[current.category]} · {dateTimeFa(current.createdAt)}</small></div><Badge tone={STATUS[current.status][1]}>{STATUS[current.status][0]}</Badge></header>
            <div className="bx-thread-body">{current.messages.map((m) => <div key={m.id} className={`bx-bubble ${m.sender}`}><p>{m.body}</p><time>{m.sender === "admin" ? "پشتیبانی سابقه‌نو" : "شما"} · {dateTimeFa(m.createdAt)}</time></div>)}<div ref={end} /></div>
            <div className="bx-thread-reply"><textarea className="bx-textarea" rows={3} placeholder={current.status === "closed" ? "با ارسال پیام، تیکت دوباره باز می‌شود…" : "پیام خود را بنویسید…"} value={reply} onChange={(e) => setReply(e.target.value)} />
              <button className="bx-btn primary" disabled={busy || !reply.trim()} onClick={send}><Send size={16} /> ارسال</button></div>
          </>
        ) : <Spin />}
      </Card>
    </div>
  );
}
