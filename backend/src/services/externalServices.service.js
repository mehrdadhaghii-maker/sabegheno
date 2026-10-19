// Connector for third-party organisations (traffic fines, license points, insurers, …).
// Configured by an admin in the panel; every call is made with the stored (encrypted) credentials.
//   • auth: none | bearer | header | query | basic
//   • custom headers, query parameters and a JSON body template with {{nationalId}} {{birthDate}} {{now}}
//   • several outputs picked from the JSON response (number | count | boolean | text)
//   • optional score impact (e.g. −5 points per traffic fine, capped)
// Never throws into a credit check: a failing partner must not break an inquiry.
const dns = require("dns").promises;
const net = require("net");
const prisma = require("../db/prisma");
const { decrypt } = require("../utils/secret");

const MAX_BYTES = 1_000_000;
const SENSITIVE = /^(authorization|x-api-key|api-key|apikey|token|x-auth-token|cookie)$/i;

// ---------- response reading ------------------------------------------------------------------
// "data.items[0].count" and "data.items.0.count" both work.
function getAt(obj, path) {
  const parts = String(path || "").replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  return parts.reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function extract(json, { path, type = "number" }) {
  const v = getAt(json, path);
  if (v === undefined || v === null) return { ok: false, error: `مقداری در مسیر «${path}» پیدا نشد` };
  if (type === "count") return { ok: true, value: Array.isArray(v) ? v.length : typeof v === "object" ? Object.keys(v).length : Number(v) || 0 };
  if (type === "boolean") return { ok: true, value: v === true || v === 1 || /^(true|yes|1|بله)$/i.test(String(v)) };
  if (type === "text") return { ok: true, value: String(v).slice(0, 300) };
  if (typeof v === "number") return { ok: true, value: v };
  if (typeof v === "boolean") return { ok: true, value: v ? 1 : 0 };
  if (Array.isArray(v)) return { ok: true, value: v.length };
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v.replace(/,/g, "")))) return { ok: true, value: Number(v.replace(/,/g, "")) };
  return { ok: false, error: `مقدار «${String(v).slice(0, 40)}» عددی نیست` };
}
const readPath = (obj, path) => { const r = extract(obj, { path, type: "number" }); return r.ok ? r.value : null; }; // kept for older callers

const defaultOutputs = (svc) => [{ key: "value", label: svc.name || "مقدار", path: svc.responsePath || "data.count", type: "number" }];

function evaluate(outputs, json) {
  return outputs.map((o) => ({ key: o.key, label: o.label || o.key, type: o.type || "number", path: o.path, ...extract(json, o) }));
}

// ---------- SSRF guard ------------------------------------------------------------------------------
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  return x === "::1" || x === "::" || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe80") || x.startsWith("::ffff:127.") || x.startsWith("::ffff:10.") || x.startsWith("::ffff:192.168.");
}

async function assertSafeUrl(url) {
  if (!/^https?:$/.test(url.protocol)) throw new Error("فقط آدرس http/https مجاز است");
  if (process.env.ALLOW_PRIVATE_SERVICE_URLS === "true") return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(host)) throw new Error("آدرس داخلی (localhost/.local) مجاز نیست");
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => { throw new Error("نام دامنه پیدا نشد (DNS)"); });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error("آدرس به شبکهٔ داخلی اشاره می‌کند و برای امنیت مسدود شد");
}

// ---------- request building ------------------------------------------------------------------------
const render = (tpl, ctx) => String(tpl ?? "").replace(/\{\{\s*(nationalId|birthDate|now)\s*\}\}/g, (_, k) => ctx[k] ?? "");

function buildRequest(cfg, ctx) {
  const url = new URL(cfg.baseUrl);
  const headers = { Accept: "application/json" };
  for (const h of cfg.headers || []) if (h?.name) headers[h.name] = render(h.value, ctx);

  const key = cfg.apiKey;
  if (key) {
    if (cfg.authType === "bearer") headers.Authorization = `Bearer ${key}`;
    else if (cfg.authType === "header") headers[cfg.authName || "x-api-key"] = key;
    else if (cfg.authType === "query") url.searchParams.set(cfg.authName || "api_key", key);
    else if (cfg.authType === "basic") headers.Authorization = `Basic ${Buffer.from(key).toString("base64")}`; // key = "user:password"
  }

  const params = Array.isArray(cfg.queryParams) && cfg.queryParams.length ? cfg.queryParams : null;
  let body;
  if (cfg.method === "POST") {
    headers["Content-Type"] = "application/json";
    body = cfg.bodyTemplate ? render(cfg.bodyTemplate, ctx) : JSON.stringify({ [cfg.nationalIdParam || "nationalId"]: ctx.nationalId });
    if (params) for (const p of params) if (p?.name) url.searchParams.set(p.name, render(p.value, ctx));
  } else if (params) {
    for (const p of params) if (p?.name) url.searchParams.set(p.name, render(p.value, ctx));
  } else {
    url.searchParams.set(cfg.nationalIdParam || "nationalId", ctx.nationalId); // simple mode (backward compatible)
  }
  return { url, headers, body };
}

