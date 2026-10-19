# راه‌اندازی عملیاتی سابقه‌نو روی سرور اصلی (sabegheno.ir)

## دامنه‌ها
| نشانی | سرویس | پورت داخلی (فقط localhost) |
|---|---|---|
| sabegheno.ir / www | لندینگ | 3002 |
| app.sabegheno.ir | پنل شرکت‌ها + API | 3000 |
| admin.sabegheno.ir | پنل ادمین | 3001 |

رکورد A هر چهار نام باید به IP سرور اشاره کند.

## مراحل (یک‌بار)
1. نصب: `docker` + `docker compose` + `nginx` + `certbot`.
2. پوشهٔ پروژه را روی سرور بگذارید (مثلاً `/opt/sabegheno`).
3. گواهی TLS (یک گواهی برای همه):
   `certbot certonly --nginx -d sabegheno.ir -d www.sabegheno.ir -d app.sabegheno.ir -d admin.sabegheno.ir`
4. `cp nginx.sabegheno.conf /etc/nginx/conf.d/sabegheno.conf && nginx -t && systemctl reload nginx`
5. فایل `.env.production` را کامل کنید (مهم‌ترین‌ها: `API_IR_KEY`، رمزها، تلگرام، زرین‌پال). `chmod 600 .env.production`
6. `./deploy.sh` — اول preflight اجرا می‌شود و اگر تنظیم ضعیف/خالی باشد متوقف می‌شود.
7. پشتیبان شبانه: `crontab -e` و افزودن
   `15 3 * * * cd /opt/sabegheno && ./backup.sh >> /var/log/sabegheno-backup.log 2>&1`

## قوانین حیاتی
- **`NATIONAL_ID_SALT` و `ENCRYPTION_KEY` را بعد از ثبت اولین داده هرگز تغییر ندهید.** با تغییر salt همهٔ هش‌ها و با تغییر key همهٔ کد ملی‌های رمزنگاری‌شده و کلیدهای سرویس‌ها غیرقابل‌خواندن می‌شوند. از این دو یک نسخهٔ جدا (خارج از سرور) نگه دارید. اثرانگشتشان را `scripts/preflight.js` چاپ می‌کند.
- رمز دیتابیس و رمز ادمین را قبل از شروع عوض کنید (فایل نمونه‌ای که برای توسعه رد و بدل شده امن نیست).
- پورت‌های کانتینرها فقط روی `127.0.0.1` باز است؛ دسترسی عمومی فقط از طریق nginx میزبان.
- `DISABLE_CRON`، `ALLOW_DEMO_SEED`، `ALLOW_PRIVATE_SERVICE_URLS` را در production تنظیم نکنید (preflight جلوگیری می‌کند).

## بعد از هر به‌روزرسانی
- `./deploy.sh` (قبل از ساخت، خودش پشتیبان می‌گیرد؛ ستون‌های جدید دیتابیس با `prisma db push` اضافه می‌شوند و داده‌ای حذف نمی‌شود).
- یک‌بار: `docker compose --env-file .env.production -f docker-compose.production.yml exec api npm run nid:backfill` (آزمایشی) و سپس با `-- --apply` تا کد ملی رکوردهای قدیمی که همان شرکت جای دیگری وارد کرده بود پر شود.
- رکوردهای قدیمی که هنوز «—» دارند: شرکت در همان ردیف روی «+ افزودن کد ملی» می‌زند؛ فقط اگر با هش ذخیره‌شده بخواند پذیرفته می‌شود.

## پایش
- پنل ادمین ← «وضعیت سرویس‌ها»: دیتابیس، api.ir، Ontime24، زرین‌پال، تلگرام و سرویس‌های متصل‌شده؛ هر ۵ دقیقه خودکار و با هشدار تلگرام.
- `GET https://app.sabegheno.ir/api/health/ready` برای مانیتور بیرونی (UptimeRobot و مشابه): ۲۰۰ یعنی API و دیتابیس سالم.
- لاگ: `docker compose --env-file .env.production -f docker-compose.production.yml logs -f api`

## نسخهٔ PWA (نصب روی گوشی)
پنل شرکت‌ها (app.sabegheno.ir) و پنل ادمین (admin.sabegheno.ir) هر دو PWA هستند: آیکن روی صفحهٔ اصلی، اجرای تمام‌صفحه، و صفحهٔ «آفلاین» وقتی اینترنت نیست.

- **نصب روی اندروید (Chrome):** پس از چند ثانیه نوار «نصب» پایین صفحه ظاهر می‌شود؛ یا منوی ⋮ ← «Install app / افزودن به صفحهٔ اصلی».
- **نصب روی آیفون (Safari):** دکمهٔ Share ← «Add to Home Screen».
- **به‌روزرسانی:** بعد از هر `./deploy.sh`، کاربر نوار «نسخهٔ جدید آماده است» می‌بیند و با یک کلیک به‌روز می‌شود (فرم نیمه‌پر پاک نمی‌شود).
- **امنیت:** سرویس‌ورکر هیچ‌چیز از `/api/` را ذخیره نمی‌کند؛ کد ملی و اطلاعات اعتباری هرگز روی گوشی کش نمی‌شود. فقط فایل‌های ثابت برنامه کش می‌شوند.
- شرط کار: فقط روی HTTPS (که دارید). اگر آیکن یا نام را عوض کردید، `VERSION` بالای `public/sw.js` را تغییر دهید.
- فایل‌ها: `public/manifest.webmanifest`، `public/sw.js`، `public/offline.html`، `public/icons/`، `src/pwa.js` (در `frontend` و `admin`).
