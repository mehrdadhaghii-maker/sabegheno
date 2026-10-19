// Logs every request (console/file) and stores a compact row in request_logs.
// Monitoring/health/static traffic is excluded: the dashboard polls every few
// seconds and would otherwise drown the table in its own noise.
const logger = require("../utils/logger");

const SKIP = [/^\/(api\/)?monitor(\/|$)/, /^\/(api\/)?health$/, /^\/(api\/)?uploads(\/|$)/];

const queue = [];
let lastFlushError = 0;
async function flush() {
  if (!queue.length) return;
  const rows = queue.splice(0, queue.length);
  try {
    await require("../db/prisma").requestLog.createMany({ data: rows });
  } catch (e) {
    if (Date.now() - lastFlushError > 60_000) { lastFlushError = Date.now(); console.error("[requestLogger] ذخیرهٔ دسته‌ای لاگ ناموفق بود:", e.message); }
  }
}
setInterval(flush, 2000).unref(); // batching = 1 INSERT / 2 s instead of 1 per request

function requestLogger(req, res, next) {
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    const path = req.originalUrl.split("?")[0]; // query strings may carry personal data — never logged
    if (SKIP.some((re) => re.test(path))) return;
    const duration = Math.round(Number(process.hrtime.bigint() - started) / 1e6);
    const status = res.statusCode;
    // Matched route pattern (e.g. /credit-checks/:id) keeps cardinality low; scanners hitting 404s collapse into one bucket.
    const pattern = req.route ? `${req.baseUrl}${req.route.path === "/" ? "" : req.route.path}` : "";
    const route = req.route ? pattern.replace(/^\/api(?=\/|$)/, "") || "/" : "[unmatched]"; // /api/x and /x share one bucket
    const meta = { method: req.method, route: path, statusCode: status, duration, ip: req.ip, userAgent: (req.headers["user-agent"] || "").slice(0, 120), skipDb: true };
    const msg = `⬅️ ${req.method} ${path} ${status} ${duration}ms`;
    if (status >= 500) logger.error(msg, meta);
    else if (status >= 400) logger.warn(msg, meta);
    else logger.info(msg, meta);
    queue.push({ method: req.method, route: route.slice(0, 200), statusCode: status, duration, ip: req.ip || null, userId: req.auth?.id || null });
    if (queue.length >= 100) flush();
  });
  next();
}

module.exports = { requestLogger, flush };
