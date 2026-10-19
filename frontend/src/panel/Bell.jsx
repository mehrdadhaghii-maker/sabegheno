import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, Check, Info, CheckCircle2, AlertTriangle, AlertOctagon, X, BellOff, History } from "lucide-react";
import { api } from "../api.js";
import { agoFa, num, useToast } from "./kit.jsx";

const LEVEL = { info: [Info, "info"], success: [CheckCircle2, "success"], warning: [AlertTriangle, "warning"], danger: [AlertOctagon, "danger"] };
const POLL_MS = 15000;

/**
 * Notification centre.
 *  • desktop: popover under the bell · phone: full-screen sheet with the ✕ at the TOP-LEFT (RTL "end")
 *  • "تأیید" marks a message read AND removes it from the list; read ones live under "سوابق"
 *  • refreshes every 15 s, when the tab becomes visible again and whenever the panel is opened
 */
export default function NotificationBell() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [showRead, setShowRead] = useState(false);
  const [leaving, setLeaving] = useState({});            // ids animating out
  const [loaded, setLoaded] = useState(false);
  const seen = useRef(null);                             // ids already announced → a toast pops once per new message
  const box = useRef(null);
  const closeBtn = useRef(null);

  const load = useCallback(() => api.getNotifications().then((d) => {
    if (seen.current && d.items.some((n) => n.kind === "inquiry_reviewed" && !seen.current.has(n.id))) window.dispatchEvent(new Event("sabegheno:data-changed")); // an admin decided an inquiry → refresh lists/reports
    if (seen.current) d.items.filter((n) => !n.readAt && !seen.current.has(n.id)).slice(0, 2).forEach((n) => toast.push(n.body, n.level === "danger" ? "error" : n.level === "success" ? "success" : n.level === "warning" ? "warning" : "info", { title: n.title }));
    seen.current = new Set(d.items.map((n) => n.id));
    setItems(d.items); setLoaded(true);
  }).catch(() => {}), [toast]);

  useEffect(() => {
    load();
    const tick = () => { if (!document.hidden) load(); };
    const i = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick); window.addEventListener("focus", tick);
    return () => { clearInterval(i); document.removeEventListener("visibilitychange", tick); window.removeEventListener("focus", tick); };
  }, [load]);

  useEffect(() => {                                       // outside click (desktop), Esc, scroll lock on the phone sheet
    if (!open) return undefined;
    load();
    const out = (e) => box.current && !box.current.contains(e.target) && window.innerWidth > 640 && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", out); document.addEventListener("keydown", esc);
    const prev = document.body.style.overflow; if (window.innerWidth <= 640) document.body.style.overflow = "hidden";
    closeBtn.current?.focus();
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); document.body.style.overflow = prev; };
  }, [open, load]);

  const unread = items.filter((n) => !n.readAt);
  const visible = (showRead ? items : unread).slice(0, 40);

  async function confirmOne(n) {
    setLeaving((l) => ({ ...l, [n.id]: true }));
    setTimeout(() => setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x))), 220);
    try { await api.readNotification(n.id); }
    catch { setLeaving((l) => ({ ...l, [n.id]: false })); setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, readAt: null } : x))); toast.error("تأیید پیام انجام نشد؛ دوباره تلاش کنید"); }
    finally { setTimeout(() => setLeaving((l) => { const { [n.id]: _, ...rest } = l; return rest; }), 260); }
  }
  async function confirmAll() {
    const ids = unread.map((n) => n.id); ids.forEach((id) => setLeaving((l) => ({ ...l, [id]: true })));
    setTimeout(() => setItems((xs) => xs.map((x) => (x.readAt ? x : { ...x, readAt: new Date().toISOString() }))), 220);
    try { await api.readAllNotifications(); } catch { toast.error("تأیید همه انجام نشد"); load(); }
    setTimeout(() => setLeaving({}), 300);
  }

  return (
    <div className="nt" ref={box}>
      <button className="bx-icon-btn" onClick={() => setOpen(!open)} aria-label={`اعلان‌ها (${unread.length} خوانده‌نشده)`} aria-expanded={open} aria-haspopup="dialog">
        <Bell size={20} />{unread.length > 0 && <span className="badge">{unread.length > 99 ? "۹۹+" : num(unread.length)}</span>}
      </button>
      {open && (
        <>
          <div className="nt-backdrop" onClick={() => setOpen(false)} aria-hidden="true" />
          <section className="nt-panel" role="dialog" aria-modal="true" aria-label="اعلان‌ها">
            <header className="nt-head">
              <div className="nt-title"><b>اعلان‌ها</b>{unread.length > 0 && <span>{num(unread.length)} خوانده‌نشده</span>}</div>
              <button ref={closeBtn} className="nt-close" onClick={() => setOpen(false)} aria-label="بستن"><X size={20} /></button>
            </header>
            <div className="nt-tools">
              <button onClick={() => setShowRead(!showRead)} className={showRead ? "on" : ""}><History size={15} /> {showRead ? "فقط خوانده‌نشده‌ها" : "نمایش سوابق"}</button>
              {unread.length > 1 && <button onClick={confirmAll}><CheckCheck size={15} /> تأیید همه</button>}
            </div>
            <ul className="nt-list">
              {!loaded ? <li className="nt-empty">در حال بارگذاری…</li>
                : visible.length === 0 ? <li className="nt-empty"><BellOff size={34} /><b>{showRead ? "اعلانی وجود ندارد" : "همهٔ اعلان‌ها را تأیید کرده‌اید"}</b><span>پیام‌های تازه همین‌جا و به‌صورت خودکار نمایش داده می‌شوند.</span></li>
                : visible.map((n) => { const [I, t] = LEVEL[n.level] || LEVEL.info; const isRead = !!n.readAt;
                  return (
                    <li key={n.id} className={`nt-item ${t} ${isRead ? "read" : "unread"} ${leaving[n.id] ? "leaving" : ""}`}>
                      <span className="nt-ico"><I size={19} /></span>
                      <div className="nt-body"><b>{n.title}</b><p>{n.body}</p><small>{agoFa(n.createdAt)}</small>{n.refId && <button type="button" className="bx-link" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("sabegheno:open-check", { detail: { id: n.refId } })); }}>مشاهدهٔ گزارش</button>}</div>
                      {!isRead && <button className="nt-ok" onClick={() => confirmOne(n)} aria-label={`تأیید پیام «${n.title}»`}><Check size={16} /> تأیید</button>}
                    </li>
                  ); })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
