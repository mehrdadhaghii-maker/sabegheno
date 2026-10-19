const app = require("./app");
const env = require("./config/env");
const logger = require("./utils/logger");
const { sendErrorAlert } = require("./services/telegram");
const { flush } = require("./middleware/requestLogger");

const server = app.listen(env.port, () => {
  logger.success(`سابقه‌نو API روی پورت ${env.port} در حال اجراست (${env.nodeEnv})`);
});

// 🧹 scheduled jobs (Asia/Tehran): logs 03:00, sensitive-data retention 03:30
if (process.env.DISABLE_CRON !== "true") {
  require("./cron/cleanup").startLogCleanup();
  require("./cron/dataRetention").startDataRetention();
  require("./cron/facilitySync").startFacilitySync();
  require("./cron/integration").startIntegrationJobs();
  require("./cron/healthWatch").startHealthWatch();
  logger.success("زمان‌بندی پاک‌سازی فعال شد (۰۳:۰۰ لاگ‌ها، ۰۳:۳۰ داده‌های حساس — وقت تهران)");
}

process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logger.error(`unhandledRejection: ${err.message}`, { stack: err.stack, statusCode: 500 });
  sendErrorAlert({ message: `unhandledRejection: ${err.message}`, route: "process", method: "-", statusCode: 500 });
});

process.on("uncaughtException", (err) => {
  logger.error(`uncaughtException: ${err.message}`, { stack: err.stack, statusCode: 500 });
  sendErrorAlert({ message: `uncaughtException: ${err.message}`, route: "process", method: "-", statusCode: 500 });
  setTimeout(() => process.exit(1), 1500).unref(); // let the DB write + alert go out, then let Docker restart us
});

async function shutdown(signal) {
  logger.info(`${signal} دریافت شد؛ در حال خاموش کردن سرور`);
  server.close(async () => {
    try { await flush(); await require("./db/prisma").$disconnect(); } catch { /* ignore */ }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 8000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
