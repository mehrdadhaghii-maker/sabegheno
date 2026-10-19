import React, { useCallback, useEffect, useState } from "react";
import { LayoutDashboard, Building2, FileSearch, Database, ShieldCheck, LifeBuoy, BellRing, LogOut, RefreshCw, Activity, Lock, Hourglass, FileText, HeartPulse } from "lucide-react";
import { adminApi, getAuth, setAuth } from "./api.js";
import { Segmented, useToast } from "./ui.jsx";
import { fa } from "./lib.js";
import Login from "./Login.jsx";
import Overview from "./pages/Overview.jsx";
import Businesses from "./pages/Businesses.jsx";
import Checks from "./pages/Checks.jsx";
import Providers from "./pages/Providers.jsx";
import Policy from "./pages/Policy.jsx";
import Support from "./pages/Support.jsx";
import Notifications from "./pages/Notifications.jsx";
import MonitorDashboard from "./pages/monitor/MonitorDashboard.jsx";
import Security from "./pages/Security.jsx";
import Reviews from "./pages/Reviews.jsx";
import Health from "./pages/Health.jsx";
import Site from "./pages/Site.jsx";

const PAGES = {
  overview: { label: "نمای کلی", sub: "وضعیت لحظه‌ای سامانه و روند تصمیم‌های اعتباری", icon: LayoutDashboard },
  businesses: { label: "کسب‌وکارها", sub: "تأیید، رد، تعلیق و پروندهٔ هر کسب‌وکار", icon: Building2 },
  checks: { label: "استعلام‌ها", sub: "استعلام‌ها به تفکیک هر کسب‌وکار", icon: FileSearch },
  reviews: { label: "بررسی پیشرفته", sub: "استعلام‌های ارجاع‌شده برای اعتبارسنجی تکمیلی و تصمیم نهایی", icon: Hourglass },
  providers: { label: "منابع داده", sub: "Providerها و سرویس‌های وب متصل‌شده", icon: Database },
  policy: { label: "سیاست اعتبار", sub: "قواعد سراسری و قوانین سفارشی هر کسب‌وکار", icon: ShieldCheck },
  support: { label: "پشتیبانی", sub: "تیکت‌های کسب‌وکارها", icon: LifeBuoy },
  notifications: { label: "اعلان‌ها", sub: "ارسال پیام به پنل کسب‌وکارها", icon: BellRing },
  site: { label: "قرارداد و لندینگ", sub: "جایگزینی قرارداد برای همهٔ کسب‌وکارها و نمایش شرکت‌های معتمد در صفحهٔ اصلی", icon: FileText },
  health: { label: "وضعیت سرویس‌ها", sub: "سلامت api.ir، دیتابیس، درگاه پرداخت و سرویس‌های متصل‌شده", icon: HeartPulse },
  monitor: { label: "مانیتورینگ", sub: "خطاها، درخواست‌ها و سلامت سرور به‌صورت زنده", icon: Activity },
  security: { label: "امنیت", sub: "رمز عبور، 2FA، نشست‌ها و گزارش پاک‌سازی داده", icon: Lock },
};
const readHash = () => {
  const [page, param] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { page: PAGES[page] ? page : "overview", param };
};

