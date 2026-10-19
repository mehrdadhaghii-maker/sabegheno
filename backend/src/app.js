// Express app (no listen) — server.js starts it; scripts/audit-routes.js inspects it.
const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const env = require("./config/env");
const logger = require("./utils/logger");
const { requestLogger } = require("./middleware/requestLogger");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { requireAuth, isAdmin } = require("./middleware/auth");

const authRoutes = require("./routes/auth.routes");
const creditCheckRoutes = require("./routes/creditCheck.routes");
const providerRoutes = require("./routes/providers.routes");
const { router: policyRoutes } = require("./routes/policy.routes");
const adminRoutes = require("./routes/admin.routes");
const utilsRoutes = require("./routes/utils.routes");
const supportRoutes = require("./routes/support.routes");
const notificationRoutes = require("./routes/notifications.routes");
const monitorRoutes = require("./routes/monitor");
const facilityRoutes = require("./routes/facilities.routes");
const apiKeyRoutes = require("./routes/apiKeys.routes");
const paymentRoutes = require("./routes/payments.routes");
const v1Routes = require("./routes/v1.routes");
const chequeRoutes = require("./routes/cheques.routes");
const integrationRoutes = require("./routes/integration.routes");
const contractRoutes = require("./routes/contracts.routes");
const publicRoutes = require("./routes/public.routes");
const { requireApiKey, apiKeyLimiter } = require("./middleware/apiKey");
const { router: businessRoutes, UPLOAD_DIR } = require("./routes/business.routes");

const app = express();

// Behind nginx every request would otherwise share nginx's IP — which would make
// per-IP rate limiting throttle ALL users together.
app.set("trust proxy", env.trustProxy);
app.disable("x-powered-by");

// --- hack.md: security headers --------------------------------------------
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // business logos are shown by the other origins
  contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, // the API only ever returns JSON/images
  hsts: env.isProd ? { maxAge: 15552000, includeSubDomains: true } : false,
  referrerPolicy: { policy: "no-referrer" },
}));

// --- hack.md: CORS only for the allowed front-end origins ------------------
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
if (env.isProd && env.corsOrigins.length === 0) {
  logger.warn("CORS_ORIGINS تنظیم نشده؛ در production فقط درخواست‌های same-origin (پشت nginx) پذیرفته می‌شود");
}
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);                       // curl / server-to-server / same-origin
    if (env.corsOrigins.includes(origin)) return cb(null, true);
    if (!env.isProd && env.corsOrigins.length === 0 && DEV_ORIGIN.test(origin)) return cb(null, true);
    return cb(null, false);                                   // no CORS headers → the browser blocks it
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Background-Poll"],
  maxAge: 600,
}));

const jsonSmall = express.json({ limit: "2mb" });
app.use((req, res, next) => (req.method === "POST" && /\/(admin\/contracts|support\/attachments|admin\/support\/attachments)\/?$/.test(req.path) ? next() : jsonSmall(req, res, next))); // contract upload brings its own 12 MB parser

// --- hack.md CSRF: auth is a Bearer header (never a cookie), so classic CSRF cannot
// ride on it. Defence in depth: a mutating request that carries a body must be
// application/json — a cross-site <form>/simple request cannot send that without a preflight.
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const hasBody = Number(req.headers["content-length"] || 0) > 0 || req.headers["transfer-encoding"];
    if (hasBody && !req.is("application/json")) return res.status(415).json({ error: "Content-Type باید application/json باشد" });
  }
  next();
});

// Business logos (validated PNG/JPG/WebP only — see business.routes.js).
app.use("/uploads", express.static(path.resolve(UPLOAD_DIR), { maxAge: "7d", fallthrough: true, dotfiles: "deny" }));
app.use("/api/uploads", express.static(path.resolve(UPLOAD_DIR), { maxAge: "7d", fallthrough: true, dotfiles: "deny" }));

app.use(requestLogger);

// --- hack.md: rate limiting ---------------------------------------------------
const limited = (name) => (req, res) => {
  logger.security(`Rate limit فعال شد (${name})`, { ip: req.ip, route: req.originalUrl.split("?")[0], method: req.method });
  res.status(429).json({ error: "تعداد درخواست‌ها زیاد است؛ کمی بعد دوباره تلاش کنید", code: "RATE_LIMITED" });
};
const rl = (opts) => rateLimit({ standardHeaders: true, legacyHeaders: false, ...opts });
// 100 requests / 15 min / IP on every login & token endpoint (brute-force protection)…
const authLimiter = rl({ windowMs: 15 * 60_000, max: env.rateLimit.authMax, handler: limited("auth") });
// …and a much tighter cap on the SMS-sending / password-checking endpoints.
const otpLimiter = rl({ windowMs: 10 * 60_000, max: 10, handler: limited("otp/login") });
// Everything else: higher ceiling because dashboards poll in the background.
const apiLimiter = rl({
  windowMs: 15 * 60_000, max: env.rateLimit.apiMax, handler: limited("api"),
  skip: (req) => /^\/(api\/)?(health|monitor|uploads|v1)(\/|$)/.test(req.path),
});
for (const prefix of ["", "/api"]) {
  app.use(`${prefix}/auth`, authLimiter);
  app.use(`${prefix}/admin/login`, authLimiter);
  app.use(`${prefix}/auth/otp`, otpLimiter);
  app.use(`${prefix}/admin/login`, otpLimiter);
}
app.use(apiLimiter);

app.get("/health", (req, res) => res.json({ ok: true }));
// Readiness: can we actually reach the database? (used by the deploy script and the uptime monitor)
const ready = async (req, res) => {
  try { await require("./db/prisma").$queryRaw`SELECT 1`; res.json({ ok: true, db: true }); }
  catch { res.status(503).json({ ok: false, db: false }); }
};
app.get("/health/ready", ready);
app.get("/api/health/ready", ready);
app.get("/api/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// Same-origin production deployments expose the API behind /api (nginx);
// the bare paths stay for local development.
function mount(p, ...handlers) {
  app.use(p, ...handlers);
  app.use(`/api${p}`, ...handlers);
}
mount("/auth", authRoutes);
mount("/credit-checks", creditCheckRoutes);
mount("/providers", providerRoutes);
mount("/policy", policyRoutes);
mount("/admin/contracts", contractRoutes.admin);
mount("/business/contract", contractRoutes.biz);
mount("/admin", adminRoutes);
mount("/utils", utilsRoutes);
mount("/support", supportRoutes);
mount("/notifications", notificationRoutes);
mount("/business", businessRoutes);
mount("/monitor", requireAuth, isAdmin, monitorRoutes);
mount("/facilities", facilityRoutes);
mount("/cheques", chequeRoutes);
mount("/business/integration", integrationRoutes);
mount("/business/api-keys", apiKeyRoutes);
mount("/payments", paymentRoutes);
// Public integration API — authenticated by API key, not by a login session.
mount("/v1", requireApiKey, apiKeyLimiter, v1Routes);
mount("/public", publicRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
