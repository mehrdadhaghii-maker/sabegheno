// Live status of every outside system the platform depends on.
//   • PASSIVE: every real call (api.ir, Ontime24, Zarinpal, admin-connected services) reports its outcome here,
//     so the panel shows what is actually happening to real traffic — not just a ping.
//   • ACTIVE: probe() makes ONE cheap reachability request per host (no paid endpoint is called, no body is sent),
//     so an outage is visible even when nobody has made an inquiry for a while.
// State lives in memory (one api process); it is rebuilt within minutes after a restart.
const env = require("../config/env");
const prisma = require("../db/prisma");

const WINDOW = 50;            // last N real calls per service
const STALE_MS = 30 * 60_000; // no real traffic for 30 min → rely on the probe only
const stats = new Map();      // key → { ok, fail, lastOkAt, lastFailAt, lastError, lastStatus, samples: [{ok, ms, at}] }
const probes = new Map();     // key → { ok, ms, at, status, error }

function record(key, { ok, ms = 0, error = null, status = null }) {
  let s = stats.get(key);
  if (!s) { s = { ok: 0, fail: 0, lastOkAt: null, lastFailAt: null, lastError: null, lastStatus: null, samples: [] }; stats.set(key, s); }
  const at = Date.now();
  if (ok) { s.ok += 1; s.lastOkAt = at; } else { s.fail += 1; s.lastFailAt = at; s.lastError = String(error || "").slice(0, 200); }
  s.lastStatus = status;
  s.samples.push({ ok, ms, at });
  if (s.samples.length > WINDOW) s.samples.shift();
}

/** Wrap an async call so its success/failure + latency are recorded. The result/error is passed through untouched. */
async function track(key, fn) {
  const t0 = Date.now();
  try { const r = await fn(); record(key, { ok: true, ms: Date.now() - t0 }); return r; }
  catch (e) {
    // "not configured" and caller mistakes (4xx) are not an outage of the other side
    const callerSide = (e.status >= 400 && e.status < 500) || e.apiIrCode !== undefined; // bad input / provider said "no" — the provider itself is alive
    if (e.code === "NOT_CONFIGURED") { /* not an outage */ }
    else if (callerSide) record(key, { ok: true, ms: Date.now() - t0, status: e.status || null });
    else record(key, { ok: false, ms: Date.now() - t0, error: e.message, status: e.status || null });
    throw e;
  }
}

function realtime(key) {
  const s = stats.get(key);
  if (!s || !s.samples.length) return null;
  const recent = s.samples.filter((x) => Date.now() - x.at < STALE_MS);
  const base = recent.length ? recent : [];
  const fails = base.filter((x) => !x.ok).length;
  const ms = base.length ? Math.round(base.reduce((a, x) => a + x.ms, 0) / base.length) : null;
  return {
    calls: s.ok + s.fail, failures: s.fail, recentCalls: base.length, recentFailures: fails,
    avgMs: ms, lastOkAt: s.lastOkAt ? new Date(s.lastOkAt).toISOString() : null,
    lastFailAt: s.lastFailAt ? new Date(s.lastFailAt).toISOString() : null, lastError: s.lastError,
  };
}

async function probeHost(key, url) {
  const t0 = Date.now();
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(url, { method: "GET", redirect: "manual", signal: ctl.signal });
    // ANY HTTP answer (even 401/403/404) proves DNS + TLS + the server are alive; 5xx means the provider itself is failing.
    const res = { ok: r.status < 500, status: r.status, ms: Date.now() - t0, at: Date.now(), error: r.status >= 500 ? `HTTP ${r.status}` : null };
    probes.set(key, res); return res;
  } catch (e) {
    const res = { ok: false, status: null, ms: Date.now() - t0, at: Date.now(), error: e.name === "AbortError" ? "timeout" : (e.cause?.code || e.message) };
    probes.set(key, res); return res;
  } finally { clearTimeout(timer); }
}

const hostOf = (u) => { try { return new URL(u).origin; } catch { return null; } };

// Static description of the integrations that live in code/.env
function catalog() {
  return [
    { key: "database", name: "پایگاه داده (PostgreSQL)", group: "core", configured: true, kind: "db" },
    { key: "apiir", name: "api.ir — شاهکار، ثبت‌احوال، وام و چک برگشتی، پیامک", group: "data", configured: !!env.apiIr.apiKey, needs: "API_IR_KEY", url: env.apiIr.baseUrl, realtimeKeys: ["apiir"] },
    { key: "ontime24", name: "Ontime24 — ورود/کیف پول", group: "data", configured: !!(env.ontime24.adminUsername && env.ontime24.adminPassword), needs: "ONTIME24_ADMIN_USERNAME / ONTIME24_ADMIN_PASSWORD", url: env.ontime24.baseUrl, realtimeKeys: ["ontime24"], optional: true },
    { key: "zarinpal", name: "زرین‌پال — پرداخت گزارش شخص حقیقی", group: "payment", configured: env.payment.gateway === "zarinpal", needs: "ZARINPAL_MERCHANT_ID", url: "https://payment.zarinpal.com", realtimeKeys: ["zarinpal"], optional: true, note: env.payment.gateway === "mock" ? "درگاه آزمایشی (فقط توسعه)" : null },
    { key: "telegram", name: "تلگرام — هشدار خطاهای سرور", group: "alert", configured: !!(env.telegram.token && env.telegram.chatId), needs: "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID", url: "https://api.telegram.org", optional: true },
  ];
}

