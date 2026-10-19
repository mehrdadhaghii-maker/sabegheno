import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, MinusCircle, HelpCircle, Loader2, PlayCircle } from "lucide-react";
import { adminApi } from "../api.js";
import { Badge, Card, Empty, Skeleton, useToast } from "../ui.jsx";
import { fa, ago } from "../lib.js";

const ST = {
  ok: { label: "سالم", tone: "good", icon: CheckCircle2 },
  degraded: { label: "کند / ناپایدار", tone: "warn", icon: AlertTriangle },
  down: { label: "قطع", tone: "bad", icon: XCircle },
  not_configured: { label: "تنظیم نشده", tone: "bad", icon: XCircle },
  off: { label: "غیرفعال", tone: "neutral", icon: MinusCircle },
  unknown: { label: "نامشخص", tone: "neutral", icon: HelpCircle },
};
const GROUPS = [["core", "هسته"], ["data", "منابع دادهٔ اعتباری"], ["payment", "پرداخت"], ["alert", "هشداردهی"], ["partner", "سرویس‌های متصل‌شده از پنل"]];
const OVERALL = { ok: ["همهٔ سرویس‌های ضروری سالم‌اند", "good"], degraded: ["برخی سرویس‌ها کند یا ناپایدارند", "warn"], down: ["حداقل یک سرویس ضروری قطع است", "bad"] };

function Row({ it }) {
  const st = ST[it.status] || ST.unknown;
  const Icon = st.icon;
  const t = it.traffic;
  return (
    <li className={`hl-row s-${it.status}`}>
      <Icon size={20} className="hl-ic" />
      <div className="hl-main">
        <b>{it.name}</b>
        <small>
          {!it.configured && it.needs ? `نیازمند: ${it.needs}` : it.note || it.host || ""}
          {it.probe && ` · پاسخ ${fa(it.probe.ms ?? 0)}ms${it.probe.status ? ` (HTTP ${fa(it.probe.status)})` : ""} · ${ago(it.probe.at)}`}
          {it.probe && it.probe.ok === false && it.probe.error ? ` · ${it.probe.error}` : ""}
        </small>
        {t && (
          <small>
            ترافیک واقعی: {fa(t.calls)} تماس، {fa(t.failures)} خطا{t.avgMs != null ? ` · میانگین ${fa(t.avgMs)}ms` : ""}
            {t.lastError ? ` · آخرین خطا: ${t.lastError}` : ""}
          </small>
        )}
        {it.untested && <small>این سرویس هنوز تست نشده است.</small>}
      </div>
      <Badge tone={st.tone}>{st.label}</Badge>
    </li>
  );
}

export default function Health() {
  const toast = useToast();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [nid, setNid] = useState("");
  const [testing, setTesting] = useState(false);
  const [testOut, setTestOut] = useState(null);

  const load = useCallback((fresh) => {
    setBusy(true);
    return adminApi.systemHealth(fresh === true).then(setD).catch((e) => toast.error(e.message)).finally(() => setBusy(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); const t = setInterval(() => !document.hidden && load(), 30000); return () => clearInterval(t); }, [load]);

  async function testAll() {
    if (!/^\d{10}$/.test(nid)) { toast.error("یک کد ملی ۱۰ رقمی معتبر برای تست وارد کنید"); return; }
    setTesting(true); setTestOut(null);
    try { const r = await adminApi.testAllServices(nid); setTestOut(r); await load(true); } catch (e) { toast.error(e.message); } finally { setTesting(false); }
  }

  if (!d) return <Skeleton h={320} />;
  const [msg, tone] = OVERALL[d.overall] || OVERALL.degraded;
  return (
    <div className="stack">
      <Card eyebrow="SYSTEM HEALTH" title="وضعیت سرویس‌های خارجی"
        action={<button className="btn sm" onClick={() => load(true)} disabled={busy}>{busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} بررسی دوباره</button>}>
        <div className={`callout ${tone === "good" ? "info" : tone}`}><p><b>{msg}</b> · آخرین بررسی {ago(d.checkedAt)}</p></div>
        <p className="muted small">«پاسخ» یعنی سرور آن سرویس به یک درخواست سبک جواب داده است (هیچ تماس پولی انجام نمی‌شود). «ترافیک واقعی» نتیجهٔ تماس‌های واقعی کاربران از آخرین راه‌اندازی است. هر ۵ دقیقه خودکار بررسی می‌شود و قطع/وصل سرویس‌های ضروری در تلگرام (در صورت تنظیم) خبر داده می‌شود.</p>
      </Card>

      {GROUPS.map(([g, title]) => {
        const items = d.items.filter((i) => i.group === g);
        if (!items.length) return null;
        return <Card key={g} title={title} pad={false}><ul className="hl-list">{items.map((it) => <Row key={it.key} it={it} />)}</ul></Card>;
      })}
      {!d.items.some((i) => i.group === "partner") && <Card title="سرویس‌های متصل‌شده از پنل"><Empty text="هنوز سرویسی از بخش «منابع داده» متصل نشده است." /></Card>}

      <Card eyebrow="LIVE TEST" title="تست زندهٔ همهٔ سرویس‌های متصل‌شده">
        <p className="muted small">با یک کد ملی واقعی، همهٔ سرویس‌های فعال بخش «منابع داده» را یک‌بار صدا می‌زند و وضعیتشان را به‌روز می‌کند. ممکن است هزینهٔ تماس داشته باشد.</p>
        <div className="hl-test">
          <input dir="ltr" inputMode="numeric" maxLength={10} value={nid} onChange={(e) => setNid(e.target.value.replace(/\D/g, ""))} placeholder="کد ملی ۱۰ رقمی" />
          <button className="btn primary" onClick={testAll} disabled={testing}>{testing ? <Loader2 size={15} className="spin" /> : <PlayCircle size={15} />} اجرای تست</button>
        </div>
        {testOut && (
          <ul className="hl-list">
            <li className="hl-row"><div className="hl-main"><b>{fa(testOut.ok)} از {fa(testOut.tested)} سرویس موفق بود</b></div></li>
            {testOut.results.map((r) => <li key={r.id} className={`hl-row s-${r.ok ? "ok" : "down"}`}>{r.ok ? <CheckCircle2 size={20} className="hl-ic" /> : <XCircle size={20} className="hl-ic" />}<div className="hl-main"><b>{r.name}</b><small>{fa(r.ms ?? 0)}ms{r.status ? ` · HTTP ${fa(r.status)}` : ""}{r.error ? ` · ${r.error}` : ""}</small></div></li>)}
          </ul>
        )}
      </Card>
    </div>
  );
}
