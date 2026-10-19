import React, { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Upload, Download, Loader2, Check, Globe, Eye, EyeOff } from "lucide-react";
import { adminApi, assetUrl, request } from "../api.js";
import { Badge, BizLogo, Card, Empty, Skeleton } from "../ui.jsx";
import { fa, cleanName } from "../lib.js";
import { tehranDateTime } from "./monitor/format.js";

const toBase64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("خواندن فایل ممکن نشد")); r.readAsDataURL(file); });

function Contracts() {
  const [d, setD] = useState(null), [err, setErr] = useState("");
  const [title, setTitle] = useState(""), [note, setNote] = useState(""), [re, setRe] = useState(true), [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false), [ok, setOk] = useState("");
  const input = useRef(null);
  const load = useCallback(() => adminApi.contracts().then((x) => { setD(x); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function publish() {
    setBusy(true); setErr(""); setOk("");
    try {
      if (!file) throw new Error("فایل PDF قرارداد را انتخاب کنید");
      if (file.size > 8 * 1024 * 1024) throw new Error("حجم فایل بیشتر از ۸ مگابایت است");
      const r = await adminApi.publishContract({ title: title.trim(), note: note.trim() || undefined, requireReaccept: re, fileName: file.name, dataBase64: await toBase64(file) });
      setOk(`نسخهٔ ${fa(r.version)} منتشر شد و برای ${fa(r.notified)} کسب‌وکار جایگزین شد.`);
      setTitle(""); setNote(""); setFile(null); if (input.current) input.current.value = ""; load();
    } catch (e) { setErr(e.fields?.[0]?.message || e.message); } finally { setBusy(false); }
  }
  async function download(c) {
    await request("/admin/security"); // makes sure the access token is fresh
    const a = JSON.parse(localStorage.getItem("sabegheno_admin_auth") || "{}");
    const base = (import.meta.env.VITE_API_BASE_URL || "http://localhost:4000");
    const r = await fetch(`${base}/admin/contracts/${c.id}/file`, { headers: { Authorization: `Bearer ${a.token}` } });
    if (!r.ok) { setErr("دریافت فایل ممکن نشد"); return; }
    const url = URL.createObjectURL(await r.blob());
    const el = Object.assign(document.createElement("a"), { href: url, download: c.fileName }); document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  const active = d?.items.find((c) => c.isActive);

  return (
    <Card eyebrow="قرارداد" title="قرارداد کسب‌وکارها (جایگزینی برای همه)">
      <div className="stack">
        <p className="muted small">فایل جدید PDF را بارگذاری کنید؛ بلافاصله «قرارداد جاری» همهٔ کسب‌وکارها می‌شود و به هرکدام اعلان می‌رود. با گزینهٔ «تأیید مجدد»، هر کسب‌وکار باید قرارداد جدید را در پنل خود بپذیرد. نسخه‌های قبلی در تاریخچه می‌مانند.</p>
        {active && <div className="callout info"><p><b>قرارداد جاری:</b> نسخهٔ {fa(active.version)} — {active.title} — پذیرفته‌شده توسط {fa(active.acceptedCount)} از {fa(d.total)} کسب‌وکار</p></div>}
        <div className="site-form">
          <label className="field">عنوان قرارداد<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="قرارداد همکاری سابقه‌نو — ۱۴۰۵" /></label>
          <label className="field">توضیح برای کسب‌وکارها (اختیاری)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
          <label className="site-file"><input ref={input} type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} /><Upload size={16} /> {file ? `${file.name} — ${fa(Math.round(file.size / 1024))} کیلوبایت` : "انتخاب فایل PDF (حداکثر ۸ مگابایت)"}</label>
          <label className="site-check"><input type="checkbox" checked={re} onChange={(e) => setRe(e.target.checked)} /> هر کسب‌وکار باید قرارداد جدید را دوباره تأیید کند</label>
          {err && <div className="callout bad"><p>{err}</p></div>}{ok && <div className="callout info"><p>{ok}</p></div>}
          <button className="btn primary" disabled={busy || title.trim().length < 3 || !file} onClick={publish}>{busy ? <Loader2 size={16} className="spin-i" /> : <FileText size={16} />} انتشار و جایگزینی برای همه</button>
        </div>
        {!d ? <Skeleton h={90} /> : d.items.length === 0 ? <Empty text="هنوز قراردادی منتشر نشده است" /> : (
          <div className="table-wrap"><table className="table compact">
            <thead><tr><th>نسخه</th><th>عنوان</th><th>تاریخ</th><th>حجم</th><th>تأییدشده</th><th /></tr></thead>
            <tbody>{d.items.map((c) => (
              <tr key={c.id}><td><b>{fa(c.version)}</b> {c.isActive && <Badge tone="good">جاری</Badge>}</td><td>{c.title}</td><td className="muted small">{tehranDateTime(c.createdAt)}</td><td>{fa(Math.round(c.sizeBytes / 1024))} KB</td>
                <td>{fa(c.acceptedCount)} / {fa(d.total)}</td><td className="row-actions"><button className="btn sm" onClick={() => download(c)}><Download size={14} /> دریافت</button></td></tr>))}</tbody>
          </table></div>)}
      </div>
    </Card>
  );
}

function Landing({ businesses }) {
  const [busy, setBusy] = useState(null), [err, setErr] = useState(""), [local, setLocal] = useState({});
  const rows = (businesses || []).filter((b) => b.status === "approved");
  const shown = (b) => (b.id in local ? local[b.id] : !!b.showOnLanding);
  async function toggle(b) {
    setBusy(b.id); setErr("");
    try { const r = await adminApi.setLanding(b.id, !shown(b)); setLocal((x) => ({ ...x, [b.id]: r.showOnLanding })); }
    catch (e) { setErr(e.message); } finally { setBusy(null); }
  }
  return (
    <Card eyebrow="لندینگ" title="شرکت‌هایی که به ما اعتماد کرده‌اند">
      <p className="muted small">برند و لوگوی کسب‌وکارهای تأییدشده‌ای که اینجا روشن کنید، زیر عنوان «شرکت‌هایی که به ما اعتماد کرده‌اند» در صفحهٔ اصلی سایت نمایش داده می‌شود. فقط نام برند و لوگو منتشر می‌شود (برای نمایش بهتر، لوگو را در پنل آنها بارگذاری کنید).</p>
      {err && <div className="callout bad"><p>{err}</p></div>}
      {rows.length === 0 ? <Empty text="هنوز کسب‌وکار تأییدشده‌ای وجود ندارد" /> : (
        <div className="site-biz">
          {rows.map((b) => (
            <div key={b.id} className={`site-biz-row ${shown(b) ? "on" : ""}`}>
              <BizLogo name={cleanName(b.brandName || b.name)} src={assetUrl(b.logoUrl)} size={40} />
              <div><b>{cleanName(b.brandName || b.name)}</b>{!b.logoUrl && <small className="bad">لوگو بارگذاری نشده — فقط نام نمایش داده می‌شود</small>}</div>
              <button className="btn sm" disabled={busy === b.id} onClick={() => toggle(b)}>{busy === b.id ? <Loader2 size={14} className="spin-i" /> : shown(b) ? <Eye size={14} /> : <EyeOff size={14} />} {shown(b) ? "نمایش داده می‌شود" : "نمایش نده"}</button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function Site({ businesses }) { return <div className="stack"><Contracts /><Landing businesses={businesses} /></div>; }