function verdict({ configured, optional }, rt, pr) {
  if (!configured) return optional ? "off" : "not_configured";
  const recentBad = rt && rt.recentCalls >= 3 && rt.recentFailures / rt.recentCalls >= 0.5;
  const someBad = rt && rt.recentFailures > 0;
  if (pr && !pr.ok && (!rt || rt.recentCalls === 0 || recentBad)) return "down";
  if (recentBad) return "down";
  if (someBad || (pr && pr.ms > 3500)) return "degraded";
  if (pr?.ok || (rt && rt.recentCalls > 0)) return "ok";
  return "unknown";
}

async function snapshot({ probe = true } = {}) {
  const items = [];
  for (const c of catalog()) {
    let pr = probes.get(c.key) || null;
    if (c.kind === "db") {
      const t0 = Date.now();
      try { await prisma.$queryRaw`SELECT 1`; pr = { ok: true, ms: Date.now() - t0, at: Date.now(), status: null, error: null }; }
      catch (e) { pr = { ok: false, ms: Date.now() - t0, at: Date.now(), status: null, error: e.message.slice(0, 160) }; }
      probes.set(c.key, pr);
    } else if (probe && c.url && (c.configured || !c.optional)) {
      pr = await probeHost(c.key, c.url);
    }
    const rts = (c.realtimeKeys || []).flatMap((k) => [...stats.keys()].filter((x) => x === k || x.startsWith(`${k}:`)).map(realtime)).filter(Boolean);
    const rt = rts.length ? rts.reduce((a, b) => ({ calls: a.calls + b.calls, failures: a.failures + b.failures, recentCalls: a.recentCalls + b.recentCalls, recentFailures: a.recentFailures + b.recentFailures, avgMs: a.avgMs ?? b.avgMs, lastOkAt: [a.lastOkAt, b.lastOkAt].filter(Boolean).sort().pop() || null, lastFailAt: [a.lastFailAt, b.lastFailAt].filter(Boolean).sort().pop() || null, lastError: a.lastError || b.lastError })) : null;
    items.push({
      key: c.key, name: c.name, group: c.group, configured: c.configured, needs: c.configured ? null : c.needs, note: c.note || null, optional: !!c.optional,
      status: verdict(c, rt, pr), probe: pr ? { ok: pr.ok, ms: pr.ms, status: pr.status, error: pr.error, at: new Date(pr.at).toISOString() } : null, traffic: rt,
    });
  }

  // admin-connected partner services (traffic fines, insurers, …): their own tested state + live traffic
  const partners = await prisma.externalService.findMany({ select: { id: true, key: true, name: true, enabled: true, status: true, lastTestAt: true, lastError: true, lastLatencyMs: true, lastStatusCode: true, baseUrl: true, category: true } });
  for (const p of partners) {
    const rt = realtime(`partner:${p.key}`);
    let status = !p.enabled ? "off" : p.status === "error" ? "down" : p.status === "connected" ? "ok" : "unknown";
    if (p.enabled && rt && rt.recentCalls >= 3 && rt.recentFailures / rt.recentCalls >= 0.5) status = "down";
    else if (p.enabled && status === "ok" && rt?.recentFailures) status = "degraded";
    items.push({ key: `partner:${p.key}`, id: p.id, name: p.name, group: "partner", configured: true, enabled: p.enabled, status, host: hostOf(p.baseUrl), category: p.category, probe: p.lastTestAt ? { ok: p.status === "connected", ms: p.lastLatencyMs, status: p.lastStatusCode, error: p.lastError, at: p.lastTestAt.toISOString() } : null, traffic: rt, untested: p.status === "untested" });
  }

  const required = items.filter((i) => !i.optional && i.group !== "partner" && i.status !== "off");
  const bad = required.filter((i) => i.status === "down" || i.status === "not_configured");
  const overall = items.some((i) => i.key === "database" && i.status === "down") ? "down" : bad.length ? "down" : items.some((i) => i.status === "degraded" || (i.group === "partner" && i.status === "down")) ? "degraded" : "ok";
  return { checkedAt: new Date().toISOString(), overall, items };
}

module.exports = { record, track, snapshot, realtime };
