import React, { useCallback, useEffect, useState } from "react";
import { Card, Empty, Skeleton } from "../../ui.jsx";
import { fa } from "../../lib.js";
import { getTopRoutes } from "../../services/monitorApi.js";
import { tehranDateTime } from "./format.js";

export default function TopRoutes({ tick }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => getTopRoutes(7, 8).then((d) => { setRows(d); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load, tick]);
  const max = Math.max(1, ...(rows || []).map((r) => r.count));

  return (
    <Card eyebrow="۷ روز اخیر" title="پرخطاترین مسیرها">
      {err && !rows ? <div className="callout bad"><p>{err}</p></div>
        : !rows ? <Skeleton h={180} />
        : rows.length === 0 ? <Empty text="مسیر خطاداری ثبت نشده است" />
        : (
          <ol className="mon-top">
            {rows.map((r) => (
              <li key={r.route}>
                <div className="mon-top-row"><code dir="ltr">{r.route}</code><b>{fa(r.count)}</b></div>
                <div className="mon-bar"><i style={{ width: `${(r.count / max) * 100}%` }} /></div>
                <small className="muted">آخرین: {tehranDateTime(r.lastAt)}</small>
              </li>
            ))}
          </ol>
        )}
    </Card>
  );
}
