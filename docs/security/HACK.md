# مستند ۲ — HACK (تست نفوذ و امنیت)

## هدف
یافتن و بستن رایج‌ترین راه‌های نفوذ (OWASP Top 10) و تعریف روش تکرارپذیر برای تست دوره‌ای.

## قوانین دقیق و نتیجهٔ بررسی
| آسیب‌پذیری | قانون | نتیجهٔ بررسی من (روی کد) | وضعیت |
|---|---|---|---|
| **SQL Injection** | فقط Prisma پارامتری؛ بدون query خام | جست‌وجوی `$queryRaw` / `$executeRaw` / `Unsafe` در کل بک‌اند: **هیچ موردی نیست** | ✅ رفع/تأیید شد |
| **XSS** | بدون `dangerouslySetInnerHTML` غیرمجاز | در هر دو پنل **هیچ** `dangerouslySetInnerHTML` / `innerHTML` نیست. گزارش PDF با `esc()` همهٔ مقادیر را escape می‌کند. CSP در nginx: `script-src 'self'` | ✅ |
| **CSRF** | توکن CSRF یا کوکی SameSite | احراز هویت با هدر `Authorization: Bearer` است نه کوکی؛ مرورگر آن را خودکار نمی‌فرستد، پس CSRF کلاسیک ممکن نیست. دفاع تکمیلی: درخواست تغییردهندهٔ دارای بدنه باید `application/json` باشد (۴۱۵ در غیر این صورت) | ⚠️ انحراف آگاهانه (توکن CSRF لازم نیست؛ اگر روزی به کوکی رفتید، باید اضافه شود) |
| **Authentication Bypass** | همهٔ route حساس پشت `requireAuth` | ۶۸ route بررسی شد؛ تنها عمومی‌ها: `POST /admin/login`، `POST /auth/otp/request`، `POST /auth/otp/verify`، `POST /auth/refresh` و `/health`. **یک نقص پیدا و رفع شد:** `/utils/postal-code` و `/utils/tax-records` (سرویس‌های پولی) برای نقش «کاربر عادی» هم باز بود؛ حالا فقط business/admin | ✅ رفع شد |
| **Rate Limiting** | ۱۰۰ درخواست / ۱۵ دقیقه / IP | روی `/auth/*` و `/admin/login` دقیقاً ۱۰۰/۱۵دقیقه؛ روی OTP و ورود ادمین ۱۰/۱۰دقیقه؛ بقیهٔ API سقف بالاتر (۱۲۰۰) چون داشبوردها پولینگ دارند. **IP واقعی:** `trust proxy` تنظیم شد (قبلاً پشت nginx همهٔ کاربران یک IP حساب می‌شدند) | ✅ |
| **Security Headers** | helmet + CORS محدود | helmet (CSP، HSTS، nosniff، no-referrer)، هدرهای nginx هر دو پنل، HSTS در nginx اصلی. CORS فقط از `CORS_ORIGINS` (قبلاً `cors()` برای همه باز بود) | ✅ |
| **وابستگی‌ها** | `npm audit` بدون آسیب‌پذیری | **اجرا نشد** — محیط من اینترنت ندارد | ⏳ با شماست |
| **تست نفوذ خودکار** | OWASP ZAP / Burp | **اجرا نشد** | ⏳ با شماست |

## روش پیاده‌سازی
- `src/app.js` — helmet، CORS، محدودکننده‌ها، محافظ Content-Type.
- `scripts/audit-routes.js` — لیست همهٔ routeها و محافظ هرکدام؛ اگر route عمومیِ غیرمجاز باشد با کد ۱ خارج می‌شود: `npm run audit:routes`.
- `frontend/nginx.conf` و `admin/nginx.conf` — CSP و هدرهای امنیتی. build بدون source map.

## روش اجرای تست‌هایی که با شماست
```bash
# ۱) آسیب‌پذیری وابستگی‌ها (در هر سه پوشه)
cd backend  && npm install && npm audit --omit=dev
cd ../admin && npm install && npm audit --omit=dev
cd ../frontend && npm install && npm audit --omit=dev
npm audit fix            # فقط رفع‌های بدون breaking change

# ۲) ممیزی route ها (بک‌اند نصب‌شده)
cd backend && npm run audit:routes

# ۳) OWASP ZAP (روی محیط staging، نه production)
docker run --rm -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://staging.example.ir
#   برای API: zap-api-scan.py یا Burp Suite با پراکسی 127.0.0.1:8080
```
**تست دستی پیشنهادی:** ورود با ۶ رمز غلط (باید ۴۲۳ شود)، استفاده از توکن کسب‌وکار روی `/admin/*` (باید ۴۰۳ شود)، استفاده از توکن قدیمی بعد از ورود جدید (باید ۴۰۱ با `SESSION_REPLACED` شود)، ارسال `' OR 1=1 --` در فیلدهای متنی.

## گزارش‌گیری
هر بررسی در «چک‌لیست» (`CHECKLIST.md`) با ستون وضعیت: *رفع شد / در حال بررسی / با شماست* ثبت شده است. رخدادهای رد دسترسی (۴۰۳) و فعال‌شدن Rate Limit با 🔐 در لاگ و مانیتورینگ می‌آیند.
