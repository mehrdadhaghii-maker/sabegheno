// Create the admin account, or reset its password (also clears the lock and closes all its sessions).
//   npm run auth:set-admin                      → uses ADMIN_DEFAULT_USERNAME / ADMIN_DEFAULT_PASSWORD from .env
//   npm run auth:set-admin -- admin 'Ma@321560' → explicit
require("dotenv").config();
const bcrypt = require("bcryptjs");
const prisma = require("../src/db/prisma");
const { checkPasswordPolicy, policyMessage } = require("../src/utils/password");

(async () => {
  const username = process.argv[2] || process.env.ADMIN_DEFAULT_USERNAME || "admin";
  const password = process.argv[3] || process.env.ADMIN_DEFAULT_PASSWORD;
  if (!password) { console.error("❌ رمز داده نشده؛ ADMIN_DEFAULT_PASSWORD را در .env بگذارید یا به‌صورت آرگومان بدهید"); process.exitCode = 1; return; }
  const pol = checkPasswordPolicy(password);
  if (!pol.ok) { console.error("❌ " + policyMessage(pol.problems)); process.exitCode = 1; return; }

  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.adminUser.findUnique({ where: { username } });
  if (existing) {
    await prisma.adminUser.update({ where: { id: existing.id }, data: { passwordHash, passwordChangedAt: new Date(), failedLogins: 0, lockedUntil: null } });
    await prisma.session.updateMany({ where: { subjectRole: "admin", subjectId: existing.id, revokedAt: null }, data: { revokedAt: new Date(), revokedReason: "password_change" } });
    console.log(`✅ رمز ادمین «${username}» تغییر کرد (قفل برداشته و نشست‌های قبلی بسته شد)`);
  } else {
    await prisma.adminUser.create({ data: { username, passwordHash, passwordChangedAt: new Date() } });
    console.log(`✅ ادمین «${username}» ساخته شد`);
  }
})().catch((e) => { console.error("❌", e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
