# نسخهٔ مدرن و روشن سابقه‌نو

این release شامل سه بخش است:

- `backend`: API و منطق اعتبارسنجی
- `frontend`: پنل کسب‌وکار و گزارش کاربر
- `admin`: پنل مستقل مدیر سیستم با UI روشن و مدرن

## اجرای بک‌اند

```bash
cd backend
cp .env.example .env
# API_IR_KEY را در .env قرار دهید.
# در محیط واقعی JWT_SECRET و NATIONAL_ID_SALT را نیز تغییر دهید.
docker compose up -d db
npm install
npm run prisma:generate
npm run prisma:seed
npm run dev
```

در نسخهٔ جدید، `npm run dev` ابتدا schema دیتابیس را با `prisma db push` آماده می‌کند و سپس seed را اجرا می‌کند؛ بنابراین خطای داخلی ناشی از نبود جدول‌های OTP یا AdminUser نباید رخ دهد. اگر از Docker استفاده می‌کنید، سرویس API نیز همین initialization را به‌صورت خودکار انجام می‌دهد. حساب آزمایشی ادمین به‌صورت پیش‌فرض `admin` با رمز `change-me-123` است؛ این رمز را در محیط واقعی عوض کنید.

## اجرای پنل کسب‌وکار

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

پنل کسب‌وکار روی پورت 5173 اجرا می‌شود.

## اجرای پنل ادمین

```bash
cd admin
cp .env.example .env
npm install
npm run dev
```

پنل ادمین روی پورت 5174 اجرا می‌شود. ورود مدیر از مسیر واقعی `/admin/login` انجام می‌شود و داده‌های داشبورد از `/admin/overview`, `/admin/businesses`, `/admin/credit-checks`, `/providers` و `/policy` خوانده می‌شوند.

## بررسی api.ir

مسیرها و schemaهای زیر با Swagger رسمی api.ir تطبیق داده شده‌اند:

- `POST /api/sw1/ShahkarPro`
- `POST /api/sw1/SmsOTP`
- `POST /api/sw1/PersonInfo`
- `POST /api/sw1/ActiveLoans`
- `POST /api/sw1/UnpaidChequePro`

برای تست واقعی باید `API_IR_KEY` معتبر در backend تنظیم شود. بدون کلید، درخواست live انجام نمی‌شود.

## اصلاحات مهم

- UI روشن و مدرن با کارت‌های نرم، sidebar، KPI و رنگ بنفش/خاکستری مطابق نمونه.
- پنل ادمین مستقل و متصل به endpointهای واقعی.
- API client دارای timeout، تشخیص خطای شبکه و پردازش strict پاسخ `success:false` است.
- در production، نبودن یا شکست Shahkar مانع ورود کاربر می‌شود.
- اتصال شماره موبایل به کد ملی کاربر پس از ثبت اولیه قابل تغییر نیست.
- پاسخ تسهیلات به‌عنوان aggregate و چک برگشتی به‌عنوان current unpaid data نمایش داده می‌شود؛ این دو منبع گزارش کامل تاریخی نیستند.
- گزارش‌ها از دیتابیس و سرویس‌های واقعی می‌آیند؛ دادهٔ mock برای تصمیم اعتبار حذف شده است.

## اعتبارسنجی انجام‌شده

- syntax check تمام فایل‌های JavaScript بک‌اند موفق است.
- `prisma generate` موفق است.
- build فرانت‌اند موفق است.
- build پنل ادمین موفق است.
- تست live با کلید واقعی api.ir انجام نشده است.
