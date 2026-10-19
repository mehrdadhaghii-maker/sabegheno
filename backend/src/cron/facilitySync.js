// Every business that pushes facilities through the API must confirm them at least every 72 hours.
// Daily 04:00 (Tehran): unsettled API-sourced facilities not confirmed for > 72 h → one reminder per stale batch.
const cron = require("node-cron");
const prisma = require("../db/prisma");
const logger = require("../utils/logger");

const STALE_HOURS = 72;

async function remindStale(now = new Date()) {
  const cutoff = new Date(now.getTime() - STALE_HOURS * 3600_000);
  const rows = await prisma.facility.findMany({ where: { settledAt: null, source: "api", lastSyncedAt: { lt: cutoff }, staleNotifiedAt: null }, select: { id: true, businessId: true } });
  const byBusiness = new Map();
  for (const r of rows) byBusiness.set(r.businessId, [...(byBusiness.get(r.businessId) || []), r.id]);
  for (const [businessId, ids] of byBusiness) {
    await prisma.notification.create({ data: { businessId, title: "به‌روزرسانی وضعیت اعتبارها", body: `وضعیت ${ids.length} اعتبار شما بیش از ${STALE_HOURS} ساعت است به‌روز نشده. اگر مشتری تسویه کرده، همین حالا از طریق API یا پنل اعلام کنید تا بتواند دوباره اعتبار بگیرد.`, level: "warning" } });
    await prisma.facility.updateMany({ where: { id: { in: ids } }, data: { staleNotifiedAt: now } });
  }
  logger.cleanup(`یادآوری به‌روزرسانی اعتبارها: ${rows.length} اعتبار در ${byBusiness.size} کسب‌وکار`);
  return { facilities: rows.length, businesses: byBusiness.size };
}

const startFacilitySync = () =>
  cron.schedule("0 4 * * *", () => remindStale().catch((e) => logger.error(`remindStale failed: ${e.message}`, { stack: e.stack })), { timezone: "Asia/Tehran" });

module.exports = { startFacilitySync, remindStale, STALE_HOURS };
