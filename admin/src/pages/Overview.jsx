import React, { useMemo } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { FileSearch, CheckCircle2, ShieldAlert, Wallet, ArrowLeft, Building2, Database, PartyPopper, TrendingUp, TrendingDown } from "lucide-react";
import { Card, Badge, ChartTip, Empty, Skeleton, ScoreRing } from "../ui.jsx";
import { fa, num, toman, shortDay, ago, DECISION, PROVIDER_STATUS, initials, avatarColors, cleanName, compactToman, fitCls } from "../lib.js";
import { assetUrl } from "../api.js";
import { BizLogo } from "../ui.jsx";

const pctDelta = (cur, prev) => (prev ? Math.round(((cur - prev) / prev) * 100) : cur ? 100 : null);

/* ---- Schematic: requests flow into three outcomes (ribbon widths ∝ counts) ---- */
function FlowDiagram({ k }) {
  const W = 620, H = 230, barW = 16, top = 14, inner = H - top * 2, gap = 16;
  const keys = ["approve", "review", "decline"];
  const total = Math.max(1, k.total);
  const usable = inner - gap * 2;
  let srcY = top, dstY = top;
  const items = keys.map((key) => {
    const v = k.byDecision[key];
    const srcH = (v / total) * inner;
    const dstH = Math.max(v ? 10 : 4, (v / total) * usable);
    const it = { key, v, srcY, srcH, dstY, dstH };
    srcY += srcH; dstY += dstH + gap;
    return it;
  });
  const sx = W - barW, dx = 150; // source on the right (RTL), outcomes on the left
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="flow" role="img" aria-label="جریان تصمیم‌ها" direction="ltr">
      <rect x={sx} y={top} width={barW} height={inner} rx="8" fill="#0B1F3A" />
      <text x={sx - 14} y={H / 2 - 6} textAnchor="end" className="flow-num">{num(k.total)}</text>
      <text x={sx - 14} y={H / 2 + 16} textAnchor="end" className="flow-sub">استعلام</text>
      {items.map((it) => {
        const c = DECISION[it.key].color, x1 = sx, x2 = dx, mid = (x1 + x2) / 2;
        const d = `M${x1} ${it.srcY} C${mid} ${it.srcY} ${mid} ${it.dstY} ${x2} ${it.dstY} L${x2} ${it.dstY + it.dstH} C${mid} ${it.dstY + it.dstH} ${mid} ${it.srcY + it.srcH} ${x1} ${it.srcY + it.srcH} Z`;
        return (
          <g key={it.key}>
            {it.v > 0 && <path d={d} fill={c} opacity="0.22" />}
            <rect x={x2 - barW} y={it.dstY} width={barW} height={it.dstH} rx="6" fill={c} />
            <text x={x2 - barW - 12} y={it.dstY + it.dstH / 2 - 2} textAnchor="end" className="flow-num sm" fill={c}>{num(it.v)}</text>
            <text x={x2 - barW - 12} y={it.dstY + it.dstH / 2 + 18} textAnchor="end" className="flow-sub">{DECISION[it.key].label} · {fa(Math.round((it.v / total) * 100))}٪</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ---- Schematic: provider network (ring colour = status, logo = the business's own uploaded logo) ---- */
function ProviderMap({ providers }) {
  const S = 300, c = S / 2, r = 108;
  const list = providers.slice(0, 8);
  const col = { good: "#0FAF9E", warn: "#FCA311", bad: "#D64550" };
  return (
    <svg viewBox={`0 0 ${S} ${S}`} className="pmap" role="img" aria-label="شبکهٔ منابع داده">
      <defs>
        <clipPath id="clip-center"><circle cx={c} cy={c} r="34" /></clipPath>
        {list.map((p, i) => {
          const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
          return <clipPath key={p.id} id={`clip-${p.id}`}><circle cx={c + r * Math.cos(a)} cy={c + r * Math.sin(a)} r="19" /></clipPath>;
        })}
      </defs>
      <circle cx={c} cy={c} r={r} fill="none" stroke="#E5E9EE" strokeDasharray="3 5" />
      {list.map((p, i) => {
        const a = (i / list.length) * Math.PI * 2 - Math.PI / 2;
        const x = c + r * Math.cos(a), y = c + r * Math.sin(a), tone = PROVIDER_STATUS[p.status].tone;
        const logo = assetUrl(p.logoUrl);
        const [bg, fg] = avatarColors(p.name);
        return (
          <g key={p.id}>
            <line x1={c} y1={c} x2={x} y2={y} stroke={col[tone]} strokeOpacity="0.4" strokeWidth="2" />
            <circle cx={x} cy={y} r="23" fill="#fff" stroke={col[tone]} strokeWidth="4" />
            {logo ? <image href={logo} x={x - 19} y={y - 19} width="38" height="38" preserveAspectRatio="xMidYMid slice" clipPath={`url(#clip-${p.id})`} />
              : <><circle cx={x} cy={y} r="19" fill={bg} /><text x={x} y={y + 5} textAnchor="middle" style={{ fontSize: 13, fontWeight: 800, fill: fg, fontFamily: "Vazirmatn,sans-serif" }}>{initials(cleanName(p.name))}</text></>}
            <text x={x} y={y + (y > c ? 42 : -32)} textAnchor="middle" className="pmap-l">{cleanName(p.name).length > 12 ? cleanName(p.name).slice(0, 11) + "…" : cleanName(p.name)}</text>
          </g>
        );
      })}
      <circle cx={c} cy={c} r="38" fill="#fff" stroke="#0B1F3A" strokeWidth="4" />
      <image href="/brand-mark.png" x={c - 27} y={c - 20} width="54" height="40" preserveAspectRatio="xMidYMid meet" />
    </svg>
  );
}

function Tile({ icon: Icon, tone, label, value, unit, delta, invert, hint }) {
  const good = delta == null || delta === 0 ? null : invert ? delta < 0 : delta > 0;
  const Arrow = delta > 0 ? TrendingUp : TrendingDown;
  return (
    <div className={`tile v2 tone-${tone}`}>
      <div className="tile-head">
        <span className={`kpi-icon ${tone}`}><Icon size={20} /></span>
        <span className="tile-label">{label}</span>
      </div>
      <div className="tile-valuerow"><b className={`tile-value ${fitCls(`${value}`)}`}>{value}</b>{unit && <small>{unit}</small>}{delta != null && delta !== 0 && <span className={`delta ${good ? "up" : "down"}`}><Arrow size={12} /> {fa(Math.abs(delta))}٪</span>}</div>
      {hint && <div className="tile-hint">{hint}</div>}
    </div>
  );
}

export default function Overview({ data, loading, go }) {
  const series = useMemo(() => (data?.series || []).map((d) => ({ ...d, label: shortDay(d.date) })), [data]);
  if (loading && !data) return <div className="grid-tiles">{[...Array(4)].map((_, i) => <Skeleton key={i} h={110} />)}</div>;
  if (!data) return <Empty text="اطلاعاتی دریافت نشد." />;

  const { kpis: k, previous: p, businessStatus: bs } = data;
  const pending = bs.pending_docs + bs.pending_contract;
  const badProviders = data.providers.filter((x) => x.status !== "connected");
  const tasks = [
    pending > 0 && { icon: Building2, tone: "info", title: `${fa(pending)} کسب‌وکار منتظر تأیید`, sub: "مدارک یا قرارداد نیاز به بررسی دارد", to: ["businesses", "pending"], cta: "بررسی" },
    k.stackingFlags > 0 && { icon: ShieldAlert, tone: "warn", title: `${fa(k.stackingFlags)} هشدار هم‌پوشانی درخواست`, sub: "مشتریانی که هم‌زمان نزد چند منبع درخواست داده‌اند", to: ["checks"], cta: "مشاهده" },
    badProviders.length > 0 && { icon: Database, tone: "bad", title: `${fa(badProviders.length)} منبع داده مشکل دارد`, sub: badProviders.map((x) => x.name).slice(0, 2).join("، "), to: ["providers"], cta: "رفع" },
  ].filter(Boolean);
  const maxTop = Math.max(1, ...data.topBusinesses.map((b) => b.total));

  return (
    <div className="stack">
      <div className="grid-tiles">
        <Tile icon={FileSearch} tone="teal" label="کل استعلام‌ها" value={num(k.total)} delta={pctDelta(k.total, p.total)} hint={`${fa(data.periodDays)} روز اخیر`} />
        <Tile icon={CheckCircle2} tone="teal" label="نرخ تأیید" value={fa(k.approvalRate)} unit="٪" delta={pctDelta(k.approvalRate, p.approvalRate)} hint="از کل تصمیم‌ها" />
        <Tile icon={ShieldAlert} tone="amber" label="هشدار هم‌پوشانی" value={num(k.stackingFlags)} delta={pctDelta(k.stackingFlags, p.stackingFlags)} invert hint="ریسک چندبار وام‌گیری" />
        <Tile icon={Wallet} tone="navy" label="حجم درخواست‌ها" value={compactToman(k.totalRequested).value} unit={compactToman(k.totalRequested).unit} delta={pctDelta(k.totalRequested, p.totalRequested)} hint={`سقف پیشنهادی ${toman(k.totalRecommended)}`} />
      </div>

      <div className="grid-main">
        <Card eyebrow="DECISION FLOW" title="استعلام‌ها به کجا ختم می‌شوند؟">
          {k.total ? <FlowDiagram k={k} /> : <Empty text="در این بازه استعلامی ثبت نشده است." />}
          <div className="chart" style={{ height: 130, marginTop: 6 }}>
            <ResponsiveContainer>
              <AreaChart data={series} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                <CartesianGrid stroke="#EDF1F5" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#7C8A9A" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={40} />
                <YAxis hide allowDecimals={false} />
                <Tooltip content={<ChartTip />} />
                <Area type="monotone" dataKey="total" name="استعلام" stroke="#0B1F3A" strokeWidth={2} fill="#0FAF9E" fillOpacity={0.18} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card eyebrow="ACTION CENTER" title="الان چه کاری لازم است؟">
          {tasks.length === 0 ? (
            <div className="all-clear"><PartyPopper size={34} /><b>همه‌چیز مرتب است</b><span>موردی برای اقدام وجود ندارد.</span></div>
          ) : (
            <ul className="tasks">
              {tasks.map((t) => (
                <li key={t.title}>
                  <span className={`kpi-icon ${t.tone === "warn" ? "amber" : t.tone === "bad" ? "bad" : "navy"}`}><t.icon size={19} /></span>
                  <div><b>{t.title}</b><small>{t.sub}</small></div>
                  <button className="btn sm primary" onClick={() => go(...t.to)}>{t.cta} <ArrowLeft size={14} /></button>
                </li>
              ))}
            </ul>
          )}
          {data.alerts.length > 0 && (
            <div className="mini-alerts">
              <div className="eyebrow">آخرین هشدارها</div>
              {data.alerts.slice(0, 3).map((a) => (
                <div key={a.id}><span><b>{a.business}</b> · {fa(a.concurrentProviders)} منبع</span><time>{ago(a.createdAt)}</time></div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid-3">
        <Card eyebrow="DATA SOURCES" title="شبکهٔ منابع داده">
          <ProviderMap providers={data.providers} />
          <div className="map-legend"><span><i style={{ background: "#0FAF9E" }} />متصل</span><span><i style={{ background: "#FCA311" }} />کاهش کیفیت</span><span><i style={{ background: "#D64550" }} />قطع</span></div>
        </Card>

        <Card eyebrow="SCORE" title="میانگین امتیاز مشتریان">
          <div className="score-center"><ScoreRing score={k.avgScore || 300} size={132} /></div>
          <div className="score-bands">
            {data.scoreBuckets.map((b, i) => {
              const m = Math.max(1, ...data.scoreBuckets.map((x) => x.count));
              return <div key={b.range} title={`${b.range}: ${b.count}`}><i style={{ height: `${Math.max(6, (b.count / m) * 52)}px`, background: ["#D64550", "#E8843A", "#FCA311", "#5CC7B8", "#0FAF9E"][i] }} /><span>{fa(b.range.split("–")[0])}</span></div>;
            })}
          </div>
        </Card>

        <Card eyebrow="TOP 5" title="فعال‌ترین کسب‌وکارها">
          {data.topBusinesses.length === 0 ? <Empty /> : (
            <ol className="rank">
              {data.topBusinesses.slice(0, 5).map((b, i) => (
                <li key={b.id}>
                  <BizLogo name={b.name} src={b.logoUrl} size={38} radius={11} />
                  <div><div className="rank-row"><b>{cleanName(b.name)}</b><span>{num(b.total)}</span></div><div className="bar"><i style={{ width: `${(b.total / maxTop) * 100}%` }} /></div></div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
