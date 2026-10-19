const { ZodError } = require("zod");
const logger = require("../utils/logger");
const { sendErrorAlert } = require("../services/telegram");

function notFound(req, res) {
  res.status(404).json({ error: "Not found" });
}

// Central error handler. Internal details (stack, SQL, paths) never reach the client.
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Bad input is a 400, never a 500 (and never a Telegram alert).
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "ورودی نامعتبر است",
      code: "VALIDATION",
      fields: err.issues.slice(0, 10).map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  const status = err.status || err.statusCode || 500;
  const route = req.originalUrl.split("?")[0];
  const ctx = { route, method: req.method, userId: req.auth?.id, statusCode: status };

  if (status >= 500) {
    logger.error(err.message || "Unhandled error", { ...ctx, stack: err.stack, meta: { code: err.code, role: req.auth?.role } });
    if (status === 500) sendErrorAlert({ message: err.message, route, method: req.method, statusCode: status });
  } else {
    logger.warn(`${err.message || "client error"}`, ctx);
  }

  const databaseError = err.code && (String(err.code).startsWith("P1") || String(err.code).startsWith("P2"));
  const clientMsg = status >= 500
    ? (err.publicMessage || (databaseError ? "دیتابیس آماده نیست؛ ابتدا migration/seed را اجرا کنید" : "خطای داخلی سرور"))
    : (err.publicMessage || (err.type === "entity.parse.failed" ? "بدنهٔ درخواست JSON معتبر نیست" : err.type === "entity.too.large" ? "حجم درخواست زیاد است" : "درخواست نامعتبر است"));

  res.status(status).json({
    error: clientMsg,
    ...(err.code && typeof err.code === "string" && /^[A-Z_]+$/.test(err.code) ? { code: err.code } : {}),
    ...(!process.env.NODE_ENV || process.env.NODE_ENV !== "production" ? { detail: err.message } : {}),
  });
}

module.exports = { notFound, errorHandler };
