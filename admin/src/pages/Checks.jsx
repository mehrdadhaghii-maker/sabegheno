import React, { useMemo, useState } from "react";
import { Search, Download, ShieldAlert, Layers, X, Plug } from "lucide-react";
import { Card, Badge, Drawer, Empty, ScoreRing, BizLogo, Donut, NationalIdCell } from "../ui.jsx";
import { fa, num, toman, fullDate, ago, cleanName, DECISION, downloadCsv } from "../lib.js";

const PALETTE = ["#0FAF9E", "#123B5D", "#FCA311", "#7A5AF8", "#D64550", "#3B82F6", "#84CC16", "#EC4899"];
const PAGE = 12;

export default function Checks({ rows, analytics, filter, setFilter }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState(null);
  const groups = analytics?.byBusiness || [];
  const total = groups.reduce((s, g) => s + g.total, 0);
  const slices = groups.map((g, i) => ({ key: g.id, name: cleanName(g.name), value: g.total, color: PALETTE[i % PALETTE.length] }));
  const colorOf = Object.fromEntries(slices.map((s) => [s.key, s.color]));

  const list = useMemo(() => rows.filter((c) => !q || c.id.includes(q) || (c.business?.name || "").includes(q)), [rows, q]);
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const view = list.slice(page * PAGE, page * PAGE + PAGE);
  const current = sel && rows.find((c) => c.id === sel);
  const activeGroup = groups.find((g) => g.id === filter.businessId);
  const pick = (patch) => { setFilter({ ...filter, ...patch }); setPage(0); };

  const exportCsv = () => downloadCsv(`sabegheno-checks-${Date.now()}.csv`, list.map((c) => ({
    شناسه: c.id, کسب‌وکار: c.business?.name || "", مبلغ: c.requestedAmount, مدت_ماه: c.termMonths, امتیاز: c.score,
    تصمیم: DECISION[c.decision].label, سقف_پیشنهادی: c.recommendedLimit, کسب‌وکارهای_هم‌زمان: c.concurrentProviders, تاریخ: c.createdAt,
  })));

  return (
    <div className="stack">
      <div className="checks-top">
        <Card eyebrow="ALL BUSINESSES" title="سهم هر کسب‌وکار از کل استعلام‌ها">
          {total === 0 ? <Empty text="در این بازه استعلامی ثبت نشده است." /> : (
            <div className="donut-wrap">
              <Donut data={slices} total={total} label="کل استعلام" />
              <ul className="donut-legend">
                {slices.map((s) => (
                  <li key={s.key}><i style={{ background: s.color }} /><span>{s.name}</span><b>{num(s.value)}</b><em>{fa(Math.round((s.value / total) * 100))}٪</em></li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card eyebrow="PER BUSINESS" title="استعلام‌ها به تفکیک کسب‌وکار" pad={false}
          action={filter.businessId && <button className="link" onClick={() => pick({ businessId: "" })}><X size={14} /> نمایش همه</button>}>
          {groups.length === 0 ? <div className="card-body"><Empty /></div> : (
            <div className="group-list">
              {groups.map((g) => (
                <button key={g.id} className={`group-row ${filter.businessId === g.id ? "on" : ""}`} onClick={() => pick({ businessId: filter.businessId === g.id ? "" : g.id })}>
                  <span className="dot" style={{ background: colorOf[g.id] }} />
                  <BizLogo name={g.name} src={g.logoUrl} size={40} radius={12} />
                  <div className="g-main">
                    <b>{cleanName(g.name)}</b>
                    <div className="g-bar"><i style={{ flex: g.approve, background: "#0FAF9E" }} /><i style={{ flex: g.review, background: "#FCA311" }} /><i style={{ flex: g.decline, background: "#D64550" }} /></div>
                  </div>
                  <div className="g-nums"><b>{num(g.total)}</b><span>استعلام</span></div>
                  <div className="g-nums"><b style={{ color: "#087F76" }}>{fa(g.approvalRate)}٪</b><span>تأیید</span></div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card pad={false}>
        <div className="toolbar">
          <div className="filters">
            {activeGroup && <span className="chip-on"><BizLogo name={activeGroup.name} src={activeGroup.logoUrl} size={22} radius={7} />{cleanName(activeGroup.name)}</span>}
            <select value={filter.decision || ""} onChange={(e) => pick({ decision: e.target.value })} aria-label="تصمیم">
              <option value="">همهٔ تصمیم‌ها</option>
              {Object.entries(DECISION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <label className="search"><Search size={16} /><input placeholder="شناسه یا نام کسب‌وکار…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></label>
          </div>
          <button className="btn" onClick={exportCsv} disabled={!list.length}><Download size={16} /> خروجی CSV</button>
        </div>
        {view.length === 0 ? <div className="card-body"><Empty text="استعلامی با این فیلتر یافت نشد." /></div> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>کسب‌وکار</th><th>کد ملی</th><th>مبلغ</th><th>امتیاز</th><th>تصمیم</th><th>هم‌پوشانی</th><th>زمان</th></tr></thead>
              <tbody>
                {view.map((c) => (
                  <tr key={c.id} tabIndex={0} onClick={() => setSel(c.id)} onKeyDown={(e) => e.key === "Enter" && setSel(c.id)}>
                    <td><div className="cell-id"><BizLogo name={c.business?.name} src={c.business?.logoUrl} size={34} radius={10} /><b>{cleanName(c.business?.name || "—")}</b></div></td>
                    <td>{toman(c.requestedAmount)}</td>
                    <td><b>{fa(c.score)}</b></td>
                    <td><Badge tone={DECISION[c.decision].tone}>{DECISION[c.decision].label}</Badge></td>
                    <td>{c.concurrentProviders >= 1 ? <Badge tone="warn"><ShieldAlert size={12} /> {fa(c.concurrentProviders)} کسب‌وکار</Badge> : <span className="muted">—</span>}</td>
                    <td className="muted">{ago(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pager">
          <span>{num(list.length)} نتیجه</span>
          <div><button className="btn sm" disabled={page === 0} onClick={() => setPage(page - 1)}>قبلی</button><span>{fa(page + 1)} / {fa(pages)}</span><button className="btn sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>بعدی</button></div>
        </div>
      </Card>

      <Drawer open={!!current} onClose={() => setSel(null)} title="جزئیات استعلام">
        {current && (() => { const svc = current.sources?.services || []; return (
          <div className="stack">
            <div className="check-hero">
              <ScoreRing score={current.score} />
              <div><Badge tone={DECISION[current.decision].tone}>{DECISION[current.decision].label}</Badge>
                <div className="muted small">اعتماد مدل: {fa(current.confidence)}٪ · {fullDate(current.createdAt)}</div></div>
            </div>
            {current.overrideReason && <div className="callout warn"><ShieldAlert size={18} /><p>{current.overrideReason}</p></div>}
            {current.sources?.blocked && <div className="callout bad"><Layers size={18} /><p>این شخص در فهرست بدحسابان فعال بود و اعتبار در تمام کسب‌وکارها مسدود شد.</p></div>}
            <dl className="dl">
              <div><dt>کسب‌وکار</dt><dd>{cleanName(current.business?.name || "")}</dd></div>
              <div><dt>کد ملی مشتری</dt><dd><NationalIdCell masked={current.nationalIdMasked} kind="check" id={current.id} /></dd></div>
              <div><dt>مبلغ درخواستی</dt><dd>{toman(current.requestedAmount)} · {fa(current.termMonths)} ماه</dd></div>
              <div><dt>سقف پیشنهادی</dt><dd>{toman(current.recommendedLimit)}</dd></div>
              <div><dt>کسب‌وکارهای هم‌زمان</dt><dd>{fa(current.concurrentProviders)}</dd></div>
              <div><dt>تعهد بیرونی</dt><dd>{toman(current.totalExternalExposure)}</dd></div>
            </dl>
            {svc.length > 0 && (<div><div className="eyebrow" style={{ marginBottom: 8 }}>نتایج سرویس‌های متصل</div>
              <dl className="dl">{svc.map((s) => <div key={s.key}><dt><Plug size={14} /> {s.name}</dt><dd>{s.ok ? `${num(s.value)} ${s.unit || ""}` : <span className="muted">ناموفق</span>}</dd></div>)}</dl></div>)}
            {(current.sources?.ruleHits || []).length > 0 && (<div><div className="eyebrow" style={{ marginBottom: 8 }}>قوانین سفارشی اعمال‌شده</div>
              <div className="btn-row">{current.sources.ruleHits.map((r) => <Badge key={r.id} tone="info">{r.name}</Badge>)}</div></div>)}
            <p className="muted small">کد ملی به‌صورت ماسک‌شده نمایش داده می‌شود؛ دکمهٔ چشم، عدد کامل را ۳۰ ثانیه نشان می‌دهد و هر نمایش در لاگ ممیزی ثبت می‌شود.</p>
          </div>); })()}
      </Drawer>
    </div>
  );
}
