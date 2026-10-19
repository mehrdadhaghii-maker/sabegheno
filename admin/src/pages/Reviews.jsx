import React, { useCallback, useEffect, useState } from "react";
import { Hourglass, Check, X, Loader2, Building2, AlertTriangle, FileSearch } from "lucide-react";
import { adminApi, assetUrl } from "../api.js";
import { Badge, BizLogo, Card, Drawer, Empty, MoneyInput, Skeleton, NationalIdCell } from "../ui.jsx";
import { fa, num, toman, ago, cleanName, gradeOf, gradeTone, fitCls, STATUS_FA } from "../lib.js";
import { tehranDateTime } from "./monitor/format.js";

const TONE = { current: "good", overdue: "warn", delinquent: "bad", doubtful: "bad", settled: "neutral" };

function Detail({ id, onDone }) {
  const [d, setD] = useState(null), [err, setErr] = useState("");
  const [decision, setDecision] = useState("approve");
  const [note, setNote] = useState(""), [limit, setLimit] = useState(null), [busy, setBusy] = useState(false);
  useEffect(() => { adminApi.review(id).then((x) => { setD(x); setLimit(x.check.recommendedLimit); }).catch((e) => setErr(e.message)); }, [id]);
  if (err) return <div className="callout bad"><p>{err}</p></div>;
  if (!d) return <Skeleton h={300} />;
  const c = d.check, done = !!c.reviewedDecision;
  async function submit() {
    setBusy(true); setErr("");
    try { await adminApi.decideReview(id, { decision, note: note.trim() || undefined, ...(decision === "approve" ? { limit: limit ?? 0 } : {}) }); onDone(); }
    catch (e) { setErr(e.message); setBusy(false); }
  }
  return (
    <div className="stack">
      <div className="rv-hero">
        <div><small>امتیاز</small><b>{fa(c.score)}</b></div>
        <div><small>رتبه</small><b><Badge tone={gradeTone(d.grade.code)}>{d.grade.code}</Badge></b></div>
        <div><small>درخواستی</small><b className={fitCls(toman(c.requestedAmount))}>{toman(c.requestedAmount)}</b></div>
        <div><small>مدت</small><b>{fa(c.termMonths)} ماه</b></div>
        <div><small>کد ملی</small><b><NationalIdCell masked={c.nationalIdMasked} kind="check" id={c.id} /></b></div>
      </div>
      {c.overrideReason && <div className="callout warn"><p><b>دلیل ارجاع:</b> {c.overrideReason}</p></div>}

      {d.overlaps.length > 0 && (
        <div className="callout warn"><p><AlertTriangle size={15} /> <b>همین شخص از این شرکت‌ها هم استعلام/اعتبار دارد:</b></p>
          <ul className="rv-list">{d.overlaps.map((o, i) => <li key={i}><Building2 size={14} /> <b>{o.brand}</b> — {tehranDateTime(o.lastAt)}{o.openAmount ? ` · تعهد باز ${toman(o.openAmount)}` : ""}</li>)}</ul></div>
      )}

      <h3 className="mon-h">سوابق اعتبار در سابقه‌نو ({fa(d.totals.count)} ردیف · مانده {toman(d.totals.openAmount)})</h3>
      {d.facilities.length === 0 ? <p className="muted small">سابقه‌ای ثبت نشده.</p> : (
        <div className="table-wrap"><table className="table compact">
          <thead><tr><th>شرکت</th><th>مبلغ</th><th>سررسید</th><th>مانده</th><th>وضعیت</th></tr></thead>
          <tbody>{d.facilities.map((f) => <tr key={f.id}><td><b>{f.brand}</b></td><td>{toman(f.amount)}</td><td className="muted small">{tehranDateTime(f.dueDate)}</td><td>{toman(f.remainingAmount)}</td><td><Badge tone={TONE[f.status]}>{STATUS_FA[f.status]}</Badge></td></tr>)}</tbody>
        </table></div>
      )}

      {(d.loans || d.checks) && (
        <dl className="dl">
          {d.loans && <><div><dt>تسهیلات فعال</dt><dd>{fa(d.loans.active ?? 0)}</dd></div><div><dt>کل تعهدات</dt><dd>{toman(d.loans.totalCommitment ?? 0)}</dd></div></>}
          {d.checks && <div><dt>چک برگشتی فعال</dt><dd>{fa(d.checks.activeBounced ?? 0)}</dd></div>}
        </dl>
      )}

      {d.otherInquiries.length > 0 && (<><h3 className="mon-h">سایر استعلام‌های همین شخص</h3>
        <ul className="rv-list">{d.otherInquiries.map((o) => <li key={o.id}><b>{o.brand}</b> — امتیاز {fa(o.score)} · {o.decision} · {ago(o.createdAt)}</li>)}</ul></>)}

      <hr className="rv-hr" />
      {done ? (
        <div className={`callout ${c.reviewedDecision === "approve" ? "info" : "bad"}`}><p><b>تصمیم ثبت‌شده: {c.reviewedDecision === "approve" ? "تأیید" : "رد"}</b>{c.reviewNote ? ` — ${c.reviewNote}` : ""}</p></div>
      ) : (
        <div className="stack">
          <div className="rv-choice">
            <button className={decision === "approve" ? "on ok" : ""} onClick={() => setDecision("approve")}><Check size={16} /> تأیید</button>
            <button className={decision === "decline" ? "on bad" : ""} onClick={() => setDecision("decline")}><X size={16} /> رد</button>
          </div>
          {decision === "approve" && <label className="field">سقف تأییدشده<MoneyInput value={limit ?? 0} onChange={setLimit} /></label>}
          <label className="field">{decision === "decline" ? "دلیل رد (الزامی — برای کسب‌وکار ارسال می‌شود)" : "توضیح (اختیاری)"}
            <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          {err && <div className="callout bad"><p>{err}</p></div>}
          <button className="btn primary wide" disabled={busy || (decision === "decline" && note.trim().length < 3)} onClick={submit}>
            {busy ? <Loader2 size={16} className="spin-i" /> : <Check size={16} />} ثبت تصمیم و اطلاع به کسب‌وکار
          </button>
        </div>
      )}
    </div>
  );
}

