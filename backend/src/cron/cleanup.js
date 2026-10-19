// 🧹 Daily 03:00 (Tehran) — delete error/request logs older than LOG_RETENTION_DAYS.
const cron = require("node-cron");
const prisma = require("../db/prisma");
const env = require("../config/env");
const logger = require("../utils/logger");

async function cleanupLogs(now = new Date()) {
  const cutoff = new Date(now.getTime() - env.logRetentionDays * 86400_000);
  const [errors, requests] = await Promise.all([
    prisma.errorLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
    prisma.requestLog.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);
  const total = errors.count + requests.count;
  logger.cleanup(`پاک‌سازی لاگ‌ها: ${errors.count} خطا و ${requests.count} درخواست قدیمی‌تر از ${env.logRetentionDays} روز حذف شد`);
  await prisma.cleanupReport.create({ data: { kind: "log_retention", total, details: { errorLogs: errors.count, requestLogs: requests.count, retentionDays: env.logRetentionDays } } }).catch(() => {});
  return { errors: errors.count, requests: requests.count };
}

function startLogCleanup() {
  return cron.schedule("0 3 * * *", () => cleanupLogs().catch((e) => logger.error(`cleanupLogs failed: ${e.message}`, { stack: e.stack })), { timezone: "Asia/Tehran" });
}

module.exports = { startLogCleanup, cleanupLogs };
