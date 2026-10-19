import React, { useEffect, useState } from "react";
import { Printer, ArrowRight, AlertTriangle, CheckCircle2, XCircle, Hourglass, Building2, Star, StarHalf, ShieldCheck, TrendingDown, TrendingUp, Search, Wallet, CalendarClock, Gauge as GaugeIcon, Percent, Landmark, Plug } from "lucide-react";
import { api, assetUrl } from "../api.js";
import { Card, CardHead, Badge, Spin, Empty, BizLogo, num, tomanFull, dateFa, dateTimeFa, faDigits, fitCls, cleanName, NationalId, useLiveRefresh, useToast } from "./kit.jsx";

/* ---- rating model (mirrors backend rating.service.js; the backend is the source of truth for the score) ---- */
const GRADES = [
  ["A1", 680, 900, "ریسک خیلی پایین", "a"], ["A2", 660, 679, "ریسک خیلی پایین", "a"], ["A3", 640, 659, "ریسک خیلی پایین", "a"],
  ["B1", 620, 639, "ریسک پایین", "b"], ["B2", 600, 619, "ریسک پایین", "b"], ["B3", 580, 599, "ریسک پایین", "b"],
  ["C1", 560, 579, "ریسک متوسط", "c"], ["C2", 540, 559, "ریسک متوسط", "c"], ["C3", 520, 539, "ریسک متوسط", "c"],
  ["D1", 500, 519, "ریسک بالا", "d"], ["D2", 480, 499, "ریسک بالا", "d"], ["D3", 460, 479, "ریسک بالا", "d"],
  ["E1", 440, 459, "ریسک خیلی بالا", "e"], ["E2", 420, 439, "ریسک خیلی بالا", "e"], ["E3", 0, 419, "ریسک خیلی بالا", "e"],
];
const BANDS = [
  { key: "very_weak", label: "خیلی ضعیف", min: 0, max: 460, color: "#F2A184" },
  { key: "weak", label: "ضعیف", min: 460, max: 520, color: "#FBD77A" },
  { key: "low_risk", label: "کم‌ریسک", min: 520, max: 580, color: "#E7EDB7" },
  { key: "good", label: "خوب", min: 580, max: 640, color: "#C5E4BE" },
  { key: "excellent", label: "عالی", min: 640, max: 900, color: "#79C39A" },
];
const starsOf = (g) => ({ A: 5, B: 4, C: 3, D: 2, E: 1 }[g[0]] - (g[1] === "1" ? 0 : 0.5));
const bandOf = (s) => [...BANDS].reverse().find((b) => s >= b.min) || BANDS[0];
const gradeOf = (s) => GRADES.find(([, lo, hi]) => s >= lo && s <= hi) || GRADES[GRADES.length - 1];

const STATUS_TONE = { current: "good", overdue: "warn", delinquent: "bad", doubtful: "bad", settled: "neutral" };

function Stars({ value }) {
  return (
    <span className="bx-stars" aria-label={`${value} ستاره`}>
      {[1, 2, 3, 4, 5].map((i) => (value >= i ? <Star key={i} size={17} className="on" fill="currentColor" /> : value >= i - 0.5 ? <StarHalf key={i} size={17} className="on" fill="currentColor" /> : <Star key={i} size={17} />))}
    </span>
  );
}

