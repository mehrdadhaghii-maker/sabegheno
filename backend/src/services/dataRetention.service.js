// data.md — sensitive-data retention.
//   • user deletes account  → PII scrubbed IMMEDIATELY, row soft-deleted (deletedAt)
//   • 30 days later         → hard delete (row removed)
//   • inactive > 12 months  → same pipeline, reason "inactive"
// Sensitive fields: mobile number, e-mail (none stored today), bank card (never
// stored — only gateway token + last 4, see PaymentCard).
const fs = require("fs");
const path = require("path");
const prisma = require("../db/prisma");
const env = require("../config/env");
const logger = require("../utils/logger");
const attachments = require("./attachments.service");

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const DAY = 86400_000;
const monthsAgo = (now, m) => { const d = new Date(now); d.setMonth(d.getMonth() - m); return d; };

function removeLogoFiles(businessId) {
  try {
    const dir = path.join(UPLOAD_DIR, "logos");
    for (const f of fs.readdirSync(dir)) if (f.startsWith(`${businessId}.`)) fs.unlinkSync(path.join(dir, f));
  } catch { /* logo already gone — fine */ }
}

/** Immediate part: wipe personal data, kill sessions, keep a tombstone row. */
async function softDeleteBusiness(id, reason = "user") {
  const b = await prisma.business.findUnique({ where: { id }, select: { mobile: true, deletedAt: true } });
  if (!b || b.deletedAt) return false;
  const now = new Date();
  const files = await prisma.ticketAttachment.findMany({ where: { OR: [{ message: { ticket: { businessId: id } } }, { uploaderRole: "business", uploaderId: id }] }, select: { storedName: true } }).catch(() => []);
  await prisma.$transaction([
    prisma.session.updateMany({ where: { subjectRole: "business", subjectId: id, revokedAt: null }, data: { revokedAt: now, revokedReason: "account_deleted" } }),
    prisma.otpCode.deleteMany({ where: { mobile: b.mobile } }),
    prisma.ticketAttachment.deleteMany({ where: { OR: [{ message: { ticket: { businessId: id } } }, { uploaderRole: "business", uploaderId: id }] } }),
    prisma.notification.deleteMany({ where: { businessId: id } }),
    prisma.supportTicket.deleteMany({ where: { businessId: id } }), // messages cascade — may contain personal text
    prisma.apiKey.updateMany({ where: { businessId: id, revokedAt: null }, data: { revokedAt: now } }), // integrations stop at once
    prisma.creditCheck.updateMany({ where: { businessId: id }, data: { nationalIdEnc: null } }), // customers' national IDs go with the account
    prisma.facility.updateMany({ where: { businessId: id }, data: { nationalIdEnc: null } }),
    prisma.issuedCheque.updateMany({ where: { businessId: id }, data: { nationalIdEnc: null } }),
    prisma.defaulter.updateMany({ where: { reportedByBusinessId: id }, data: { nationalIdEnc: null } }),
    prisma.providerEvent.updateMany({ where: { provider: { businessId: id } }, data: { nationalIdEnc: null } }),
    prisma.business.update({
      where: { id },
      data: { mobile: `deleted-${id}`, name: "حساب حذف‌شده", brandName: null, logoUrl: null, rejectionReason: null, status: "suspended", isVerified: false, deletedAt: now, deletionReason: reason },
    }),
  ]);
  removeLogoFiles(id);
  attachments.deleteFiles(files.map((f) => f.storedName));
  return true;
}

async function softDeleteUser(id, reason = "user") {
  const u = await prisma.endUser.findUnique({ where: { id }, select: { mobile: true, deletedAt: true } });
  if (!u || u.deletedAt) return false;
  const now = new Date();
  await prisma.$transaction([
    prisma.session.updateMany({ where: { subjectRole: "user", subjectId: id, revokedAt: null }, data: { revokedAt: now, revokedReason: "account_deleted" } }),
    prisma.otpCode.deleteMany({ where: { mobile: u.mobile } }),
    prisma.paymentCard.deleteMany({ where: { userId: id } }), // card tokens go immediately
    prisma.endUser.update({ where: { id }, data: { mobile: `deleted-${id}`, nationalIdHash: `deleted-${id}`, nationalIdEnc: null, deletedAt: now, deletionReason: reason } }),
  ]);
  return true;
}

