// Production pre-flight: refuses to let you go live with weak / missing / placeholder settings.
//   node scripts/preflight.js --file ../.env.production      (from the host, before `docker compose up`)
//   npm run preflight                                         (reads the current process env)
// Exit code 1 = at least one blocking problem. Secrets are never printed.
const fs = require("fs");
const crypto = require("crypto");

const argFile = process.argv.indexOf("--file");
let env = { ...process.env };
if (argFile > -1) {
  env = {};
  for (const line of fs.readFileSync(process.argv[argFile + 1], "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const fails = [], warns = [], oks = [];
const get = (k) => (env[k] || "").trim();
const PLACEHOLDER = /(change.?me|changeme|example|your[_-]|xxx|password|secret|123456|test|demo|default)/i;
const need = (k, min, why) => {
  const v = get(k);
  if (!v) fails.push(`${k} خالی است — ${why}`);
  else if (v.length < min) fails.push(`${k} خیلی کوتاه است (حداقل ${min} نویسه) — ${why}`);
  else if (PLACEHOLDER.test(v)) fails.push(`${k} شبیه مقدار نمونه/ضعیف است؛ یک مقدار تصادفی بسازید.`);
  else oks.push(k);
};

need("POSTGRES_PASSWORD", 16, "رمز دیتابیس");
need("JWT_SECRET", 32, "امضای نشست‌ها");
need("NATIONAL_ID_SALT", 16, "هش کد ملی — بعد از ثبت داده هرگز تغییرش ندهید");
need("ENCRYPTION_KEY", 32, "رمزنگاری کد ملی و کلیدهای سرویس‌ها — بعد از ثبت داده هرگز تغییرش ندهید");

const pw = get("ADMIN_DEFAULT_PASSWORD");
if (pw && !(pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw))) fails.push("ADMIN_DEFAULT_PASSWORD سیاست رمز (۸+ نویسه، حرف بزرگ/کوچک، عدد، نماد) را رعایت نمی‌کند؛ یا خالی بگذارید تا یک رمز تصادفی در لاگ چاپ شود.");
else if (!pw) warns.push("ADMIN_DEFAULT_PASSWORD خالی است؛ رمز تصادفی فقط یک‌بار در لاگ api چاپ می‌شود — همان لحظه ذخیره‌اش کنید.");

if (new Set([get("JWT_SECRET"), get("NATIONAL_ID_SALT"), get("ENCRYPTION_KEY"), get("POSTGRES_PASSWORD")].filter(Boolean)).size < 4) fails.push("JWT_SECRET / NATIONAL_ID_SALT / ENCRYPTION_KEY / POSTGRES_PASSWORD باید چهار مقدار متفاوت باشند.");

if (!get("API_IR_KEY")) fails.push("API_IR_KEY خالی است — بدون آن شاهکار/استعلام وام و چک کار نمی‌کند.");
if (get("NODE_ENV") && get("NODE_ENV") !== "production") fails.push(`NODE_ENV باید production باشد (الان: ${get("NODE_ENV")}).`);
if (get("ALLOW_DEMO_SEED")) fails.push("ALLOW_DEMO_SEED نباید در محیط عملیاتی تنظیم باشد (داده‌ٔ دمو می‌سازد).");
if (get("DISABLE_CRON")) fails.push("DISABLE_CRON نباید در محیط عملیاتی تنظیم باشد (نگهداری داده، وب‌هوک و پایش خاموش می‌شود).");
if (get("ALLOW_PRIVATE_SERVICE_URLS")) fails.push("ALLOW_PRIVATE_SERVICE_URLS نباید در محیط عملیاتی فعال باشد (خطر SSRF).");

for (const k of ["FRONTEND_URL", "ADMIN_PANEL_URL"]) {
  const v = get(k);
  if (!v) warns.push(`${k} تنظیم نشده است.`);
  else if (!/^https:\/\/[a-z0-9.-]+\.sabegheno\.ir\/?$/i.test(v)) fails.push(`${k} باید https و روی دامنهٔ sabegheno.ir باشد (الان: ${v}).`);
}
if (get("TRUST_PROXY") && get("TRUST_PROXY") !== "2") warns.push(`TRUST_PROXY=${get("TRUST_PROXY")}؛ با nginx میزبان + nginx کانتینر مقدار درست ۲ است.`);
if (get("CORS_ORIGINS") === "*") fails.push("CORS_ORIGINS=* مجاز نیست.");
if (!get("TELEGRAM_BOT_TOKEN") || !get("TELEGRAM_CHAT_ID")) warns.push("تلگرام تنظیم نشده؛ هشدار خطا و قطع سرویس‌ها فقط در لاگ می‌ماند.");
if (!get("ZARINPAL_MERCHANT_ID")) warns.push("ZARINPAL_MERCHANT_ID خالی است؛ فروش گزارش شخص حقیقی غیرفعال است.");

if (get("NATIONAL_ID_SALT") && get("ENCRYPTION_KEY")) {
  const fp = crypto.createHash("sha256").update(get("NATIONAL_ID_SALT") + "|" + get("ENCRYPTION_KEY")).digest("hex").slice(0, 10);
  console.log(`اثرانگشت کلیدهای کد ملی: ${fp}   (این را یادداشت کنید؛ اگر بعداً تغییر کرد یعنی کلیدها عوض شده و داده‌های قبلی قابل‌خواندن نیستند)\n`);
}
oks.length && console.log(`✔ سالم: ${oks.join(", ")}`);
warns.forEach((w) => console.log(`⚠ ${w}`));
fails.forEach((f) => console.log(`✖ ${f}`));
console.log(fails.length ? `\n❌ ${fails.length} مشکل مسدودکننده — اجرای عملیاتی مجاز نیست.` : "\n✅ آمادهٔ اجرای عملیاتی (هشدارها را بخوانید).");
process.exit(fails.length ? 1 : 0);
