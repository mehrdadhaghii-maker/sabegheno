# راهنمای استقرار نسخهٔ پنجم

فایل Docker و Compose ارسالی شما برای یک برنامهٔ یکپارچهٔ SSR نوشته شده بود؛ یعنی انتظار داشت در ریشهٔ پروژه فایل `server.ts` و پوشهٔ `dist` وجود داشته باشد و همه‌چیز روی پورت ۳۰۰۰ سرو شود. پروژهٔ سابقه‌نو در نسخهٔ فعلی سه بخش جدا دارد: API بک‌اند، فرانت‌اند کسب‌وکار و پنل ادمین. به همین دلیل آن Dockerfile را بدون تغییر نمی‌توانستیم روی این پروژه اجرا کنیم.

نسخهٔ جدید فایل `docker-compose.production.yml` دارد. در این compose، PostgreSQL و Redis طبق تنظیمات شما اجرا می‌شوند، API داخل کانتینر با پورت داخلی ۳۰۰۰ اجرا می‌شود، فرانت‌اند روی پورت میزبان ۳۰۰۰ و پنل ادمین روی پورت میزبان ۳۰۰۱ منتشر می‌شود. API علاوه بر routeهای محلی، همهٔ routeها را زیر `/api` نیز ارائه می‌کند و `/api/health` پاسخ استاندارد `status: ok` می‌دهد.

## اجرا روی سرور

```bash
cp .env.production.example .env.production
# مقادیر POSTGRES_PASSWORD، JWT_SECRET، NATIONAL_ID_SALT و API_IR_KEY را تنظیم کنید.
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

تست health:

```bash
curl http://127.0.0.1:3000/api/health
```

خروجی موفق باید چیزی شبیه این باشد:

```json
{"status":"ok","timestamp":"...","env":"production"}
```

## Nginx

برای دامنهٔ اصلی از `nginx.sabegheno.conf` استفاده شده است. دامنهٔ اصلی به فرانت‌اند روی ۳۰۰۰ و `admin.sabegheno.ir` به پنل ادمین روی ۳۰۰۱ وصل می‌شود؛ چون این دو برنامه SPA مستقل هستند و قرار دادن آن‌ها پشت یک مسیر بدون تنظیم base path باعث تداخل assetها می‌شود.

## نکتهٔ مهم

رمزهایی که در پیام شما درج شده‌اند را برای محیط واقعی دوباره تولید کنید. مخصوصاً `POSTGRES_PASSWORD`، `JWT_SECRET` و `SESSION_SECRET` را عمومی یا در Git قرار ندهید. Redis فعلاً در معماری آماده است اما منطق اصلی فعلی برای OTP و صف‌ها از PostgreSQL و APIهای سرویس استفاده می‌کند.
