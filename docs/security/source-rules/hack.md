قوانین امنیت و تست نفوذ (Hack) — Node.js + Express + Prisma

1. آسیب‌پذیری‌های رایج که باید بررسی و رفع شوند:

   الف) SQL Injection:
   - Prisma به صورت پیش‌فرض از این جلوگیری می‌کند (Parameterized Queries)
   - بررسی: هیچ query خام (raw query) بدون پارامتر استفاده نشود

   ب) XSS (Cross-Site Scripting):
   - فرانت‌اند React به صورت خودکار خروجی را escape می‌کند
   - بررسی: هیچ dangerouslySetInnerHTML بدون sanitize استفاده نشود

   ج) CSRF (Cross-Site Request Forgery):
   - استفاده از توکن CSRF برای همه درخواست‌های تغییردهنده (POST, PUT, DELETE)
   - بررسی: کوکی‌ها با SameSite=Lax یا Strict تنظیم شوند

   د) Authentication Bypass:
   - همه routeهای حساس باید middleware احراز هویت داشته باشند
   - بررسی: هیچ route بدون محافظت نمانده باشد

   ه) Rate Limiting (محدودیت درخواست):
   - استفاده از express-rate-limit برای جلوگیری از Brute Force
   - محدودیت: ۱۰۰ درخواست در ۱۵ دقیقه برای هر IP

   و) Security Headers:
   - استفاده از helmet برای تنظیم هدرهای امنیتی
   - بررسی: CORS فقط برای دامنه‌های مجاز

2. ابزارهای تست نفوذ:
   - OWASP ZAP یا Burp Suite برای تست خودکار
   - npm audit برای بررسی آسیب‌پذیری وابستگی‌ها
   - بررسی: هیچ dependency با vulnerability شناخته‌شده در پروژه نباشد

3. گزارش نهایی:
   - بعد از هر بررسی، لیست آسیب‌پذیری‌های پیدا شده + راه‌حل رفع + وضعیت (رفع شده/در حال بررسی)
