# سیستم لاگ و مانیتورینگ

## چه چیزهایی ساخته شد
- **لاگر Winston** (`backend/src/utils/logger.js`): کنسول رنگی + فایل JSON چرخشی (۵MB × ۵ فایل، فقط در development) + ذخیره در دیتابیس. در production فقط stdout (JSON). سطح از `LOG_LEVEL`. ایموجی‌ها: ❌ ⚠️ ✅ ➡️/⬅️ 🔐 🧹. شمارهٔ کارت‌های بانکی قبل از ثبت ماسک می‌شوند.
- **Middleware:** `requestLogger` (مسیر، متد، وضعیت، مدت، IP؛ بدون query string) و `errorHandler` (ذخیره در DB، هشدار تلگرام برای ۵۰۰، پاسخ بدون جزئیات داخلی). `isAdmin` برای محافظت.
- **مدل‌ها:** `ErrorLog`، `RequestLog` (+ایندکس).
- **API (فقط ادمین):** `/api/monitor/` ← `stats`، `errors`، `errors/:id`، `errors/:id/resolve` (PATCH)، `chart-data`، `requests/recent`، `top-routes`.
- **تلگرام:** `TELEGRAM_BOT_TOKEN` و `TELEGRAM_CHAT_ID`؛ بدون آنها بی‌صدا رد می‌شود.
- **Cron:** هر شب ۰۳:۰۰ تهران لاگ‌های قدیمی‌تر از `LOG_RETENTION_DAYS` (۳۰) پاک می‌شود.
- **پنل ادمین → «مانیتورینگ»:** کارت‌های آمار، نمودار ۲۴ ساعته، خطاهای اخیر با فیلتر و جزئیات (stack/meta) و دکمهٔ «حل شد»، درخواست‌های اخیر، پرخطاترین مسیرها؛ رفرش خودکار ۵ ثانیه‌ای (با توقف در تب غیرفعال)، رفرش دستی، «آخرین به‌روزرسانی» به وقت تهران.

## اتصال تلگرام
۱) در تلگرام با `@BotFather` یک ربات بسازید و توکن را بگیرید. ۲) به ربات پیام بدهید، سپس `https://api.telegram.org/bot<TOKEN>/getUpdates` را باز کنید و `chat.id` را بردارید. ۳) در `.env.production`: `TELEGRAM_BOT_TOKEN`، `TELEGRAM_CHAT_ID`، و `ADMIN_PANEL_URL=https://admin.sabegheno.ir` (برای لینک داخل پیام). ۴) سرویس api را ری‌استارت کنید.

## تفاوت با پرامپت اصلی (آگاهانه)
- بک‌اند پروژه **CommonJS** است (نه ES Modules) — تبدیل کل بک‌اند ریسک بی‌دلیل بود.
- نمودار با **Recharts** (که از قبل در پنل بود) ساخته شد نه Chart.js؛ مسیر با **هش‌روتر** موجود (`#/monitor`) نه react-router؛ متغیر فرانت `VITE_API_BASE_URL` (پروژه Vite است نه CRA).
- درخواست‌های `/monitor`، `/health` و `/uploads` در `RequestLog` ثبت **نمی‌شوند** (پولینگ هر ۵ ثانیه جدول را پر می‌کرد). ثبت درخواست‌ها دسته‌ای (هر ۲ ثانیه یک INSERT) است.
- «نرخ موفقیت» = درصد درخواست‌های ۲۴ ساعت اخیر که ۵xx نبوده‌اند.
- docker-compose جداگانه نساختم؛ همان `docker-compose.production.yml` موجود تکمیل شد (healthcheck، env).

## عیب‌یابی
- **صفحهٔ مانیتورینگ خالی/خطا:** مطمئن شوید `npx prisma db push` اجرا شده (جدول‌های `error_logs` و `request_logs`).
- **تلگرام پیام نمی‌فرستد:** لاگ api را ببینید (`[telegram]`)؛ از داخل سرور دسترسی به `api.telegram.org` باید باز باشد (در برخی شبکه‌ها فیلتر است).
- **خروج ناگهانی از پنل:** نشست ۳۰ دقیقه بی‌فعالیتی دارد؛ پولینگ مانیتورینگ عمداً فعالیت حساب نمی‌شود.
- **۴۲۹ (Rate limit):** مسیرهای `/monitor` معاف‌اند؛ بقیهٔ API سقف `RATE_LIMIT_API_MAX` دارد.