function Admin({ onLogout }) {
  const [route, setRoute] = useState(readHash);
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [businesses, setBusinesses] = useState([]);
  const [providers, setProviders] = useState([]);
  const [policy, setPolicy] = useState(null);
  const [rules, setRules] = useState([]);
  const [services, setServices] = useState([]);
  const [reviews, setReviews] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [notifHistory, setNotifHistory] = useState([]);
  const [checks, setChecks] = useState([]);
  const [checkFilter, setCheckFilter] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, toastNode] = useToast();

  const loadCore = useCallback(async () => {
    setLoading(true); setError("");
    try {
      // each resource loads independently — one failing endpoint (e.g. a table
      // that `prisma db push` has not created yet) must not blank the whole panel
      const jobs = [
        ["تحلیل‌ها", adminApi.analytics(days), setAnalytics],
        ["کسب‌وکارها", adminApi.businesses(), setBusinesses],
        ["Providerها", adminApi.providers(), setProviders],
        ["سیاست اعتبار", adminApi.policy(), setPolicy],
        ["قوانین", adminApi.rules(), setRules],
        ["سرویس‌ها", adminApi.services(), setServices],
        ["تیکت‌ها", adminApi.tickets(), setTickets],
        ["بررسی‌ها", adminApi.reviews("pending"), setReviews],
        ["اعلان‌ها", adminApi.notifications(), setNotifHistory],
      ];
      const res = await Promise.allSettled(jobs.map((j) => j[1]));
      const failed = [];
      res.forEach((r, i) => { if (r.status === "fulfilled") jobs[i][2](r.value); else failed.push(`${jobs[i][0]}: ${r.reason?.message || "خطا"}`); });
      if (failed.length) setError(`بخشی از داده‌ها بارگذاری نشد — ${failed.join(" | ")}`);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [days]);
  const loadChecks = useCallback(() => adminApi.checks(checkFilter).then(setChecks).catch((e) => setError(e.message)), [checkFilter]);

  useEffect(() => { loadCore(); }, [loadCore]);
  useEffect(() => { loadChecks(); }, [loadChecks]);
  useEffect(() => { const t = setInterval(() => { adminApi.tickets(undefined, true).then(setTickets).catch(() => {}); }, 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);

  const go = (page, param) => { window.location.hash = `#/${page}${param ? `/${param}` : ""}`; };
  const refresh = () => { loadCore(); loadChecks(); };

  // one helper for every mutation: call → toast → reload
  const mutate = (fn, msg, reload = loadCore) => async (...args) => {
    try { const r = await fn(...args); toast(msg || "ذخیره شد"); await reload(); return r; } catch (e) { toast(e.message, "bad"); }
  };
  const updateBusiness = (id, body, msg) => mutate(() => adminApi.updateBusiness(id, body), msg)();
  const svcApi = {
    onCreate: mutate((b) => adminApi.createService(b), "سرویس متصل شد"),
    onUpdate: mutate((id, b) => adminApi.updateService(id, b), "تغییرات سرویس ذخیره شد"),
    onDelete: mutate((id) => adminApi.deleteService(id), "سرویس حذف شد"),
    onTest: async (id, nid) => { try { const r = await adminApi.testService(id, nid); loadCore(); return r; } catch (e) { return { ok: false, error: e.message }; } },
  };

  const bs = analytics?.businessStatus || {};
  const pending = (bs.pending_docs || 0) + (bs.pending_contract || 0);
  const openTickets = tickets.filter((t) => t.status === "open").length;
  const badge = { businesses: pending, support: openTickets, reviews: reviews?.length || 0 };
  const cur = PAGES[route.page];
  const adminName = getAuth()?.admin?.username || "admin";
  const showRange = route.page === "overview" || route.page === "checks";

  return (
    <div className="app">
      <header className="appbar">
        <a className="appbar-brand" href="#/overview" aria-label="سابقه‌نو"><img src="/brand-lockup-horizontal.png" alt="سابقه‌نو" /></a>
        <span className="appbar-divider" />
        <div className="appbar-title">
          <span className="appbar-icon"><cur.icon size={21} /></span>
          <div><h1>{cur.label}</h1><p>{cur.sub}</p></div>
        </div>
        <div className="topbar-actions">
          {showRange && <Segmented value={days} onChange={setDays} options={[[7, "۷ روز"], [30, "۳۰ روز"], [90, "۹۰ روز"]]} />}
          <button className={`icon-btn ${loading ? "spin" : ""}`} onClick={refresh} aria-label="بروزرسانی"><RefreshCw size={18} /></button>
          <span className="admin-chip"><b>{adminName.slice(0, 1).toUpperCase()}</b><span>{adminName}</span></span>
          <button className="icon-btn" onClick={onLogout} aria-label="خروج" title="خروج"><LogOut size={18} /></button>
        </div>
      </header>

      <nav className="topnav" aria-label="منوی اصلی">
        {Object.entries(PAGES).map(([k, p]) => (
          <button key={k} className={route.page === k ? "active" : ""} onClick={() => go(k)} aria-current={route.page === k ? "page" : undefined}>
            <p.icon size={18} /><span>{p.label}</span>
            {badge[k] > 0 && <em className="nav-count">{fa(badge[k])}</em>}
          </button>
        ))}
      </nav>

      <section className="content">
        {error && <div className="callout bad" role="alert"><p>{error}</p></div>}
        <div className="page" key={route.page}>
          {route.page === "overview" && <Overview data={analytics} loading={loading} go={go} />}
          {route.page === "businesses" && <Businesses rows={businesses} initialTab={route.param === "pending" ? "pending" : "all"} onUpdate={updateBusiness} goChecks={(id) => { setCheckFilter({ businessId: id }); go("checks"); }} />}
          {route.page === "checks" && <Checks rows={checks} analytics={analytics} filter={checkFilter} setFilter={setCheckFilter} />}
          {route.page === "providers" && <Providers rows={providers} businesses={businesses} services={services} svc={svcApi} reload={loadCore}
            onCreate={mutate((b) => adminApi.createProvider(b), "Provider ثبت شد")} onUpdate={mutate((id, b) => adminApi.updateProvider(id, b), "تغییرات ذخیره شد")} />}
          {route.page === "policy" && <Policy policy={policy} rules={rules} businesses={businesses} services={services} checks={checks}
            onSave={mutate((b) => adminApi.updatePolicy(b), "سیاست جدید ذخیره شد")}
            onCreateRule={mutate((b) => adminApi.createRule(b), "قانون ثبت شد")} onUpdateRule={mutate((id, b) => adminApi.updateRule(id, b), "قانون بروزرسانی شد")} onDeleteRule={mutate((id) => adminApi.deleteRule(id), "قانون حذف شد")} />}
          {route.page === "support" && <Support tickets={tickets} onReply={mutate((id, t, c) => adminApi.replyTicket(id, t, c), "پاسخ ارسال شد")} onStatus={mutate((id, s) => adminApi.setTicketStatus(id, s), "وضعیت تیکت تغییر کرد")} />}
          {route.page === "reviews" && <Reviews onChanged={loadCore} />}
          {route.page === "site" && <Site businesses={businesses} />}
          {route.page === "health" && <Health />}
          {route.page === "monitor" && <MonitorDashboard />}
          {route.page === "security" && <Security />}
          {route.page === "notifications" && <Notifications businesses={businesses} history={notifHistory} onSend={mutate((b) => adminApi.sendNotification(b), "اعلان ارسال شد")} />}
        </div>
      </section>
      {toastNode}
    </div>
  );
}

export default function App() {
  const [auth, setA] = useState(getAuth());
  useEffect(() => {
    const on = () => setA(getAuth());
    window.addEventListener("admin-auth", on);
    return () => window.removeEventListener("admin-auth", on);
  }, []);
  if (!auth) return <Login onDone={() => setA(getAuth())} />;
  return <Admin onLogout={async () => { await adminApi.logout(); setAuth(null); }} />;
}