/* ---- gauge: 0…900 left→right, the five bands in proportion ---- */
function Gauge({ score }) {
  const cx = 160, cy = 158, r = 120, w = 28, gap = 0.6;
  const pt = (sc, rad = r) => { const t = Math.PI * (1 - sc / 900); return [cx + rad * Math.cos(t), cy - rad * Math.sin(t)]; };
  // a band is never longer than 180° → large-arc flag is ALWAYS 0 (a wrong flag here broke the first band)
  const arc = (a, b) => { const [x1, y1] = pt(a + gap), [x2, y2] = pt(b - gap); return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`; };
  const sc = Math.max(0, Math.min(900, score));
  const [nx, ny] = pt(sc, r - w - 6);
  const [dx, dy] = pt(sc, r);
  const cur = bandOf(sc);
  return (
    <svg viewBox="0 0 320 188" className="rp-gauge-svg" role="img" aria-label={`امتیاز اعتباری ${score} از ۹۰۰ — ${cur.label}`}>
      <path d={`M ${pt(0)[0]} ${cy} A ${r} ${r} 0 0 1 ${pt(900)[0]} ${cy}`} stroke="#EEF2F7" strokeWidth={w + 8} fill="none" strokeLinecap="round" />
      {BANDS.map((b) => <path key={b.key} d={arc(b.min, b.max)} stroke={b.color} strokeWidth={w} fill="none" opacity={b.key === cur.key ? 1 : 0.55} />)}
      {[0, 460, 520, 580, 640, 900].map((t) => { const [x, y] = pt(t, r + w / 2 + 13); return <text key={t} x={x} y={y + 3.5} fontSize="10.5" textAnchor="middle" fill="#64748B">{faDigits(t)}</text>; })}
      <circle cx={dx} cy={dy} r="9" fill="#fff" stroke="#0B2A4A" strokeWidth="4" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="#0B2A4A" strokeWidth="5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="10" fill="#fff" stroke="#0B2A4A" strokeWidth="5" />
    </svg>
  );
}

// kept as DATA (not shown in the report any more): the full grade table
export function RatingTable({ score }) {
  const cur = gradeOf(score)[0];
  return (
    <div className="bx-table-wrap">
      <table className="bx-table bx-rating">
        <thead><tr><th>گروه ریسک</th><th>رتبه</th><th>از امتیاز</th><th>تا امتیاز</th><th>ستاره</th></tr></thead>
        <tbody>
          {GRADES.map(([code, lo, hi, group, k], i) => (
            <tr key={code} className={`g-${k} ${code === cur ? "current" : ""}`}>
              {i % 3 === 0 && <td rowSpan={3} className="grp">{group}</td>}
              <td><b>{code}</b></td><td>{faDigits(lo)}</td><td>{faDigits(hi)}</td><td><Stars value={starsOf(code)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Banner({ check }) {
  if (!check) return null;
  if (check.awaitingReview) return <div className="bx-banner wait"><Hourglass size={28} /><div><b>منتظر اعتبارسنجی پیشرفته</b><p>این استعلام برای بررسی تکمیلی به کارشناسان سابقه‌نو ارجاع شده است. نتیجه به‌محض ثبت، از طریق اعلان‌ها به شما اطلاع داده می‌شود؛ تا آن زمان اعطای اعتبار را متوقف نگه دارید.</p></div></div>;
  const d = check.finalDecision || check.decision;
  if (d === "approve") return <div className="bx-banner ok"><CheckCircle2 size={28} /><div><b>تأییدشده{check.reviewedDecision ? " — پس از اعتبارسنجی پیشرفته" : ""}</b><p>{check.reviewNote || "امتیاز و سوابق مشتری شرایط سیاست اعتباری شما را دارد."}</p></div></div>;
  return <div className="bx-banner bad"><XCircle size={28} /><div><b>ردشده{check.reviewedDecision ? " — پس از اعتبارسنجی پیشرفته" : ""}</b><p>{check.reviewNote || check.overrideReason || "امتیاز یا سوابق مشتری با سیاست اعتباری هم‌خوان نیست."}</p></div></div>;
}

const INST_LABEL = { paid: "پرداخت‌شده", paid_late: "با تأخیر پرداخت شد", overdue: "عقب‌افتاده", due: "در انتظار" };

function InstallmentDots({ list }) {
  return (
    <div className="rp-dots" role="list" aria-label="وضعیت اقساط">
      {list.map((i) => (
        <i key={i.seq} role="listitem" className={`s-${i.status}`} title={`قسط ${i.seq} — سررسید ${dateFa(i.dueDate)} — ${INST_LABEL[i.status]}${i.daysLate ? ` (${i.daysLate} روز)` : ""}`}>{faDigits(i.seq)}</i>
      ))}
    </div>
  );
}

function FacilityCard({ f }) {
  const pct = f.installmentCount ? Math.round((f.paidCount / f.installmentCount) * 100) : f.settledAt ? 100 : 0;
  return (
    <article className={`rp-fac st-${f.status}`}>
      <header>
        <div className="rp-fac-brand"><span className="rp-fac-ic"><Building2 size={18} /></span><div><b>{f.brand}</b>{f.title && <small>{f.title}</small>}</div></div>
        <Badge tone={STATUS_TONE[f.status]}>{f.statusLabel}</Badge>
      </header>
      <dl>
        <div><dt>مبلغ اعتبار</dt><dd className={fitCls(tomanFull(f.amount))}>{tomanFull(f.amount)}</dd></div>
        <div><dt>مانده نهایی</dt><dd className={fitCls(tomanFull(f.remainingAmount))}>{tomanFull(f.remainingAmount)}</dd></div>
        <div><dt>تاریخ دریافت</dt><dd>{dateFa(f.disbursedAt)}</dd></div>
        <div><dt>{f.settledAt ? "تاریخ تسویه" : f.installmentCount ? "قسط بعدی" : "سررسید"}</dt><dd>{dateFa(f.settledAt || f.nextDue || f.dueDate)}</dd></div>
        {f.penaltyAmount > 0 && <div className="neg"><dt>جریمهٔ دیرکرد</dt><dd>{tomanFull(f.penaltyAmount)}</dd></div>}
        {f.status !== "settled" && f.daysLate > 0 && <div className="neg"><dt>تأخیر</dt><dd>{faDigits(f.daysLate)} روز</dd></div>}
      </dl>
      {f.installmentCount > 0 && (
        <div className="rp-prog">
          <div className="rp-prog-top"><span>{faDigits(f.paidCount)} از {faDigits(f.installmentCount)} قسط پرداخت شده</span><b>{faDigits(pct)}٪</b></div>
          <div className="rp-bar"><i className={f.lateCount ? "late" : ""} style={{ width: `${pct}%` }} /></div>
          <InstallmentDots list={f.installments} />
          {f.lateCount > 0 && <small className="neg">{faDigits(f.lateCount)} قسط با تأخیر پرداخت شده یا عقب‌افتاده است</small>}
        </div>
      )}
      {f.settledAt && f.settledLate && <small className="neg">تسویه با تأخیر انجام شده است</small>}
    </article>
  );
}

const LEVEL = { none: ["کم", "good"], low: ["کم", "good"], medium: ["متوسط", "warn"], high: ["زیاد", "bad"] };

/** mode "business": full inquiry report · mode "self": the person's own report (no decision / limits). */
export function ReportView({ data, mode = "business", onBack }) {
  const { check, business, report, customer } = data;
  const score = report.score;
  const [gCode, , , gGroup] = gradeOf(score);
  const band = bandOf(score);
  const facilities = report.facilities || [];
  const t = report.totals || {};
  const active = facilities.filter((f) => f.status !== "settled");
  const closed = facilities.filter((f) => f.status === "settled");
  const bd = report.breakdown;
  const maxAbs = bd ? Math.max(1, ...[...bd.reducers, ...bd.boosters].map((i) => Math.abs(i.points))) : 1;
  const inq = report.inquiries;

  const Kpi = ({ icon: Icon, label, value, sub, tone }) => (
    <div className={`rp-kpi ${tone || ""}`}><span className="rp-kpi-ic"><Icon size={20} /></span><div><small>{label}</small><b className={fitCls(value)}>{value}</b>{sub && <em>{sub}</em>}</div></div>
  );

  return (
    <article className="bx-report">
      <header className="bx-rp-head">
        <img src="/brand-lockup-horizontal.png" alt="سابقه‌نو" className="bx-rp-logo" />
        <div className="bx-rp-meta">
          <h2>{mode === "self" ? "گزارش اعتباری من" : "گزارش اعتبارسنجی"}</h2>
          <span>تاریخ گزارش: {dateTimeFa(report.generatedAt || Date.now())}</span>
          {check?.id && <span dir="ltr">شناسه: {String(check.id).slice(-10)}</span>}
          {customer && (customer.nationalId || customer.nationalIdMasked) && <span className="bx-rp-nid">{mode === "self" ? "کد ملی شما" : "کد ملی مشتری"}: <NationalId value={customer.nationalId} masked={customer.nationalIdMasked} /></span>}
        </div>
        {mode === "business" && business && (
          <div className="bx-rp-biz"><BizLogo name={cleanName(business.brandName || business.name)} src={assetUrl(business.logoUrl)} size={44} /><div><small>درخواست‌دهنده</small><b>{cleanName(business.brandName || business.name)}</b></div></div>
        )}
        <div className="bx-rp-actions no-print">
          {onBack && <button className="bx-btn sm" onClick={onBack}><ArrowRight size={16} /> بازگشت</button>}
          <button className="bx-btn sm primary" onClick={() => window.print()}><Printer size={16} /> ذخیرهٔ PDF / چاپ</button>
        </div>
      </header>

      {mode === "business" && <Banner check={check} />}

      {(report.warnings || []).map((w) => (
        <div key={w.key} className={`rp-warn ${w.tone}`}><AlertTriangle size={20} /><span>{faDigits(w.text)}</span></div>
      ))}

      {/* ---------- score ---------- */}
      <section className="bx-rp-hero">
        <div className="bx-rp-gauge"><Gauge score={score} /><div className="bx-rp-score"><small>امتیاز اعتباری</small><b>{faDigits(score)}</b><span>از ۹۰۰</span></div></div>
        <div className="bx-rp-grade">
          <div className="rp-grade-row">
            <div className={`bx-grade g-${gCode[0].toLowerCase()}`}><b>{gCode}</b><span>رتبهٔ اعتباری</span></div>
            <div><h3>{gGroup}</h3><Stars value={starsOf(gCode)} /><p className="rp-band">وضعیت امتیاز: <b>{band.label}</b></p></div>
          </div>
          <p className="bx-muted">رتبهٔ اعتباری عددی بین ۰ تا ۹۰۰ است؛ هرچه بیشتر باشد، وضعیت اعتباری بهتر و ریسک معامله کمتر است.</p>
          <ul className="bx-legend">{[...BANDS].reverse().map((b) => <li key={b.key} className={b.key === band.key ? "on" : ""}><i style={{ background: b.color }} />{b.label}<span>{faDigits(b.min)} تا {faDigits(b.max)}</span></li>)}</ul>
          {report.platformScore != null && (
            <div className="rp-split">
              <div><small>اعتبارسنجی بیرونی</small><b>{report.externalScore != null ? faDigits(report.externalScore) : "—"}</b><em>وزن ۶۵٪</em></div>
              <div><small>رفتار بازپرداخت در سابقه‌نو</small><b>{faDigits(report.platformScore)}</b><em>وزن ۳۵٪</em></div>
            </div>
          )}
        </div>
      </section>

      {mode === "business" && check && (
        <section className="rp-kpis">
          <Kpi icon={Wallet} label="مبلغ درخواستی" value={tomanFull(check.requestedAmount)} />
          <Kpi icon={Landmark} label="سقف پیشنهادی" tone="accent" value={check.awaitingReview ? "پس از بررسی" : (check.finalDecision || check.decision) === "decline" ? "—" : tomanFull(check.recommendedLimit)} sub={check.awaitingReview ? "منتظر اعتبارسنجی پیشرفته" : null} />
          <Kpi icon={CalendarClock} label="مدت درخواستی" value={`${faDigits(check.termMonths)} ماه`} />
          <Kpi icon={Percent} label="سطح اطمینان" value={`${faDigits(check.confidence)}٪`} />
        </section>
      )}

      {/* ---------- every reason the score moved ---------- */}
      {bd && (
        <Card><CardHead eyebrow="SCORE ANALYSIS" title="تحلیل امتیاز — همهٔ عوامل مؤثر"
          action={<div className="rp-sum"><span className="neg"><TrendingDown size={15} /> {faDigits(Math.abs(bd.totalReduction))}− امتیاز کاهش</span>{bd.totalBoost > 0 && <span className="pos"><TrendingUp size={15} /> {faDigits(bd.totalBoost)}+ امتیاز افزایش</span>}</div>} />
          <div className="rp-wf">
            <div className="rp-wf-base"><span>امتیاز پایه (بدون هیچ سابقهٔ منفی)</span><b>{faDigits(bd.base)}</b></div>
            {bd.reducers.length === 0 && bd.boosters.length === 0 && <p className="bx-muted">هیچ عامل کاهنده یا افزایشی ثبت نشده است.</p>}
            {bd.reducers.map((i) => (
              <div key={i.key} className="rp-wf-row neg">
                <span className="rp-wf-ic"><TrendingDown size={16} /></span>
                <div className="rp-wf-txt"><b>{faDigits(i.label)}</b>{i.detail && <small>{faDigits(i.detail)}</small>}<div className="rp-wf-bar"><i style={{ width: `${Math.max(6, (Math.abs(i.points) / maxAbs) * 100)}%` }} /></div></div>
                <em>{faDigits(Math.abs(i.points))}−</em>
              </div>
            ))}
            {bd.boosters.map((i) => (
              <div key={i.key} className="rp-wf-row pos">
                <span className="rp-wf-ic"><TrendingUp size={16} /></span>
                <div className="rp-wf-txt"><b>{faDigits(i.label)}</b>{i.detail && <small>{faDigits(i.detail)}</small>}<div className="rp-wf-bar"><i style={{ width: `${Math.max(6, (Math.abs(i.points) / maxAbs) * 100)}%` }} /></div></div>
                <em>{faDigits(i.points)}+</em>
              </div>
            ))}
            <div className="rp-wf-final"><span>امتیاز نهایی</span><b>{faDigits(bd.final)}</b></div>
          </div>
        </Card>
      )}

      {inq && (
        <Card><CardHead eyebrow="INQUIRIES" title="تعدد استعلام‌های اخیر" action={<Badge tone={LEVEL[inq.level]?.[1] || "good"}>تأثیر منفی: {LEVEL[inq.level]?.[0] || "کم"}</Badge>} />
          <div className="rp-inq">
            <div><Search size={18} /><b>{faDigits(inq.prior30)}</b><span>استعلام در ۳۰ روز اخیر</span></div>
            <div><Search size={18} /><b>{faDigits(inq.prior90)}</b><span>استعلام در ۹۰ روز اخیر</span></div>
            <div><Building2 size={18} /><b>{faDigits(inq.businesses30)}</b><span>کسب‌وکار مختلف (۳۰ روز)</span></div>
            <div className={inq.penalty < 0 ? "neg" : ""}><TrendingDown size={18} /><b>{inq.penalty < 0 ? `${faDigits(Math.abs(inq.penalty))}−` : "۰"}</b><span>امتیاز کسر‌شده</span></div>
          </div>
          <p className="bx-muted">استعلام‌های پیاپی از چند مرکز، نشانهٔ جست‌وجوی هم‌زمان برای اعتبار است و روی امتیاز اثر منفی دارد؛ استعلام جاری در شمارش نیامده است.</p>
        </Card>
      )}

      {(report.overlaps || []).length > 0 && (
        <section className="bx-rp-alert">
          <AlertTriangle size={24} />
          <div>
            <b>هشدار هم‌پوشانی — این شخص از شرکت‌های دیگر هم استعلام گرفته است</b>
            <ul>{report.overlaps.map((o, i) => <li key={i}><Building2 size={15} /> <strong>{o.brand}</strong> — {o.hasInquiry ? "استعلام" : "اعتبار"} در {dateTimeFa(o.lastAt)}{o.openAmount ? ` · تعهد باز ${tomanFull(o.openAmount)}` : ""}</li>)}</ul>
          </div>
        </section>
      )}

      {/* ---------- ledger ---------- */}
      <Card><CardHead eyebrow="CREDIT LEDGER" title="تعهدات جاری"
        action={<div className="bx-rp-tot"><span>باز: <b>{faDigits(t.active || 0)}</b></span><span>مانده کل: <b>{tomanFull(t.openAmount || 0)}</b></span>{t.installmentsTotal > 0 && <span>اقساط: <b>{faDigits(t.installmentsPaid)}/{faDigits(t.installmentsTotal)}</b></span>}</div>} />
        {active.length === 0 ? <Empty icon={ShieldCheck} text="تعهد جاری ثبت‌شده‌ای در سابقه‌نو برای این شخص وجود ندارد." /> : <div className="rp-facs">{active.map((f) => <FacilityCard key={f.id} f={f} />)}</div>}
      </Card>

      {closed.length > 0 && (
        <Card><CardHead eyebrow="HISTORY" title="سوابق تسویه‌شده" action={<span className="bx-muted">{faDigits(closed.length)} مورد · خارج‌شده از تعهدات جاری</span>} />
          <div className="rp-facs">{closed.map((f) => <FacilityCard key={f.id} f={f} />)}</div>
        </Card>
      )}

      {mode === "business" && report.loans && (
        <Card><CardHead eyebrow="BUREAU" title="سوابق تسهیلات و چک (اعتبارسنجی بیرونی)" />
          <div className="rp-kpis four">
            <Kpi icon={Landmark} label="تسهیلات فعال" value={faDigits(report.loans.active ?? 0)} />
            <Kpi icon={Wallet} label="کل تعهدات" value={tomanFull(report.loans.totalCommitment ?? 0)} />
            <Kpi icon={GaugeIcon} label="چک برگشتی فعال" value={faDigits(report.checks?.activeBounced ?? 0)} tone={report.checks?.activeBounced ? "bad" : ""} />
            <Kpi icon={CalendarClock} label="بیشترین تأخیر (روز)" value={report.loans.overdue == null ? "—" : faDigits(report.loans.overdue)} />
          </div>
        </Card>
      )}

      {(report.services || []).filter((x) => x.ok).length > 0 && (
        <Card><CardHead eyebrow="PARTNERS" title="سازمان‌های متصل" />
          <ul className="rp-svc">{report.services.filter((x) => x.ok).map((x) => (
            <li key={x.key}><Plug size={16} /><b>{x.name}</b><span>{x.value == null ? "—" : faDigits(x.value)} {x.unit || ""}</span>{x.points ? <em className="neg">{faDigits(Math.abs(x.points))}−</em> : <em>بدون اثر</em>}</li>
          ))}</ul>
        </Card>
      )}

      {mode === "business" && (check?.overrideReason || report.ruleHits?.length > 0) && (
        <Card accent="navy"><CardHead eyebrow="REASONS" title="دلایل تصمیم" />
          <ul className="bx-reasons">{check?.overrideReason && <li>{faDigits(check.overrideReason)}</li>}{(report.ruleHits || []).map((h, i) => <li key={i}>{h.message || h.name}</li>)}</ul>
        </Card>
      )}

      <footer className="bx-rp-foot">این گزارش بر پایهٔ داده‌های لحظهٔ تولید ساخته شده و صرفاً ابزار کمک‌تصمیم است؛ تصمیم نهایی با اعطاکنندهٔ اعتبار است. © سابقه‌نو</footer>
    </article>
  );
}

/** Business view: loads the live report of one inquiry. */
export default function ReportPage({ activeCheck, onBack }) {
  const toast = useToast();
  const [st, setSt] = useState({ loading: true, error: "", data: null });
  const wasWaiting = React.useRef(false);

  // silent = background refresh: keep what is on screen, swap the data in when it arrives
  const load = (silent) => {
    if (!activeCheck?.id) return Promise.resolve();
    return api.getCheckReport(activeCheck.id)
      .then((d) => {
        const waiting = !!d.check?.awaitingReview;
        if (silent === true && wasWaiting.current && !waiting) toast.success("نتیجهٔ اعتبارسنجی پیشرفته ثبت شد و وضعیت این استعلام به‌روز شد", "وضعیت جدید");
        wasWaiting.current = waiting;
        setSt({ loading: false, error: "", data: d });
        if (silent !== true && activeCheck.print) setTimeout(() => window.print(), 400);
      })
      .catch((e) => { if (silent !== true) setSt({ loading: false, error: e.message, data: null }); });
  };

  useEffect(() => {
    if (!activeCheck?.id) { setSt({ loading: false, error: "استعلامی انتخاب نشده است", data: null }); return; }
    wasWaiting.current = false;
    setSt({ loading: true, error: "", data: null });
    load();
  }, [activeCheck?.id, activeCheck?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // while the inquiry waits for our experts, check every 15 s; the banner flips to the final verdict by itself
  useLiveRefresh(load, { active: !!st.data?.check?.awaitingReview, ms: 15000 });

  if (st.loading) return <div className="bx-center"><Spin /></div>;
  if (st.error) return <Card><Empty icon={AlertTriangle} text={st.error} /></Card>;
  return <ReportView data={st.data} mode="business" onBack={onBack} />;
}
