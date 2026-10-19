// Every 5 minutes: probe the outside world; tell the admins (Telegram, if configured) when a REQUIRED service
// goes down or comes back — only on a state change, so a long outage is one message, not a hundred.
const cron = require("node-cron");
const logger = require("../utils/logger");
const { snapshot } = require("../services/serviceStatus");
const { sendErrorAlert } = require("../services/telegram");

const last = new Map(); // key → "ok" | "bad"

async function tick() {
  const snap = await snapshot({ probe: true });
  for (const i of snap.items) {
    if (i.optional || i.status === "off" || i.status === "unknown") continue;
    const now = i.status === "down" || i.status === "not_configured" ? "bad" : "ok";
    const before = last.get(i.key);
    last.set(i.key, now);
    if (before === undefined && now === "ok") continue;          // first look, all fine
    if (before === now) continue;
    if (now === "bad") {
      logger.error(`سرویس خارجی از دسترس خارج شد: ${i.name}`, { meta: { key: i.key, probe: i.probe, traffic: i.traffic } });
      sendErrorAlert({ message: `سرویس «${i.name}» در دسترس نیست (${i.probe?.error || i.traffic?.lastError || i.status})`, route: "health-watch", method: "-", statusCode: 503 });
    } else {
      logger.success(`سرویس خارجی دوباره در دسترس است: ${i.name}`);
      sendErrorAlert({ message: `✅ سرویس «${i.name}» دوباره در دسترس است`, route: "health-watch", method: "-", statusCode: 200 });
    }
  }
}

function startHealthWatch() {
  const run = () => tick().catch((e) => logger.error(`health watch failed: ${e.message}`));
  setTimeout(run, 20_000).unref();                                  // first look shortly after boot
  cron.schedule("*/5 * * * *", run, { timezone: "Asia/Tehran" });
}
module.exports = { startHealthWatch };
