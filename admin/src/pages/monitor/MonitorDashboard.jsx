import React, { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Pause, Play } from "lucide-react";
import StatsCards from "./StatsCards.jsx";
import ErrorChart from "./ErrorChart.jsx";
import ErrorTable from "./ErrorTable.jsx";
import RequestTable from "./RequestTable.jsx";
import TopRoutes from "./TopRoutes.jsx";
import { tehranDateTime } from "./format.js";

const INTERVAL_MS = 5000;

export default function MonitorDashboard() {
  const [tick, setTick] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(new Date());
  const [auto, setAuto] = useState(true);
  const timer = useRef(null);

  const bump = useCallback(() => { setTick((t) => t + 1); setUpdatedAt(new Date()); }, []);

  // Auto-refresh every 5 s; paused while the tab is hidden; interval is always cleaned up.
  useEffect(() => {
    if (!auto) return undefined;
    const start = () => { clearInterval(timer.current); timer.current = setInterval(bump, INTERVAL_MS); };
    const onVis = () => { if (document.hidden) clearInterval(timer.current); else { bump(); start(); } };
    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(timer.current); document.removeEventListener("visibilitychange", onVis); };
  }, [auto, bump]);

  return (
    <div className="stack mon">
      <div className="mon-bar-top">
        <span className="muted small">آخرین به‌روزرسانی: <b>{tehranDateTime(updatedAt)}</b>{auto ? " · هر ۵ ثانیه" : " · متوقف"}</span>
        <div className="btn-row">
          <button className="btn sm" onClick={() => setAuto(!auto)}>{auto ? <><Pause size={14} /> توقف</> : <><Play size={14} /> ادامه</>}</button>
          <button className="btn sm" onClick={bump}><RefreshCw size={14} /> رفرش دستی</button>
        </div>
      </div>
      <StatsCards tick={tick} />
      <div className="grid-main">
        <ErrorChart tick={tick} />
        <TopRoutes tick={tick} />
      </div>
      <ErrorTable tick={tick} />
      <RequestTable tick={tick} />
    </div>
  );
}
