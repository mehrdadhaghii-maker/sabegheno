import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { FileSearch, CheckCircle2, Gauge, ShieldAlert, Wallet, PlusCircle, ArrowLeft, Clock3 } from "lucide-react";
import { api } from "../api.js";
import { Card, CardHead, Tile, Badge, Donut, BizLogo, Spin, Empty, DECISION, decisionMeta, num, faDigits, toman, dateFa, agoFa, cleanName, useToast, compactToman, NationalId, useLiveRefresh } from "./kit.jsx";

const STATUS = { approved: ["فعال", "good"], pending_docs: ["در انتظار مدارک", "warn"], pending_contract: ["در انتظار قرارداد", "info"], suspended: ["تعلیق‌شده", "bad"], rejected: ["ردشده", "bad"] };

export default function Dashboard({ setScreen, openCheck, auth }) {
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState(null);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = (silent) => Promise.all([api.getStats(days), api.listCreditChecks()])
    .then(([s, l]) => { setStats(s); setChecks(l); })
    .catch((e) => { if (silent !== true) toast.error(e.message, "خطا در دریافت داشبورد"); })
    .finally(() => setLoading(false));

  useEffect(() => { setLoading(true); load(); }, [days]); // eslint-disable-line react-hooks/exhaustive-deps
  // numbers and statuses follow an admin's advanced-validation decision without a manual reload
  useLiveRefresh(load, { active: checks.some((c) => c.awaitingReview), ms: 20000 });

  const k = stats?.kpis;
  const ent = auth?.entity || {};
  const st = STATUS[ent.status] || ["—", "neutral"];
  const series = (stats?.series || []).map((d) => ({ ...d, label: new Date(`${d.date}T12:00:00Z`).toLocaleDateString("fa-IR", { month: "short", day: "numeric" }) }));
  const slices = k ? Object.keys(DECISION).map((key) => ({ key, name: DECISION[key].label, value: k.byDecision[key], color: DECISION[key].color })) : [];

  return (
    <div className="bx-stack">
      <section className="bx-hero">
        <BizLogo name={ent.name} src={ent.logoUrl} size={72} radius={20} />
        <div className="bx-hero-main"><h2>{cleanName(ent.name || "کسب‌وکار شما")}</h2><div className="bx-hero-sub"><Badge tone={st[1]}>{st[0]}</Badge><span>داشبورد تصمیم‌های اعتباری شما</span></div></div>
        <div className="bx-hero-actions">
          <div className="bx-seg">{[[7, "۷ روز"], [30, "۳۰ روز"], [90, "۹۰ روز"]].map(([v, l]) => <button key={v} className={days === v ? "on" : ""} onClick={() => setDays(v)}>{l}</button>)}</div>
          <button className="bx-btn primary lg" onClick={() => setScreen("newcheck")}><PlusCircle size={19} /> استعلام جدید</button>
        </div>
      </section>

      {loading && !stats ? <Spin /> : (
        <>
          <div className="bx-tiles">
            <Tile icon={FileSearch} label="کل استعلام‌ها" value={num(k.total)} hint={`${num(days)} روز اخیر`} />
            <Tile icon={CheckCircle2} label="نرخ تأیید" value={faDigits(k.approvalRate)} unit="٪" hint={`${num(k.byDecision.approve)} تأیید`} />
            <Tile icon={Gauge} label="میانگین امتیاز" tone="navy" value={k.avgScore ? num(k.avgScore) : "—"} hint="از ۳۰۰ تا ۹۰۰" />
            <Tile icon={ShieldAlert} label="هشدار هم‌پوشانی" tone="amber" value={num(k.stackingFlags)} hint="درخواست هم‌زمان نزد کسب‌وکار دیگر" />
            <Tile icon={Wallet} label="سقف پیشنهادی کل" tone="navy" value={compactToman(k.totalRecommended).value} unit={compactToman(k.totalRecommended).unit} hint={`درخواستی: ${toman(k.totalRequested)}`} />
          </div>

          <div className="bx-grid-2">
            <Card><CardHead eyebrow="DECISION FLOW" title="جریان تصمیم‌ها" />
              {k.total ? (
                <div className="bx-donut-wrap">
                  <Donut data={slices} total={k.total} label="استعلام" />
                  <ul className="bx-legend">
                    {slices.map((s) => <li key={s.key}><i style={{ background: s.color }} /><span>{s.name}</span><b>{num(s.value)}</b><em>{faDigits(k.total ? Math.round((s.value / k.total) * 100) : 0)}٪</em></li>)}
                    <li className="sum"><span>سقف پیشنهادی مجموع</span><b>{toman(k.totalRecommended)}</b></li>
                  </ul>
                </div>
              ) : <Empty icon={FileSearch} text="در این بازه استعلامی ثبت نشده است." />}
            </Card>

            <Card accent="navy"><CardHead eyebrow="TREND" title="استعلام‌های روزانه" />
              {k.total ? (
                <div style={{ height: 250, direction: "ltr" }}>
                  <ResponsiveContainer>
                    <BarChart data={series} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                      <CartesianGrid stroke="#EDF1F5" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#7C8A9A" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={26} />
                      <YAxis tick={{ fontSize: 11, fill: "#7C8A9A" }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={num} />
                      <Tooltip cursor={{ fill: "#F1F5F9" }} contentStyle={{ direction: "rtl", borderRadius: 12, border: "1px solid #E5E9EE", fontFamily: "Vazirmatn" }} formatter={(v, n) => [num(v), n]} />
                      <Bar dataKey="approve" name="تأییدشده" stackId="a" fill="#0FAF9E" />
                      <Bar dataKey="review" name="نیازمند بررسی" stackId="a" fill="#FCA311" />
                      <Bar dataKey="decline" name="ردشده" stackId="a" fill="#D64550" radius={[5, 5, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty icon={Clock3} text="هنوز داده‌ای برای نمودار نیست." />}
            </Card>
          </div>

          <div className="bx-grid-2">
            <Card accent="amber"><CardHead eyebrow="SCORE" title="توزیع امتیاز مشتریان" />
              <div style={{ height: 210, direction: "ltr" }}>
                <ResponsiveContainer>
                  <BarChart data={stats?.scoreBuckets || []} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                    <XAxis dataKey="range" tick={{ fontSize: 11, fill: "#7C8A9A" }} axisLine={false} tickLine={false} tickFormatter={faDigits} />
                    <YAxis tick={{ fontSize: 11, fill: "#7C8A9A" }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={num} />
                    <Tooltip cursor={{ fill: "#F1F5F9" }} contentStyle={{ direction: "rtl", borderRadius: 12, fontFamily: "Vazirmatn" }} formatter={(v) => [num(v), "تعداد"]} />
                    <Bar dataKey="count" radius={[8, 8, 0, 0]}>{(stats?.scoreBuckets || []).map((_, i) => <Cell key={i} fill={["#D64550", "#E8843A", "#FCA311", "#5CC7B8", "#0FAF9E"][i]} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card accent="red"><CardHead eyebrow="ANTI-STACKING" title="هشدارهای هم‌پوشانی اخیر" />
              {!stats?.alerts?.length ? <Empty icon={ShieldAlert} text="در این بازه موردی شناسایی نشده است." /> : (
                <ul className="bx-feed">
                  {stats.alerts.map((a) => (
                    <li key={a.id} onClick={() => openCheck(a.id, a)}>
                      <span className="dot" /><div><div><Badge tone={decisionMeta(a).tone}>{decisionMeta(a).label}</Badge> <b>امتیاز {num(a.score)}</b></div><small>{num(a.concurrentProviders)} کسب‌وکار هم‌زمان · تعهد بیرونی {toman(a.totalExternalExposure)}</small></div><time>{agoFa(a.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card accent="navy" className="no-pad">
            <div className="bx-card-pad"><CardHead eyebrow="RECENT" title="استعلام‌های اخیر" action={<button className="bx-link" onClick={() => setScreen("history")}>مشاهده همه <ArrowLeft size={15} /></button>} /></div>
            {checks.length === 0 ? <Empty icon={FileSearch} text="هنوز استعلامی ثبت نشده است." /> : (
              <div className="bx-table-wrap"><table className="bx-table">
                <thead><tr><th>شناسه</th><th>کد ملی</th><th>مبلغ درخواست</th><th>امتیاز</th><th>وضعیت</th><th>تاریخ</th></tr></thead>
                <tbody>{checks.slice(0, 6).map((r) => (
                  <tr key={r.id} tabIndex={0} onClick={() => openCheck(r.id, {}, r, null)} onKeyDown={(e) => e.key === "Enter" && openCheck(r.id, {}, r, null)}>
                    <td className="mono">{r.id.slice(0, 8)}</td><td><NationalId value={r.nationalId} masked={r.nationalIdMasked} /></td><td>{toman(r.requestedAmount)}</td><td><b>{num(r.score)}</b></td>
                    <td><Badge tone={decisionMeta(r).tone}>{decisionMeta(r).label}</Badge></td><td className="muted">{dateFa(r.createdAt)}</td>
                  </tr>))}</tbody></table></div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
