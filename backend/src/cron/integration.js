// Webhook worker (every 2 min) and pull-sync (every 6 h), Asia/Tehran.
const cron = require("node-cron");
const logger = require("../utils/logger");
const webhooks = require("../services/webhook.service");
const { syncAll } = require("../services/syncPull.service");

function startIntegrationJobs() {
  const guard = (name, fn) => () => fn().catch((e) => logger.error(`${name} failed: ${e.message}`, { stack: e.stack }));
  cron.schedule("*/2 * * * *", guard("webhook worker", () => webhooks.deliverDue()), { timezone: "Asia/Tehran" });
  cron.schedule("0 */6 * * *", guard("pull sync", syncAll), { timezone: "Asia/Tehran" });
}
module.exports = { startIntegrationJobs };
