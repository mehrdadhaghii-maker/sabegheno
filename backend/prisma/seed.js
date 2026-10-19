const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const { checkPasswordPolicy, generateStrongPassword } = require("../src/utils/password");
const prisma = new PrismaClient();

// Seeds the same demo Providers shown in the frontend's admin panel, so the
// backend has something meaningful to query on day one — plus a default
// platform-admin account so the admin panel is usable immediately.
async function main() {
  const providers = [
    { name: "API تسهیلات", integrationType: "realtime", dataQuality: 98, latencyMs: 180, errorRate: 0.2 },
    { name: "API چک‌های برگشتی", integrationType: "realtime", dataQuality: 99, latencyMs: 150, errorRate: 0.1 },
    { name: "اعتبارسنجی ایران", integrationType: "batch", dataQuality: 96, latencyMs: 420, errorRate: 0.6 },
    { name: "آنتایم۲۴", integrationType: "realtime", dataQuality: 91, latencyMs: 260, errorRate: 1.1 },
  ];

  for (const p of providers) {
    const exists = await prisma.provider.findFirst({ where: { name: p.name } });
    if (!exists) await prisma.provider.create({ data: p });
  }

  // Keep existing approved accounts usable after the isVerified field is introduced.
  await prisma.business.updateMany({ where: { status: "approved" }, data: { isVerified: true } });

  const adminUsername = process.env.ADMIN_DEFAULT_USERNAME || "admin";
  let adminPassword = process.env.ADMIN_DEFAULT_PASSWORD;
  const existingAdmin = await prisma.adminUser.findUnique({ where: { username: adminUsername } });
  if (!existingAdmin) {
    // security.md: the first admin password must satisfy the same policy as every other password.
    let generated = false;
    if (!adminPassword || !checkPasswordPolicy(adminPassword).ok) {
      if (adminPassword) console.warn("ADMIN_DEFAULT_PASSWORD با سیاست رمز عبور (۸+ کاراکتر، حرف بزرگ/کوچک، عدد، نماد) سازگار نیست؛ یک رمز تصادفی ساخته می‌شود");
      adminPassword = generateStrongPassword(); generated = true;
    }
    await prisma.adminUser.create({
      data: { username: adminUsername, passwordHash: await bcrypt.hash(adminPassword, 12), passwordChangedAt: new Date() },
    });
    console.log(`Admin account created — username: "${adminUsername}"${generated ? `, password: "${adminPassword}" (فقط همین یک بار نمایش داده می‌شود؛ بعد از ورود تغییرش دهید)` : " (رمز از ADMIN_DEFAULT_PASSWORD)"}`);
  }

  console.log("Seed complete.");
}

main().finally(() => prisma.$disconnect());
