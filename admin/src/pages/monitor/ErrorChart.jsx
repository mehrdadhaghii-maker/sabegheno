import React, { useCallback, useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, Skeleton, Empty } from "../../ui.jsx";
import { fa } from "../../lib.js";
import { getChartData } from "../../services/monitorApi.js";
import { tehranHour } from "./format.js";

export default function ErrorChart({ tick, hours = 24 }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => getChartData(hours).then((d) => { setRows(d.map((r) => ({ ...r, label: tehranHour(r.hour) }))); setErr(""); }).catch((e) => setErr(e.message)), [hours]);
  useEffect(() => { load(); }, [load, tick]);

  return (
    <Card eyebrow="روند" title={`خطاها در ${fa(hours)} ساعت اخیر`}>
      {err && !rows ? <div className="callout bad"><p>{err}</p></div>
        : !rows ? <Skeleton h={220} />
        : !rows.some((r) => r.errors) ? <Empty text="در این بازه خطایی ثبت نشده است 🎉" />
        : (
          <div className="mon-chart" dir="ltr">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs><linearGradient id="monErr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E5484D" stopOpacity={0.35} /><stop offset="100%" stopColor="#E5484D" stopOpacity={0.02} /></linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6ECF2" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={Math.ceil(rows.length / 8) - 1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v, n) => [fa(v), n === "errors" ? "همهٔ خطاها" : "خطای ۵xx"]} labelFormatter={(l) => `ساعت ${l}`} />
                <Area type="monotone" dataKey="errors" stroke="#E5484D" strokeWidth={2} fill="url(#monErr)" />
                <Area type="monotone" dataKey="serverErrors" stroke="#B42318" strokeWidth={1.5} strokeDasharray="4 3" fill="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
    </Card>
  );
}
