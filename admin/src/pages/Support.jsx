import React, { useEffect, useMemo, useRef, useState } from "react";
import { Send, CheckCheck, LifeBuoy, Clock, MessageCircle, Lock } from "lucide-react";
import { Card, Badge, Segmented, Empty, BizLogo } from "../ui.jsx";
import { fa, num, ago, fullDate, cleanName } from "../lib.js";

const STATUS = { open: ["باز", "warn"], answered: ["پاسخ داده‌شده", "info"], closed: ["بسته‌شده", "good"] };
const PRIORITY = { low: "کم", normal: "عادی", high: "فوری" };
const CATEGORY = { general: "عمومی", technical: "فنی", billing: "مالی", inquiry: "استعلام", account: "حساب کاربری" };

export default function Support({ tickets, onReply, onStatus }) {
  const [tab, setTab] = useState("open");
  const [sel, setSel] = useState(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);
  const counts = useMemo(() => ({ open: tickets.filter((t) => t.status === "open").length, answered: tickets.filter((t) => t.status === "answered").length, closed: tickets.filter((t) => t.status === "closed").length }), [tickets]);
  const list = tickets.filter((t) => tab === "all" || t.status === tab);
  const current = tickets.find((t) => t.id === sel) || null;
  useEffect(() => { if (!sel && list[0]) setSel(list[0].id); }, [tab, tickets]); // auto-open the first ticket
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [current?.messages?.length, sel]);

  async function send(close) {
    if (!text.trim()) return;
    setBusy(true);
    try { await onReply(current.id, text.trim(), close); setText(""); } finally { setBusy(false); }
  }

  return (
    <div className="support-wrap">
      <Card pad={false} className="ticket-list">
        <div className="toolbar"><Segmented value={tab} onChange={setTab} options={[["open", "باز", counts.open], ["answered", "پاسخ‌داده", counts.answered], ["closed", "بسته", counts.closed], ["all", "همه"]]} /></div>
        {list.length === 0 ? <div className="card-body"><Empty text="تیکتی در این دسته نیست." /></div> : (
          <ul>{list.map((t) => (
            <li key={t.id}><button className={sel === t.id ? "on" : ""} onClick={() => setSel(t.id)}>
              <BizLogo name={t.business.name} src={t.business.logoUrl} size={40} radius={12} />
              <div><b>{t.subject}</b><span>{cleanName(t.business.name)} · {ago(t.updatedAt)}</span></div>
              <div className="t-meta"><Badge tone={STATUS[t.status][1]}>{STATUS[t.status][0]}</Badge>{t.priority === "high" && <Badge tone="bad">فوری</Badge>}</div>
            </button></li>))}</ul>
        )}
      </Card>

      <Card pad={false} className="ticket-thread">
        {!current ? <div className="card-body"><Empty text="یک تیکت را انتخاب کنید." /></div> : (
          <>
            <header className="thread-head">
              <BizLogo name={current.business.name} src={current.business.logoUrl} size={46} radius={14} />
              <div><h3>{current.subject}</h3><span>{cleanName(current.business.name)} · {CATEGORY[current.category]} · اولویت {PRIORITY[current.priority]} · {fullDate(current.createdAt)}</span></div>
              <Badge tone={STATUS[current.status][1]}>{STATUS[current.status][0]}</Badge>
            </header>
            <div className="thread-body">
              {current.messages.map((m) => (
                <div key={m.id} className={`bubble ${m.sender}`}><p>{m.body}</p><time>{m.sender === "admin" ? "پشتیبانی" : cleanName(current.business.name)} · {fullDate(m.createdAt)}</time></div>
              ))}
              <div ref={endRef} />
            </div>
            {current.status === "closed" ? (
              <div className="thread-closed"><Lock size={16} /> این تیکت بسته شده است. <button className="link" onClick={() => onStatus(current.id, "open")}>بازگشایی</button></div>
            ) : (
              <div className="thread-reply">
                <textarea rows={3} placeholder="پاسخ خود را بنویسید…" value={text} onChange={(e) => setText(e.target.value)} />
                <div className="btn-row">
                  <button className="btn primary" disabled={busy || !text.trim()} onClick={() => send(false)}><Send size={16} /> ارسال پاسخ</button>
                  <button className="btn" disabled={busy || !text.trim()} onClick={() => send(true)}><CheckCheck size={16} /> ارسال و بستن تیکت</button>
                  <button className="btn" disabled={busy} onClick={() => onStatus(current.id, "closed")}>فقط بستن</button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
