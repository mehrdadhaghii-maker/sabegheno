import React, { useEffect, useState } from "react";
import { FilePlus2, HandCoins, FileX2, Ban, Upload, Loader2, ShieldAlert, CheckCircle2, Clock3, Layers } from "lucide-react";
import { api } from "../api.js";
import { Card, CardHead, Field, MoneyInput, Badge, Empty, validNationalId, num, toman, dateTimeFa, agoFa, useToast, NationalId } from "./kit.jsx";

// One unified screen for every event a business reports. "bad_debt" and "bounced_check"
// also put the person on the platform-wide defaulter list (blocked at every business).
const TYPES = [
  { key: "new_commitment", label: "تعهد جدید", icon: FilePlus2, tone: "info", group: "commit", hint: "وام یا اعتبار جدیدی که به مشتری داده‌اید" },
  { key: "settled", label: "تسویه شد", icon: HandCoins, tone: "good", group: "default", hint: "پرداخت کامل؛ می‌توانید بدحسابی قبلی را هم رفع کنید" },
  { key: "delay", label: "تأخیر در پرداخت", icon: Clock3, tone: "warn", group: "default", hint: "عقب‌افتادگی قسط" },
  { key: "bounced_check", label: "چک برگشتی", icon: FileX2, tone: "bad", group: "default", hint: "مشتری در فهرست بدحسابان شبکه قرار می‌گیرد", blocks: true },
  { key: "bad_debt", label: "بدحسابی / عدم پرداخت", icon: Ban, tone: "bad", group: "default", hint: "مشتری در فهرست بدحسابان شبکه قرار می‌گیرد", blocks: true },
];
const LABEL = { commitment_created: "تعهد جدید", new_commitment: "تعهد جدید", settled: "تسویه", delay: "تأخیر", bounced_check: "چک برگشتی", bad_debt: "بدحسابی" };
const TONE = { commitment_created: "info", new_commitment: "info", settled: "good", delay: "warn", bounced_check: "bad", bad_debt: "bad" };

