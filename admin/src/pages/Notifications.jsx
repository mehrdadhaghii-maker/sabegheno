import React, { useState } from "react";
import { Send, Bell, Users, CheckCircle2, AlertTriangle, Info, AlertOctagon } from "lucide-react";
import { Card, Empty, BizLogo, Badge } from "../ui.jsx";
import { fa, num, ago, cleanName } from "../lib.js";

const LEVELS = { info: ["اطلاع‌رسانی", Info, "info"], success: ["موفقیت", CheckCircle2, "good"], warning: ["هشدار", AlertTriangle, "warn"], danger: ["مهم و فوری", AlertOctagon, "bad"] };

export default function Notifications({ businesses, history, onSend }) {
  const [f, setF] = useState({ title: "", body: "", level: "info", all: true, ids: [] });
  const [busy, setBusy] = useState(false);
  const targets = businesses.filter((b) => b.status !== "rejected");
  const count = f.all ? targets.length : f.ids.length;
  const toggle = (id) => setF((x) => ({ ...x, ids: x.ids.includes(id) ? x.ids.filter((i) => i !== id) : [...x.ids, id] }));
  const [, Icon, tone] = LEVELS[f.level];

  async function send() {
    setBusy(true);
    try { await onSend({ title: f.title.trim(), body: f.body.trim(), level: f.level, businessIds: f.all ? undefined : f.ids }); setF({ ...f, title: "", body: "" }); } finally { setBusy(false); }
  }

  return (
    <div className="notif-grid">
      <Card eyebrow="COMPOSE" title="ارسال اعلان به کسب‌وکارها">
        <div className="stack">
          <label className="field">عنوان<input value={f.title} maxLength={100} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="مثلاً: بروزرسانی سیاست اعتبار" /></label>
          <label className="field">متن پیام<textarea rows={4} value={f.body} maxLength={1000} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
          <div className="field">نوع اعلان
            <div className="level-pick">{Object.entries(LEVELS).map(([k, [l, I, t]]) => <button key={k} className={`${f.level === k ? "on" : ""} ${t}`} onClick={() => setF({ ...f, level: k })}><I size={16} />{l}</button>)}</div></div>
          <div className="field">گیرندگان
            <div className="segmented"><button className={f.all ? "on" : ""} onClick={() => setF({ ...f, all: true })}>همهٔ کسب‌وکارها ({fa(targets.length)})</button><button className={!f.all ? "on" : ""} onClick={() => setF({ ...f, all: false })}>انتخابی</button></div>
            {!f.all && <div className="recipient-grid">{targets.map((b) => (
              <button key={b.id} className={f.ids.includes(b.id) ? "on" : ""} onClick={() => toggle(b.id)}><BizLogo name={b.name} src={b.logoUrl} size={26} radius={8} />{cleanName(b.name)}</button>))}</div>}
          </div>
          <div className="notif-preview">
            <div className="eyebrow">پیش‌نمایش (زنگ اعلان کسب‌وکار)</div>
            <div className={`np-card ${tone}`}><Icon size={20} /><div><b>{f.title || "عنوان اعلان"}</b><p>{f.body || "متن پیام اینجا نمایش داده می‌شود."}</p></div></div>
          </div>
          <button className="btn primary lg" disabled={busy || f.title.trim().length < 2 || f.body.trim().length < 2 || count === 0} onClick={send}><Send size={17} /> ارسال به {fa(count)} کسب‌وکار</button>
        </div>
      </Card>

      <Card eyebrow="HISTORY" title="اعلان‌های ارسال‌شده" pad={false}>
        {history.length === 0 ? <div className="card-body"><Empty text="هنوز اعلانی ارسال نشده است." /></div> : (
          <ul className="notif-history">{history.map((n, i) => { const [, I, t] = LEVELS[n.level] || LEVELS.info; return (
            <li key={i}><span className={`kpi-icon ${t === "good" ? "" : t === "warn" ? "amber" : t === "bad" ? "bad" : "navy"}`}><I size={18} /></span>
              <div><b>{n.title}</b><p>{n.body}</p><small>{ago(n.createdAt)} · {num(n.recipients)} گیرنده · {num(n.read)} خوانده‌شده</small></div></li>); })}</ul>
        )}
      </Card>
    </div>
  );
}