export default function Reviews({ onChanged }) {
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState(null), [err, setErr] = useState(""), [open, setOpen] = useState(null);
  const load = useCallback(() => adminApi.reviews(tab).then((r) => { setRows(r); setErr(""); }).catch((e) => setErr(e.message)), [tab]);
  useEffect(() => { setRows(null); load(); }, [load]);

  return (
    <div className="stack">
      <div className="rv-tabs">
        <button className={tab === "pending" ? "on" : ""} onClick={() => setTab("pending")}><Hourglass size={15} /> در انتظار تصمیم</button>
        <button className={tab === "done" ? "on" : ""} onClick={() => setTab("done")}><FileSearch size={15} /> تصمیم‌گیری‌شده</button>
      </div>
      <Card eyebrow="اعتبارسنجی پیشرفته" title={tab === "pending" ? "استعلام‌های ارجاع‌شده برای بررسی تکمیلی" : "بررسی‌های انجام‌شده"} pad={false}>
        {err && <div className="callout bad" style={{ margin: 16 }}><p>{err}</p></div>}
        {!rows ? <div style={{ padding: 16 }}><Skeleton h={220} /></div> : rows.length === 0 ? <Empty text={tab === "pending" ? "هیچ استعلامی منتظر بررسی نیست 🎉" : "هنوز بررسی‌ای ثبت نشده"} /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>کسب‌وکار</th><th>کد ملی</th><th>امتیاز</th><th>درخواستی</th><th>{tab === "pending" ? "منتظر" : "تصمیم"}</th><th>کانال</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} tabIndex={0} onClick={() => setOpen(r.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(r.id)}>
                <td><div className="rv-biz"><BizLogo name={cleanName(r.business?.brandName || r.business?.name)} src={assetUrl(r.business?.logoUrl)} size={34} /><b>{cleanName(r.business?.brandName || r.business?.name)}</b></div></td>
                <td><NationalIdCell masked={r.nationalIdMasked} kind="check" id={r.id} /></td>
                <td><b>{fa(r.score)}</b> <Badge tone={gradeTone(r.grade)}>{r.grade}</Badge></td>
                <td className={fitCls(toman(r.requestedAmount))}>{toman(r.requestedAmount)}</td>
                <td>{tab === "pending" ? <span className={r.waitingHours >= 24 ? "mon-slow" : ""}>{fa(r.waitingHours)} ساعت</span> : <Badge tone={r.reviewedDecision === "approve" ? "good" : "bad"}>{r.reviewedDecision === "approve" ? "تأیید" : "رد"}</Badge>}</td>
                <td><Badge tone="neutral">{r.via === "api" ? "API" : "پنل"}</Badge></td>
              </tr>))}</tbody>
          </table></div>)}
      </Card>
      <Drawer open={!!open} onClose={() => setOpen(null)} title="بررسی تکمیلی استعلام">
        {open && <Detail key={open} id={open} onDone={() => { setOpen(null); load(); onChanged?.(); }} />}
      </Drawer>
    </div>
  );
}
