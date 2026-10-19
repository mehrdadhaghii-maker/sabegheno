import React, { useEffect, useMemo, useState } from "react";
import { Search, Download, Printer, FileText, LayoutGrid, Rows3, X, RotateCcw, ShieldAlert } from "lucide-react";
import { api } from "../api.js";
import { Card, Badge, Empty, Spin, DECISION, decisionMeta, num, toman, faDigits, dateTimeFa, dateFa, agoFa, useToast, NationalId, useLiveRefresh, effectiveStatus } from "./kit.jsx";

const PAGE = 12;

export default function History({ openCheck, auth }) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ q: "", decision: "", from: "", to: "", overlap: false, sort: "new" });
  const [view, setView] = useState("table");
  const [page, setPage] = useState(0);
  const set = (p) => { setF((x) => ({ ...x, ...p })); setPage(0); };

  // silent = background refresh (focus / timer / "an admin decided an inquiry" event) → no spinner, no error toast
  const load = (silent) => api.listCreditChecks().then(setRows).catch((e) => { if (silent !== true) toast.error(e.message); }).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);
  // while anything waits for advanced validation, look again every 20 s so the new status appears by itself
  useLiveRefresh(load, { active: rows.some((r) => r.awaitingReview), ms: 20000 });

  const list = useMemo(() => {
    const out = rows.filter((r) => {
      const day = new Date(r.createdAt).toISOString().slice(0, 10);
      const q = f.q.trim().toLowerCase();
      return (!q || r.id.toLowerCase().includes(q) || String(r.nationalId || "").includes(q)) && (!f.decision || effectiveStatus(r) === f.decision) && (!f.from || day >= f.from) && (!f.to || day <= f.to) && (!f.overlap || r.concurrentProviders >= 1);
    });
    return out.sort({ new: (a, b) => new Date(b.createdAt) - new Date(a.createdAt), score: (a, b) => b.score - a.score, amount: (a, b) => b.requestedAmount - a.requestedAmount }[f.sort]);
  }, [rows, f]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const view_ = list.slice(page * PAGE, page * PAGE + PAGE);
  const summary = useMemo(() => ({ a: list.filter((r) => effectiveStatus(r) === "approve").length, r: list.filter((r) => effectiveStatus(r) === "review").length, d: list.filter((r) => effectiveStatus(r) === "decline").length }), [list]);
  const active = [f.q, f.decision, f.from, f.to, f.overlap].filter(Boolean).length;

  function pdf(r, e) { e?.stopPropagation(); toast.info("گزارش کامل باز می‌شود؛ در پنجرهٔ چاپ «ذخیره به‌صورت PDF» را انتخاب کنید.", "آماده‌سازی گزارش"); openCheck(r.id, { print: true }, r, null); }
  function csv() {
    const head = ["شناسه", "کد ملی", "مبلغ", "مدت (ماه)", "امتیاز", "تصمیم", "سقف پیشنهادی", "هم‌پوشانی", "تاریخ"];
    const body = list.map((r) => [r.id, r.nationalId ? `'${r.nationalId}` : "", r.requestedAmount, r.termMonths, r.score, decisionMeta(r).label, r.recommendedLimit, r.concurrentProviders, new Date(r.createdAt).toLocaleString("fa-IR")]);
    const text = "\uFEFF" + [head, ...body].map((r) => r.map((x) => `"${String(x ?? "").replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })), download: "sabegheno-history.csv" }); a.click(); toast.success("فایل جدولی دانلود شد");
  }

  return (
    <div className="bx-stack">
      <div className="bx-tiles three">
        {[["approve", summary.a], ["review", summary.r], ["decline", summary.d]].map(([k, v]) => (
          <button key={k} className={`bx-tile pick tone-${k === "approve" ? "teal" : k === "review" ? "amber" : "red"} ${f.decision === k ? "sel" : ""}`} onClick={() => set({ decision: f.decision === k ? "" : k })}>
            <span className="bx-tile-ico"><FileText size={22} /></span><div><div className="bx-tile-label">{DECISION[k].label}</div><div className="bx-tile-value">{num(v)}</div></div>
          </button>))}
      </div>

      <Card className="no-pad">
        <div className="bx-filterbar">
          <label className="bx-search"><Search size={17} /><input placeholder="جستجوی کد ملی یا شناسه استعلام…" value={f.q} onChange={(e) => set({ q: e.target.value })} />{f.q && <button type="button" onClick={() => set({ q: "" })}><X size={14} /></button>}</label>
          <select value={f.decision} onChange={(e) => set({ decision: e.target.value })}><option value="">همهٔ وضعیت‌ها</option>{Object.entries(DECISION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
          <label className="bx-date">از<input type="date" value={f.from} onChange={(e) => set({ from: e.target.value })} /></label>
          <label className="bx-date">تا<input type="date" value={f.to} onChange={(e) => set({ to: e.target.value })} /></label>
          <button className={`bx-chip ${f.overlap ? "on" : ""}`} onClick={() => set({ overlap: !f.overlap })}><ShieldAlert size={15} /> فقط هم‌پوشانی‌دار</button>
          <select value={f.sort} onChange={(e) => set({ sort: e.target.value })}><option value="new">جدیدترین</option><option value="score">بالاترین امتیاز</option><option value="amount">بیشترین مبلغ</option></select>
          <div className="bx-viewtoggle"><button className={view === "table" ? "on" : ""} onClick={() => setView("table")} aria-label="جدول"><Rows3 size={17} /></button><button className={view === "cards" ? "on" : ""} onClick={() => setView("cards")} aria-label="کارت"><LayoutGrid size={17} /></button></div>
          <button className="bx-btn" onClick={csv} disabled={!list.length}><Download size={16} /> CSV</button>
        </div>
        <div className="bx-filter-sum"><span>{num(list.length)} از {num(rows.length)} استعلام</span>{active > 0 && <button className="bx-link" onClick={() => { setF({ q: "", decision: "", from: "", to: "", overlap: false, sort: "new" }); setPage(0); }}><RotateCcw size={13} /> حذف فیلترها</button>}</div>

        {loading ? <Spin /> : view_.length === 0 ? <Empty icon={FileText} text="استعلامی با این فیلترها پیدا نشد." /> : view === "table" ? (
          <div className="bx-table-wrap"><table className="bx-table">
            <thead><tr><th>شناسه</th><th>کد ملی</th><th>مبلغ و مدت</th><th>امتیاز</th><th>وضعیت</th><th>سقف پیشنهادی</th><th>هم‌پوشانی</th><th>زمان</th><th>گزارش</th></tr></thead>
            <tbody>{view_.map((r) => (
              <tr key={r.id} tabIndex={0} onClick={() => openCheck(r.id, {}, r, null)} onKeyDown={(e) => e.key === "Enter" && openCheck(r.id, {}, r, null)}>
                <td className="mono">{r.id.slice(0, 8)}</td><td><NationalId value={r.nationalId} masked={r.nationalIdMasked} /></td><td>{toman(r.requestedAmount)}<small className="muted"> · {num(r.termMonths)} ماه</small></td>
                <td><span className="bx-score" style={{ "--c": decisionMeta(r).color }}>{num(r.score)}</span></td>
                <td><Badge tone={decisionMeta(r).tone}>{decisionMeta(r).label}</Badge>{r.reviewedDecision && <small className="muted"> پس از بررسی پیشرفته</small>}</td><td>{r.awaitingReview ? "پس از بررسی" : effectiveStatus(r) === "decline" ? "—" : toman(r.recommendedLimit)}</td>
                <td>{r.concurrentProviders >= 1 ? <Badge tone="warn"><ShieldAlert size={12} /> {num(r.concurrentProviders)}</Badge> : <span className="muted">—</span>}</td>
                <td className="muted" title={dateTimeFa(r.createdAt)}>{agoFa(r.createdAt)}</td>
                <td><button className="bx-btn sm" onClick={(e) => pdf(r, e)}><Printer size={14} /> PDF</button></td>
              </tr>))}</tbody></table></div>
        ) : (
          <div className="bx-cards">{view_.map((r) => (
            <article key={r.id} className="bx-hcard" tabIndex={0} onClick={() => openCheck(r.id, {}, r, null)}>
              <header><span className="bx-score big" style={{ "--c": decisionMeta(r).color }}>{num(r.score)}</span><div><Badge tone={decisionMeta(r).tone}>{decisionMeta(r).label}</Badge><small className="mono muted">{r.id.slice(0, 8)}</small><NationalId value={r.nationalId} masked={r.nationalIdMasked} /></div></header>
              <dl><div><dt>مبلغ</dt><dd>{toman(r.requestedAmount)}</dd></div><div><dt>سقف پیشنهادی</dt><dd>{toman(r.recommendedLimit)}</dd></div><div><dt>مدت</dt><dd>{num(r.termMonths)} ماه</dd></div><div><dt>تاریخ</dt><dd>{dateFa(r.createdAt)}</dd></div></dl>
              {r.overrideReason && <p className="bx-reason"><ShieldAlert size={14} /> {r.overrideReason}</p>}
              <button className="bx-btn sm wide" onClick={(e) => pdf(r, e)}><Printer size={14} /> دریافت / چاپ PDF</button>
            </article>))}</div>
        )}
        <div className="bx-pager"><span>صفحهٔ {faDigits(page + 1)} از {faDigits(pages)}</span><div><button className="bx-btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>قبلی</button><button className="bx-btn sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>بعدی</button></div></div>
      </Card>
    </div>
  );
}