// What an admin may see in the test console — secrets masked.
function previewOf(cfg, { url, headers, body }) {
  const safeUrl = new URL(url);
  if (cfg.apiKey && cfg.authType === "query") safeUrl.searchParams.set(cfg.authName || "api_key", "••••••••");
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, SENSITIVE.test(k) ? "••••••••" : v]));
  return { method: cfg.method, url: safeUrl.toString(), headers: h, body: body ?? null };
}

const maskSecrets = (text, cfg) => (cfg.apiKey ? String(text).split(cfg.apiKey).join("••••••••") : String(text));

// ---------- the call ---------------------------------------------------------------------------------
async function performCall(cfg, ctx) {
  const started = Date.now();
  let req;
  try {
    req = buildRequest(cfg, ctx);
    await assertSafeUrl(req.url);
  } catch (err) {
    return { ok: false, status: null, ms: Date.now() - started, error: err.message, preview: null, json: null, outputs: [] };
  }
  const preview = previewOf(cfg, req);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs || 6000);
    const res = await fetch(req.url, { method: cfg.method, headers: req.headers, body: req.body, signal: ctrl.signal, redirect: "manual" }).finally(() => clearTimeout(timer));
    const text = (await res.text()).slice(0, MAX_BYTES);
    const ms = Date.now() - started;
    if (res.status >= 300 && res.status < 400) return { ok: false, status: res.status, ms, error: "سرویس ریدایرکت کرد؛ آدرس نهایی را وارد کنید", preview, json: null, sample: maskSecrets(text, cfg).slice(0, 4000), outputs: [] };
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    if (!res.ok) return { ok: false, status: res.status, ms, error: `HTTP ${res.status}`, preview, json, sample: maskSecrets(text, cfg).slice(0, 4000), outputs: [] };
    if (json === null) return { ok: false, status: res.status, ms, error: "پاسخ سرویس JSON معتبر نیست", preview, json: null, sample: maskSecrets(text, cfg).slice(0, 4000), outputs: [] };
    const outputs = evaluate(cfg.outputs?.length ? cfg.outputs : defaultOutputs(cfg), json);
    return { ok: outputs.some((o) => o.ok), status: res.status, ms, error: outputs.every((o) => !o.ok) ? outputs[0]?.error : null, preview, json, sample: maskSecrets(JSON.stringify(json, null, 2), cfg).slice(0, 4000), outputs };
  } catch (err) {
    return { ok: false, status: null, ms: Date.now() - started, error: err.name === "AbortError" ? "timeout (پاسخی در زمان مقرر نیامد)" : err.message, preview, json: null, outputs: [] };
  }
}

// ---------- score impact -------------------------------------------------------------------------------
function impactPoints(impact, values) {
  if (!impact?.enabled) return { points: 0 };
  const v = values[impact.output] ?? Object.values(values).find((x) => typeof x === "number");
  const n = typeof v === "boolean" ? (v ? 1 : 0) : Number(v);
  if (!Number.isFinite(n) || n <= 0) return { points: 0 };
  if (impact.mode === "threshold") return n >= (impact.threshold ?? 1) ? { points: -Math.abs(impact.points || 0), label: impact.label } : { points: 0 };
  const raw = Math.round(n * Math.abs(impact.perUnit || 0));
  return { points: -Math.min(Math.abs(impact.cap || raw), raw), label: impact.label };
}

// ---------- public API ---------------------------------------------------------------------------------
const hydrate = (svc) => ({
  ...svc,
  apiKey: decrypt(svc.apiKeyEnc),
  headers: (() => { try { return JSON.parse(decrypt(svc.headersEnc) || "[]"); } catch { return []; } })(),
});

async function queryService(service, nationalId, birthDate) {
  const cfg = service.apiKeyEnc !== undefined && service.apiKey === undefined ? hydrate(service) : service;
  const ctx = { nationalId, birthDate: birthDate || "", now: new Date().toISOString() };
  const r = await performCall(cfg, ctx);
  require("./serviceStatus").record(`partner:${service.key}`, { ok: r.ok, ms: r.ms, error: r.error, status: r.status }); // live status board
  const values = Object.fromEntries(r.outputs.filter((o) => o.ok).map((o) => [o.key, o.value]));
  const primary = r.outputs.find((o) => o.ok && ["number", "count", "boolean"].includes(o.type));
  const imp = r.ok ? impactPoints(cfg.scoreImpact, values) : { points: 0 };
  return {
    key: service.key, name: service.name, unit: service.unit, ok: r.ok,
    value: primary ? (typeof primary.value === "boolean" ? Number(primary.value) : primary.value) : null,
    values, outputs: r.outputs, ms: r.ms, error: r.ok ? undefined : r.error,
    scorePoints: imp.points, impactLabel: imp.label,
  };
}

async function queryAllEnabled(nationalId, birthDate) {
  const services = await prisma.externalService.findMany({ where: { enabled: true } });
  return Promise.all(services.map((s) => queryService(s, nationalId, birthDate)));
}

module.exports = { queryService, queryAllEnabled, readPath, getAt, extract, evaluate, render, buildRequest, previewOf, performCall, impactPoints, isPrivateIp, assertSafeUrl, hydrate };