async function hardDeleteBusiness(id) {
  await prisma.$transaction([
    prisma.installment.deleteMany({ where: { facility: { businessId: id } } }),
    prisma.facility.deleteMany({ where: { businessId: id } }),
    prisma.apiKey.deleteMany({ where: { businessId: id } }),
    prisma.creditCheck.deleteMany({ where: { businessId: id } }),
    prisma.inquiryLog.deleteMany({ where: { businessId: id } }),
    prisma.customRule.deleteMany({ where: { businessId: id } }),
    prisma.provider.updateMany({ where: { businessId: id }, data: { businessId: null } }), // shared provider history stays, link goes
    prisma.session.deleteMany({ where: { subjectRole: "business", subjectId: id } }),
    prisma.business.delete({ where: { id } }),
  ]);
}

async function hardDeleteUser(id) {
  await prisma.$transaction([
    prisma.session.deleteMany({ where: { subjectRole: "user", subjectId: id } }),
    prisma.endUser.delete({ where: { id } }), // PaymentCard rows cascade
  ]);
}

/** Daily job. Returns (and persists) the counts — data.md §5 "report". */
async function runRetention(now = new Date()) {
  const report = { inactiveBusinesses: 0, inactiveUsers: 0, hardDeletedBusinesses: 0, hardDeletedUsers: 0, otpCodes: 0, sessions: 0, loginAttempts: 0, errors: 0 };
  const inactiveCutoff = monthsAgo(now, env.retention.inactiveMonths);
  const hardCutoff = new Date(now.getTime() - env.retention.hardDeleteAfterDays * DAY);

  const step = async (label, fn) => { try { await fn(); } catch (e) { report.errors += 1; logger.error(`data-retention «${label}» failed: ${e.message}`, { stack: e.stack }); } };

  await step("inactive-businesses", async () => {
    const rows = await prisma.business.findMany({ where: { deletedAt: null, lastActiveAt: { lt: inactiveCutoff } }, select: { id: true } });
    for (const r of rows) if (await softDeleteBusiness(r.id, "inactive")) report.inactiveBusinesses += 1;
  });
  await step("inactive-users", async () => {
    const rows = await prisma.endUser.findMany({ where: { deletedAt: null, lastActiveAt: { lt: inactiveCutoff } }, select: { id: true } });
    for (const r of rows) if (await softDeleteUser(r.id, "inactive")) report.inactiveUsers += 1;
  });
  await step("hard-delete-businesses", async () => {
    const rows = await prisma.business.findMany({ where: { deletedAt: { lt: hardCutoff } }, select: { id: true } });
    for (const r of rows) { await hardDeleteBusiness(r.id); report.hardDeletedBusinesses += 1; }
  });
  await step("hard-delete-users", async () => {
    const rows = await prisma.endUser.findMany({ where: { deletedAt: { lt: hardCutoff } }, select: { id: true } });
    for (const r of rows) { await hardDeleteUser(r.id); report.hardDeletedUsers += 1; }
  });
  await step("housekeeping", async () => {
    report.otpCodes = (await prisma.otpCode.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - DAY) } } })).count;
    report.sessions = (await prisma.session.deleteMany({ where: { OR: [{ revokedAt: { lt: hardCutoff } }, { expiresAt: { lt: hardCutoff } }] } })).count;
    const orphans = await prisma.ticketAttachment.findMany({ where: { messageId: null, createdAt: { lt: new Date(now.getTime() - DAY) } }, select: { id: true, storedName: true } });
    if (orphans.length) { attachments.deleteFiles(orphans.map((o) => o.storedName)); await prisma.ticketAttachment.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } }); }
    report.loginAttempts = (await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 90 * DAY) } } })).count;
  });

  const total = Object.entries(report).filter(([k]) => k !== "errors").reduce((s, [, v]) => s + v, 0);
  logger.cleanup(`پاک‌سازی داده‌های حساس: ${JSON.stringify(report)}`);
  await prisma.cleanupReport.create({ data: { kind: "data_retention", total, details: report } }).catch(() => {});
  return report;
}

module.exports = { softDeleteBusiness, softDeleteUser, hardDeleteBusiness, hardDeleteUser, runRetention };
