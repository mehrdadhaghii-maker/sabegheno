// Emergency tool: clears the 48 h lock of an admin account (auth.md lockout).
//   npm run auth:unlock -- <username> [--reset-2fa]     (--reset-2fa also turns 2FA off for lost phones)
//   npm run auth:unlock -- --list                        (show locked accounts)
const prisma = require("../src/db/prisma");

(async () => {
  const [arg, ...flags] = process.argv.slice(2);
  if (arg === "--list") {
    const rows = await prisma.adminUser.findMany({ where: { lockedUntil: { gt: new Date() } }, select: { username: true, lockedUntil: true } });
    console.log(rows.length ? rows : "هیچ حساب قفل‌شده‌ای وجود ندارد");
  } else if (!arg) {
    console.log("استفاده: npm run auth:unlock -- <username> [--reset-2fa]");
  } else {
    const data = { failedLogins: 0, lockedUntil: null };
    if (flags.includes("--reset-2fa")) Object.assign(data, { twoFactorEnabled: false, twoFactorSecretEnc: null, twoFactorLastStep: null });
    const r = await prisma.adminUser.updateMany({ where: { username: arg }, data });
    console.log(r.count ? `✅ حساب «${arg}» باز شد${flags.includes("--reset-2fa") ? " و 2FA غیرفعال شد" : ""}` : "❌ کاربری با این نام پیدا نشد");
  }
})().finally(() => prisma.$disconnect());