export default function Commitments() {
  const toast = useToast();
  const [tab, setTab] = useState("commit"); // commit | default | bulk
  const [f, setF] = useState({ nationalId: "", type: "new_commitment", amount: 0, delayDays: 0, note: "", settleDefault: false });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState([]);
  const [defaults, setDefaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const set = (p) => setF((x) => ({ ...x, ...p }));

  const load = () => Promise.all([api.listRecentReports(), api.myDefaulters()]).then(([r, d]) => { setRecent(r); setDefaults(d); }).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const types = TYPES.filter((t) => t.group === tab);
  useEffect(() => { if (tab !== "bulk" && !types.some((t) => t.key === f.type)) set({ type: types[0].key, settleDefault: false }); }, [tab]);
  const meta = TYPES.find((t) => t.key === f.type);
  const idErr = !f.nationalId ? "کد ملی را وارد کنید" : !validNationalId(f.nationalId) ? "کد ملی معتبر نیست" : "";

  async function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (idErr) return toast.warning("کد ملی را بررسی کنید", "فرم کامل نیست");
    if (f.type === "new_commitment" && !f.amount) return toast.warning("مبلغ تعهد را وارد کنید", "فرم کامل نیست");
    setBusy(true);
    try {
      await api.reportProviderEvent({ nationalId: f.nationalId, eventType: f.type, amount: f.amount, delayDays: f.delayDays, note: f.note || undefined, settleDefault: f.type === "settled" ? f.settleDefault : undefined });
      toast.success(meta.blocks ? "ثبت شد؛ این مشتری از همین لحظه در تمام کسب‌وکارها مسدود است." : "گزارش با موفقیت ثبت شد", "ثبت شد");
      setF({ ...f, nationalId: "", amount: 0, delayDays: 0, note: "", settleDefault: false }); setTouched(false);
      load();
    } catch (e2) { toast.error(e2.message, "ثبت انجام نشد"); } finally { setBusy(false); }
  }

  async function importCsv(file) {
    if (!file) return;
    setBusy(true);
    try {
      const lines = (await file.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const rows = lines.slice(lines[0].toLowerCase().includes("national") ? 1 : 0).map((l) => {
        const [nationalId, eventType = "bad_debt", amount = "0", delayDays = "0", note = ""] = l.split(",").map((x) => x.trim());
        return { nationalId, eventType, amount: Number(amount) || 0, delayDays: Number(delayDays) || 0, note: note || undefined };
      }).filter((r) => /^\d{10}$/.test(r.nationalId));
      if (!rows.length) throw new Error("در فایل CSV هیچ ردیف معتبر ۱۰ رقمی پیدا نشد");
      const res = await api.reportProviderEventsBulk(rows);
      toast.success(`${num(res.count || rows.length)} ردیف با موفقیت ثبت شد`, "درون‌ریزی انجام شد");
      load();
    } catch (e) { toast.error(e.message, "درون‌ریزی ناموفق"); } finally { setBusy(false); }
  }

  const active = defaults.filter((d) => d.status === "active");

  return (
    <div className="bx-stack">
      <div className="bx-tabs big">
        <button className={tab === "commit" ? "on" : ""} onClick={() => setTab("commit")}><FilePlus2 size={19} /> تعهد جدید</button>
        <button className={tab === "default" ? "on" : ""} onClick={() => setTab("default")}><ShieldAlert size={19} /> تسویه / بدحسابی / چک برگشتی</button>
        <button className={tab === "bulk" ? "on" : ""} onClick={() => setTab("bulk")}><Upload size={19} /> درون‌ریزی گروهی</button>
      </div>

      <div className="bx-grid-2 wide-left">
        {tab !== "bulk" ? (
          <Card accent={meta.blocks ? "red" : "teal"}>
            <CardHead eyebrow={tab === "commit" ? "NEW COMMITMENT" : "DEFAULT & SETTLEMENT"} title={tab === "commit" ? "ثبت تعهد جدید" : "ثبت تسویه، تأخیر یا بدحسابی"} />
            <form className="bx-stack" onSubmit={submit} noValidate>
              {tab === "default" && <div className="bx-typepick">{types.map((t) => <button type="button" key={t.key} className={`${f.type === t.key ? "on" : ""} ${t.tone}`} onClick={() => set({ type: t.key, settleDefault: false })}><t.icon size={20} /><b>{t.label}</b><small>{t.hint}</small></button>)}</div>}
              {tab === "commit" && <div className="bx-note"><FilePlus2 size={18} /><p>{meta.hint}. این تعهد بلافاصله در تشخیص هم‌پوشانی سایر کسب‌وکارها دیده می‌شود.</p></div>}
              <div className="bx-form-grid">
                <Field label="کد ملی مشتری" required error={touched && idErr}>
                  <span className="bx-input"><input dir="ltr" inputMode="numeric" maxLength={10} value={f.nationalId} placeholder="0012345678" onChange={(e) => set({ nationalId: e.target.value.replace(/\D/g, "") })} /></span>
                </Field>
                <Field label={f.type === "delay" ? "مبلغ عقب‌افتاده" : "مبلغ"} required={f.type === "new_commitment"}><MoneyInput value={f.amount} onChange={(v) => set({ amount: v })} /></Field>
                {f.type === "delay" && <Field label="روز تأخیر"><span className="bx-input"><input dir="ltr" inputMode="numeric" value={f.delayDays || ""} onChange={(e) => set({ delayDays: Number(e.target.value.replace(/\D/g, "")) || 0 })} placeholder="۰" /></span></Field>}
              </div>
              {f.type === "settled" && <label className="bx-check"><input type="checkbox" checked={f.settleDefault} onChange={(e) => set({ settleDefault: e.target.checked })} /><span /><div><b>رفع وضعیت بدحسابی این مشتری</b><small>اگر شما او را بدحساب ثبت کرده‌اید، پس از تسویه مسدودیت او در کل شبکه برداشته می‌شود.</small></div></label>}
              {meta.blocks && <div className="bx-alert bad"><ShieldAlert size={19} /><p><b>توجه:</b> با ثبت این مورد، مشتری در فهرست بدحسابان شبکه قرار می‌گیرد و هیچ کسب‌وکاری نمی‌تواند به او اعتبار بدهد، تا زمانی که شما تسویه را ثبت کنید.</p></div>}
              <Field label="توضیحات (اختیاری)"><textarea rows={3} value={f.note} onChange={(e) => set({ note: e.target.value })} className="bx-textarea" /></Field>
              <button className={`bx-btn lg wide ${meta.blocks ? "danger-solid" : "primary"}`} disabled={busy}>{busy ? <><Loader2 size={18} className="spin" /> در حال ثبت…</> : `ثبت «${meta.label}»`}</button>
            </form>
          </Card>
        ) : (
          <Card accent="navy"><CardHead eyebrow="BULK IMPORT" title="درون‌ریزی گروهی از فایل CSV" />
            <div className="bx-stack">
              <div className="bx-note"><Layers size={18} /><p>ستون‌ها: <code dir="ltr">nationalId,eventType,amount,delayDays,note</code> — حداکثر ۱٬۰۰۰ ردیف. مقادیر <code dir="ltr">eventType</code>: new_commitment, settled, delay, bounced_check, bad_debt</p></div>
              <label className="bx-drop"><Upload size={30} /><b>{busy ? "در حال درون‌ریزی…" : "فایل CSV را اینجا انتخاب کنید"}</b><small>UTF-8 · هر ردیف یک رویداد</small><input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => { importCsv(e.target.files?.[0]); e.target.value = ""; }} /></label>
            </div>
          </Card>
        )}

        <Card accent="red"><CardHead eyebrow="MY DEFAULTERS" title="بدحسابان ثبت‌شده توسط شما" />
          {loading ? null : defaults.length === 0 ? <Empty icon={CheckCircle2} text="موردی ثبت نکرده‌اید." /> : (
            <ul className="bx-feed">
              {defaults.slice(0, 8).map((d) => (
                <li key={d.id}><span className={`dot ${d.status === "active" ? "" : "ok"}`} /><div><div><Badge tone={d.status === "active" ? "bad" : "good"}>{d.status === "active" ? "مسدود در شبکه" : "تسویه‌شده"}</Badge> <b>{LABEL[d.kind]}</b></div><small className="bx-nid-line"><NationalId value={d.nationalId} masked={d.nationalIdMasked} onFill={async (n) => { await api.fillDefaulterNid(d.id, n); await load(); }} /> · {toman(d.amount)}</small></div><time>{agoFa(d.createdAt)}</time></li>))}
              {active.length > 0 && <li className="sum"><b>{num(active.length)}</b> مشتری هم‌اکنون در کل شبکه مسدود هستند.</li>}
            </ul>
          )}
        </Card>
      </div>

      <Card accent="navy" className="no-pad"><div className="bx-card-pad"><CardHead eyebrow="RECENT" title="گزارش‌های اخیر شما" /></div>
        {recent.length === 0 ? <Empty text="هنوز گزارشی ثبت نشده است." /> : (
          <div className="bx-table-wrap"><table className="bx-table"><thead><tr><th>نوع</th><th>کد ملی</th><th>مبلغ</th><th>تأخیر</th><th>توضیحات</th><th>زمان</th></tr></thead>
            <tbody>{recent.slice(0, 12).map((r) => <tr key={r.id}><td><Badge tone={TONE[r.eventType]}>{LABEL[r.eventType] || r.eventType}</Badge></td><td><NationalId value={r.nationalId} masked={r.nationalIdMasked} /></td><td>{toman(r.amount)}</td><td>{r.delayDays ? `${num(r.delayDays)} روز` : "—"}</td><td className="muted">{r.note || "—"}</td><td className="muted">{dateTimeFa(r.createdAt)}</td></tr>)}</tbody></table></div>
        )}
      </Card>
    </div>
  );
}
