import React, { useCallback, useEffect, useState } from "react";
import { Check, Eye } from "lucide-react";
import { Badge, Card, Drawer, Empty, Skeleton } from "../../ui.jsx";
import { fa } from "../../lib.js";
import { getErrors, getErrorById, resolveError } from "../../services/monitorApi.js";
import { statusTone, tehranDateTime } from "./format.js";

const LIMIT = 10;

export default function ErrorTable({ tick }) {
  const [filters, setFilters] = useState({ resolved: "false", statusCode: "" });
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [detail, setDetail] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => getErrors({ limit: LIMIT, page, resolved: filters.resolved, statusCode: filters.statusCode })
    .then((d) => { setData(d); setErr(""); }).catch((e) => setErr(e.message)), [page, filters]);
  useEffect(() => { load(); }, [load, tick]);

  const setF = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); };
  const markResolved = async (id) => { setBusyId(id); try { await resolveError(id); setDetail(null); await load(); } catch (e) { setErr(e.message); } finally { setBusyId(null); } };
  const open = async (id) => { try { setDetail(await getErrorById(id)); } catch (e) { setErr(e.message); } };

  return (
    <Card eyebrow="خطاها" title="خطاهای اخیر" pad={false}
      action={(
        <div className="mon-filters">
          <select value={filters.resolved} onChange={setF("resolved")} aria-label="وضعیت"><option value="false">حل‌نشده</option><option value="true">حل‌شده</option><option value="">همه</option></select>
          <select value={filters.statusCode} onChange={setF("statusCode")} aria-label="کد وضعیت"><option value="">همهٔ کدها</option><option value="500">۵۰۰</option><option value="503">۵۰۳</option><option value="400">۴۰۰</option><option value="401">۴۰۱</option></select>
        </div>
      )}>
      {err && <div className="callout bad" role="alert" style={{ margin: 16 }}><p>{err}</p></div>}
      {!data ? <div style={{ padding: 16 }}><Skeleton h={200} /></div> : data.items.length === 0 ? <Empty text="خطایی با این فیلتر وجود ندارد" /> : (
        <div className="table-wrap">
          <table className="table compact">
            <thead><tr><th>زمان (تهران)</th><th>کد</th><th>مسیر</th><th>متد</th><th>پیام</th><th /></tr></thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id} tabIndex={0} onClick={() => open(e.id)} onKeyDown={(k) => k.key === "Enter" && open(e.id)}>
                  <td className="muted small">{tehranDateTime(e.createdAt)}</td>
                  <td><Badge tone={statusTone(e.statusCode || 500)}>{fa(e.statusCode || "—")}</Badge></td>
                  <td dir="ltr" className="mon-route">{e.route || "—"}</td>
                  <td dir="ltr">{e.method || "—"}</td>
                  <td className="mon-msg" title={e.message}>{e.message}</td>
                  <td className="row-actions" onClick={(x) => x.stopPropagation()}>
                    {e.resolved ? <Badge tone="good">حل شد</Badge> : <button className="btn sm" disabled={busyId === e.id} onClick={() => markResolved(e.id)}><Check size={14} /> حل شد</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pages > 1 && (
        <div className="pager">
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>قبلی</button>
          <span className="muted small">صفحهٔ {fa(page)} از {fa(data.pages)} · {fa(data.total)} مورد</span>
          <button className="btn sm" disabled={page >= data.pages} onClick={() => setPage(page + 1)}>بعدی</button>
        </div>
      )}
      <Drawer open={!!detail} onClose={() => setDetail(null)} title="جزئیات خطا"
        footer={detail && !detail.resolved ? <button className="btn primary wide" disabled={busyId === detail.id} onClick={() => markResolved(detail.id)}><Check size={16} /> علامت‌گذاری به‌عنوان حل‌شده</button> : null}>
        {detail && (
          <div className="stack">
            <dl className="dl">
              <div><dt>زمان</dt><dd>{tehranDateTime(detail.createdAt)}</dd></div>
              <div><dt>کد وضعیت</dt><dd>{fa(detail.statusCode || "—")}</dd></div>
              <div><dt>مسیر</dt><dd dir="ltr">{detail.method} {detail.route}</dd></div>
              <div><dt>شناسهٔ کاربر</dt><dd dir="ltr">{detail.userId || "—"}</dd></div>
            </dl>
            <h3 className="mon-h">پیام</h3><pre className="mon-pre" dir="ltr">{detail.message}</pre>
            {detail.stack && (<><h3 className="mon-h">Stack</h3><pre className="mon-pre" dir="ltr">{detail.stack}</pre></>)}
            {detail.meta && (<><h3 className="mon-h">Meta</h3><pre className="mon-pre" dir="ltr">{JSON.stringify(detail.meta, null, 2)}</pre></>)}
          </div>
        )}
      </Drawer>
    </Card>
  );
}
