// 🧹 Daily 03:30 (Tehran) — data.md retention rules.
const cron = require("node-cron");
const { runRetention } = require("../services/dataRetention.service");
const logger = require("../utils/logger");

const startDataRetention = () =>
  cron.schedule("30 3 * * *", () => runRetention().catch((e) => logger.error(`runRetention failed: ${e.message}`, { stack: e.stack })), { timezone: "Asia/Tehran" });

module.exports = { startDataRetention };
