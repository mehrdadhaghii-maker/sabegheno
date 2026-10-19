import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CircleDot, Clock, Gauge, Activity } from "lucide-react";
import { Kpi, Skeleton } from "../../ui.jsx";
import { fa, num } from "../../lib.js";
import { getStats } from "../../services/monitorApi.js";

export default function StatsCards({ tick }) {
  const [s, setS] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => getStats().then((d) => { setS(d); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load, tick]);

  if (err && !s) return <div className="callout bad" role="alert"><p>آمار بارگذاری نشد: {err}</p></div>;
  if (!s) return <div className="grid-kpi"><Skeleton h={110} /><Skeleton h={110} /><Skeleton h={110} /><Skeleton h={110} /><Skeleton h={110} /></div>;
  return (
    <div className="grid-kpi mon-kpis">
      <Kpi label="کل خطاها" value={num(s.total)} icon={AlertTriangle} tone="navy" hint={`${fa(s.requestsToday)} درخواست امروز`} />
      <Kpi label="حل‌نشده" value={num(s.unresolved)} icon={CircleDot} tone={s.unresolved ? "bad" : "teal"} />
      <Kpi label="ساعت اخیر" value={num(s.lastHour)} icon={Clock} tone={s.lastHour ? "warn" : "teal"} />
      <Kpi label="نرخ موفقیت (۲۴ ساعت)" value={fa(s.successRate)} unit="٪" icon={Activity} tone={s.successRate >= 99 ? "teal" : "warn"} hint="درخواست‌های بدون خطای ۵xx" />
      <Kpi label="میانگین زمان پاسخ" value={num(s.avgResponseTime)} unit="میلی‌ثانیه" icon={Gauge} tone="navy" />
    </div>
  );
}
