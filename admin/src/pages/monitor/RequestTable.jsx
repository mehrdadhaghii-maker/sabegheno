import React, { useCallback, useEffect, useState } from "react";
import { Badge, Card, Empty, Skeleton } from "../../ui.jsx";
import { fa } from "../../lib.js";
import { getRecentRequests } from "../../services/monitorApi.js";
import { statusTone, tehranDateTime } from "./format.js";

export default function RequestTable({ tick }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => getRecentRequests(20).then((d) => { setRows(d); setErr(""); }).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load, tick]);

  return (
    <Card eyebrow="ترافیک" title="آخرین درخواست‌ها" pad={false}>
      {err && !rows ? <div className="callout bad" style={{ margin: 16 }}><p>{err}</p></div>
        : !rows ? <div style={{ padding: 16 }}><Skeleton h={200} /></div>
        : rows.length === 0 ? <Empty text="هنوز درخواستی ثبت نشده است" />
        : (
          <div className="table-wrap">
            <table className="table compact">
              <thead><tr><th>زمان</th><th>متد</th><th>مسیر</th><th>وضعیت</th><th>مدت</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="muted small">{tehranDateTime(r.createdAt)}</td>
                    <td dir="ltr">{r.method}</td>
                    <td dir="ltr" className="mon-route">{r.route}</td>
                    <td><Badge tone={statusTone(r.statusCode)}>{fa(r.statusCode)}</Badge></td>
                    <td className={r.duration > 1000 ? "mon-slow" : ""}>{fa(r.duration)} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Card>
  );
}
