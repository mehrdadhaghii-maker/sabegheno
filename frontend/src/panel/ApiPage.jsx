import React, { useEffect, useState } from "react";
import { KeyRound, Copy, Trash2, Plus, Loader2, Check, TerminalSquare } from "lucide-react";
import { api, BASE_URL } from "../api.js";
import { Card, CardHead, Badge, Empty, Spin, dateTimeFa, useToast } from "./kit.jsx";
import { apiBase, ENDPOINTS, snippets } from "./apiDocs.js";

const TABS = [["curl", "cURL"], ["node", "Node.js"], ["php", "PHP"], ["python", "Python"]];

export default function ApiPage() {
  const toast = useToast();
  const [keys, setKeys] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState(null);
  const [tab, setTab] = useState("curl");
  const [copied, setCopied] = useState("");
  const base = apiBase(BASE_URL);
  const code = snippets(base, fresh?.key);

  const load = () => api.listApiKeys().then(setKeys).catch((e) => { toast.error(e.message); setKeys([]); });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copy = async (text, id) => { try { await navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1500); } catch { toast.warning("کپی نشد؛ متن را دستی انتخاب کنید"); } };
  async function create(e) {
    e.preventDefault(); if (name.trim().length < 2) return;
    setBusy(true);
    try { setFresh(await api.createApiKey(name.trim())); setName(""); load(); } catch (x) { toast.error(x.message); } finally { setBusy(false); }
  }
  async function revoke(k) {
    if (!window.confirm(`کلید «${k.name}» باطل شود؟ سیستم‌هایی که از آن استفاده می‌کنند از کار می‌افتند.`)) return;
    try { await api.revokeApiKey(k.id); toast.success("کلید باطل شد"); load(); } catch (x) { toast.error(x.message); }
  }

  return (
    <div className="bx-stack">
      <Card><CardHead eyebrow="API KEYS" title="کلیدهای دسترسی (API Key)" />
        <p className="bx-muted">با کلید API، سیستم خودتان (فروشگاه، CRM، نرم‌افزار اقساط) بدون ورود دستی اطلاعات، همان لحظه از سابقه‌نو استعلام می‌گیرد و وضعیت اعتبارها و تسویه‌ها را به ما اعلام می‌کند.</p>
        <form className="bx-key-form" onSubmit={create}>
          <input className="bx-input small" value={name} onChange={(e) => setName(e.target.value)} placeholder="نام کلید، مثلاً «سایت فروشگاه»" maxLength={60} aria-label="نام کلید" />
          <button className="bx-btn primary" disabled={busy || name.trim().length < 2}>{busy ? <Loader2 size={16} className="spin" /> : <Plus size={16} />} ساخت کلید</button>
        </form>
        {fresh && (
          <div className="bx-key-new" role="status">
            <b>کلید جدید — همین حالا ذخیره کنید؛ دیگر نمایش داده نمی‌شود.</b>
            <code dir="ltr">{fresh.key}</code>
            <button className="bx-btn sm" onClick={() => copy(fresh.key, "new")}>{copied === "new" ? <Check size={14} /> : <Copy size={14} />} کپی</button>
          </div>
        )}
        {!keys ? <div className="bx-center"><Spin /></div> : keys.length === 0 ? <Empty icon={KeyRound} text="هنوز کلیدی نساخته‌اید." /> : (
          <div className="bx-table-wrap"><table className="bx-table">
            <thead><tr><th>نام</th><th>کلید</th><th>ساخته‌شده</th><th>آخرین استفاده</th><th>وضعیت</th><th /></tr></thead>
            <tbody>{keys.map((k) => (
              <tr key={k.id}><td><b>{k.name}</b></td><td dir="ltr"><code>{k.prefix}…</code></td><td>{dateTimeFa(k.createdAt)}</td><td>{k.lastUsedAt ? dateTimeFa(k.lastUsedAt) : "—"}</td>
                <td>{k.revokedAt ? <Badge tone="bad">باطل</Badge> : <Badge tone="good">فعال</Badge>}</td>
                <td className="row-actions">{!k.revokedAt && <button className="bx-btn sm" onClick={() => revoke(k)}><Trash2 size={14} /> ابطال</button>}</td></tr>))}</tbody>
          </table></div>)}
      </Card>

      <Card accent="navy"><CardHead eyebrow="QUICK START" title="راهنمای اتصال" />
        <p className="bx-muted">آدرس پایه: <code dir="ltr">{base}</code> · هدر احراز هویت: <code dir="ltr">X-API-Key</code> · سقف: ۱۲۰ درخواست در دقیقه برای هر کلید. تاریخ تولد (اختیاری) شمسی و به شکل <code dir="ltr">1371/5/12</code> است.</p>
        <div className="bx-tabs">{TABS.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
        <div className="bx-code"><button className="bx-btn sm" onClick={() => copy(code[tab], "code")}>{copied === "code" ? <Check size={14} /> : <Copy size={14} />}</button><pre dir="ltr">{code[tab]}</pre></div>
        <h4 className="bx-h4"><TerminalSquare size={16} /> اعلام اعتبار و تسویه</h4>
        <div className="bx-code"><pre dir="ltr">{code.facility}</pre></div>
        <div className="bx-code"><pre dir="ltr">{code.settle}</pre></div>
        <p className="bx-muted">⏱ وضعیت اعتبارها باید حداکثر هر ۷۲ ساعت به‌روز شود (تسویه را بلافاصله اعلام کنید)؛ در غیر این صورت یادآوری می‌گیرید.</p>
        <ul className="bx-ep">{ENDPOINTS.map(([m, p, d]) => <li key={m + p}><b className={m}>{m}</b><code dir="ltr">{p}</code><span>{d}</span></li>)}</ul>
      </Card>
    </div>
  );
}
