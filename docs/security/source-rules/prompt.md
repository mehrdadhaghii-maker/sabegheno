تو یک مهندس ارشد Backend و DevOps هستی. یک سیستم لاگین و مانیتورینگ کامل برای پروژه‌ای بساز که بک‌اند آن Node.js/Express با Prisma و PostgreSQL است و فرانت‌اند آن React (با Vite یا CRA) است. این سیستم باید به‌عنوان یک سکشن جدید داخل پنل ادمین React نمایش داده شود.

## پیش‌فرض
پنل ادمین React موجود است و احراز هویت دارد (JWT یا session). سیستم جدید باید از همان احراز هویت استفاده کند و فقط برای کاربران با نقش admin قابل دسترسی باشد.

## معماری
۱. بک‌اند: لاگ‌گیری (Winston) + ذخیره در دیتابیس + API مانیتورینگ
۲. فرانت‌اند: سکشن React جدید در پنل ادمین با داشبورد مانیتورینگ
۳. اعلان تلگرام برای خطاهای 500

## بخش اول: بک‌اند (Node.js/Express)

### ۱. لاگر (src/utils/logger.js)
- winston با ۳ transport: Console (رنگی)، File (JSON با چرخش ۵MB و ۵ فایل)، و transport سفارشی برای دیتابیس
- سطح لاگ از env (LOG_LEVEL)، پیش‌فرض info
- متد logErrorToDB: ذخیره خطا با message، stack (حداکثر 5000 کاراکتر)، route، method، userId، statusCode، meta (Json)
- ایموجی‌ها: ❌ خطا، ⚠️ هشدار، ✅ موفقیت، ➡️/⬅️ درخواست، 🔐 امنیت، 🧹 پاک‌سازی

### ۲. Middleware ها
- requestLogger: هر درخواست را با method، originalUrl، statusCode، duration، ip، userAgent لاگ کند (5xx=error، 4xx=warn، بقیه=info)
- errorHandler: خطاها را در دیتابیس ذخیره کند، برای 500 به تلگرام بفرستد، پاسخ مناسب برگرداند (جزئیات داخلی لو نرود)
- isAdmin: بررسی کند کاربر لاگین‌شده نقش admin دارد (از req.user). بدون admin → 403

### ۳. مدل‌های Prisma
- ErrorLog: id, message, stack?, route?, method?, userId?, statusCode?, meta (Json?), createdAt, resolved (default false), resolvedAt?
- RequestLog: id, method, route, statusCode, duration, ip?, userId?, createdAt
- ایندکس روی createdAt و statusCode برای هر دو، ایندکس روی resolved برای ErrorLog

### ۴. API مانیتورینگ (src/routes/monitor.js) - همه با isAdmin
- GET /api/monitor/stats → { total, unresolved, lastHour, successRate, avgResponseTime, requestsToday }
- GET /api/monitor/errors?limit=50&resolved=false&statusCode=500 → فیلتر + صفحه‌بندی
- GET /api/monitor/errors/:id → جزئیات کامل (شامل meta و stack)
- PATCH /api/monitor/errors/:id/resolve → علامت‌گذاری حل‌شده
- GET /api/monitor/chart-data?hours=24 → خطاها گروه‌بندی‌شده بر اساس ساعت
- GET /api/monitor/requests/recent?limit=20 → آخرین درخواست‌ها
- GET /api/monitor/top-routes → پرتکرارترین route های خطادار

### ۵. اعلان تلگرام (src/services/telegram.js)
- Bot API با توکن و chatId از env (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
- sendErrorAlert: 🚨 + پیام خطا + route + method + statusCode + timestamp (به وقت تهران) + لینک به پنل ادمین
- اگر توکن تنظیم نشده بود، بدون خطا رد شود
- Rate limit: حداکثر ۱ پیام در ۵ ثانیه

### ۶. Cron Job (src/cron/cleanup.js)
- node-cron، هر روز ساعت ۳ صبح (به وقت تهران)
- پاک‌سازی لاگ‌های قدیمی‌تر از LOG_RETENTION_DAYS (پیش‌فرض ۳۰ روز)
- تعداد حذف‌شده را لاگ کند

## بخش دوم: فرانت‌اند (React)

### ۷. سرویس API (src/services/monitorApi.js)
- توابع fetch با axios یا fetch: getStats, getErrors, getErrorById, resolveError, getChartData, getRecentRequests, getTopRoutes
- همه با هدر Authorization (توکن JWT از context/auth ذخیره‌شده)

### ۸. کامپوننت‌های React
- MonitorDashboard.jsx: صفحه اصلی که همه بخش‌ها را ترکیب می‌کند
  - کارت‌های آمار: کل خطاها، حل‌نشده، ساعت اخیر، نرخ موفقیت، میانگین زمان پاسخ
  - نمودار خطی ۲۴ ساعت با Chart.js (react-chartjs-2)
  - جدول خطاهای اخیر: زمان، statusCode، route، method، پیام، دکمه "حل شد"
  - جدول درخواست‌های اخیر: زمان، method، route، statusCode، duration
  - لیست پرتکرارترین route های خطادار
- ErrorTable.jsx: جدول خطاها با فیلتر statusCode و resolved + صفحه‌بندی
- StatsCards.jsx: کارت‌های آمار
- ErrorChart.jsx: نمودار خطی ۲۴ ساعت
- RequestTable.jsx: جدول درخواست‌های اخیر
- TopRoutes.jsx: لیست route های پرخطا
- هر کامپوننت با هوک‌های useState، useEffect و useCallback
- رفرش خودکار هر ۵ ثانیه با setInterval (با cleanup در useEffect)
- دکمه "رفرش دستی" و نمایش "آخرین به‌روزرسانی"
- تاریخ‌ها به وقت تهران و فرمت فارسی (Intl.DateTimeFormat با fa-IR)
- استایل با CSS Modules یا Tailwind (هماهنگ با پنل موجود)
- حالت loading و error برای هر بخش
- طراحی واکنش‌گرا (responsive)

### ۹. روتینگ
- مسیر /admin/monitor به MonitorDashboard اضافه شود
- از react-router-dom استفاده کن
- مسیر باید با نقش admin محافظت شود (ProtectedRoute موجود یا جدید)

## بخش سوم: آماده‌سازی برای کلاد

### ۱۰. env و داکر
- .env.example با: DATABASE_URL, LOG_LEVEL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, LOG_RETENTION_DAYS, PORT, REACT_APP_API_URL
- docker-compose.yml: app (بک‌اند) + client (فرانت با nginx) + postgres (با volume)
- Dockerfile چندمرحله‌ای برای بک‌اند (node:20-alpine) و فرانت (build با node + serve با nginx)
- در production لاگ فقط به stdout (نه فایل) — از NODE_ENV تشخیص بده
- healthcheck برای هر کانتینر

### ۱۱. مستندات
- README.md: نصب، راه‌اندازی، env ها، نحوه دسترسی به سکشن مانیتورینگ در پنل ادمین، اتصال تلگرام، عیب‌یابی

## نکات نهایی
- کد کامل، قابل اجرا و بدون placeholder
- بک‌اند با ES Modules (import/export)
- فرانت با React 18+ و هوک‌ها
- خطاهای دیتابیس در ذخیره لاگ نباید برنامه را متوقف کنند (try/catch)
- کامنت‌های کوتاه فارسی برای بخش‌های مهم
- همه پکیج‌ها در package.json مشخص شوند
- سکشن مانیتورینگ باید با طراحی و زبان پنل ادمین موجود هماهنگ باشد
