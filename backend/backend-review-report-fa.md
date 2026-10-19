# گزارش بررسی بک‌اند سابقه‌نو

## خلاصه اجرایی

پروژه یک بک‌اند Node.js/Express با PostgreSQL و Prisma است و از نظر ساختار اولیه، تفکیک route، middleware، service و adapter قابل‌قبول دارد. وابستگی‌ها نصب شدند، Prisma Client تولید شد و بررسی syntax تمام فایل‌های JavaScript بدون خطا انجام شد. همچنین `npm audit --omit=dev` هیچ آسیب‌پذیری شناخته‌شده‌ای در وابستگی‌های production گزارش نکرد.

با این حال، پروژه در وضعیت فعلی برای production آماده نیست. یک خطای قطعی در routing، چند مشکل جدی در کنترل دسترسی و lifecycle توکن، و چند ناسازگاری بین مدل داده و منطق امتیازدهی وجود دارد که باید پیش از اتصال فرانت‌اند یا استفاده با داده واقعی اصلاح شوند.

## وضعیت فعلی

| بخش | وضعیت |
|---|---|
| ساختار Node/Express | مناسب برای شروع |
| Prisma schema | قابل اجرا، اما نیازمند migration و تست یکپارچه |
| بررسی syntax | موفق |
| نصب dependencies | موفق |
| تولید Prisma Client | موفق |
| بررسی وابستگی‌های production | بدون مورد گزارش‌شده در `npm audit` |
| تست خودکار | وجود ندارد |
| اتصال فرانت‌اند | طبق README هنوز انجام نشده |
| آمادگی production | فعلاً خیر |

## یافته‌های بحرانی و مهم

### ۱. خطای قطعی در مسیر گزارش شخصی کاربر — شدت بحرانی

**محل:** `src/routes/creditCheck.routes.js`

مسیر زیر بعد از مسیر `/:id` تعریف شده است:

```js
router.get("/:id", ...)
router.get("/me/report", ...)
```

در Express، درخواست `GET /credit-checks/me/report` ابتدا با `/:id` تطبیق می‌کند و مقدار `id` برابر `me` می‌شود؛ بنابراین مسیر مخصوص گزارش کاربر هرگز به شکل مورد انتظار اجرا نمی‌شود. برای کاربر معمولاً پاسخ 403 و برای کسب‌وکار پاسخ 404 برمی‌گردد.

**اصلاح پیشنهادی:** مسیر ثابت را قبل از dynamic route قرار دهید:

```js
router.get("/me/report", requireAuth, requireRole("user"), asyncHandler(...));
router.get("/:id", requireAuth, requireRole("business"), asyncHandler(...));
```

برای جلوگیری از تکرار، بهتر است routeها با integration test پوشش داده شوند.

### ۲. سیاست اعتباردهی ذخیره می‌شود اما در تصمیم امتیازدهی استفاده نمی‌شود — شدت بحرانی

**محل‌ها:** `src/routes/policy.routes.js` و `src/services/scoring.service.js`

در پنل ادمین، مقادیر `minScore`، `maxActiveBounced` و `maxDelayDays` قابل ثبت و ویرایش هستند؛ اما `scoring.service.js` همچنان thresholdها و جریمه‌ها را به صورت hard-code استفاده می‌کند:

- آستانه approve برابر 750 است.
- آستانه review برابر 550 است.
- `maxActiveBounced` و `maxDelayDays` اصلاً در تصمیم استفاده نمی‌شوند.

در نتیجه ادمین تصور می‌کند سیاست را تغییر داده، ولی تصمیم واقعی تغییری نمی‌کند.

**اصلاح پیشنهادی:** سیاست global را در `runCreditCheck` بخوانید یا آن را به یک لایهٔ policy/scoring تزریق کنید. برای کاهش latency می‌توان policy را cache کرد و هنگام PUT آن را invalidate کرد. همچنین تست‌هایی بنویسید که تغییر هر فیلد policy واقعاً خروجی decision را تغییر دهد.

### ۳. توکن JWT وضعیت کسب‌وکار را داخل خود نگه می‌دارد و با دیتابیس همگام نیست — شدت بحرانی

**محل‌ها:** `src/routes/auth.routes.js` و `src/middleware/auth.js`

`businessStatus` هنگام login داخل JWT ثبت می‌شود و `requireApprovedBusiness` فقط همان مقدار را بررسی می‌کند. دو پیامد جدی دارد:

1. اگر ادمین کسب‌وکار را بعداً approve کند، توکن قبلی همچنان pending می‌ماند و تا login مجدد قابل استفاده نیست.
2. اگر ادمین کسب‌وکار را suspend کند، توکن قبلی تا پایان عمر 7 روزه همچنان approved تلقی می‌شود و دسترسی ادامه پیدا می‌کند.

**اصلاح پیشنهادی:** در مسیرهای حساس، وضعیت فعلی Business را از دیتابیس بخوانید و فقط در صورت approved اجازه دهید. یا از token version/session revocation استفاده کنید. برای suspend فوری، راهکار دیتابیسی یا blacklist/version اجباری است.

### ۴. endpointهای Provider فقط احراز هویت دارند و نقش admin را الزام نمی‌کنند — شدت بالا

**محل:** `src/routes/providers.routes.js`

این مسیرها با `requireAuth` محافظت شده‌اند، نه `requireRole("admin")`:

- `GET /providers`
- `GET /providers/:id`

بنابراین هر کاربر business یا user دارای توکن می‌تواند فهرست Providerها، وضعیت اتصال و بخشی از eventهای آن‌ها را ببیند. این داده‌ها می‌توانند اطلاعات داخلی و حساس سیستم باشند.

**اصلاح پیشنهادی:** برای endpointهای مدیریتی از middleware زیر استفاده کنید:

```js
router.use(requireAuth, requireRole("admin"));
```

و endpointهای گزارش‌دهی کسب‌وکار را در router جداگانه نگه دارید تا اشتباه دسترسی کمتر شود.

### ۵. endpointهای گزارش‌دهی امکان ثبت event با دادهٔ حساس بدون کنترل‌های کافی دارند — شدت بالا

**محل:** `src/routes/providers.routes.js`

کسب‌وکار تأییدشده می‌تواند برای هر کد ملی event ثبت کند. در کد فعلی موارد زیر دیده نمی‌شود:

- audit log شامل actor، IP و زمان دقیق تغییرات
- idempotency برای جلوگیری از ثبت تکراری
- محدودیت نرخ یا سقف حجم/مبلغ
- محدودیت طول `note`
- اعتبارسنجی عددی کد ملی، نه صرفاً طول 10 کاراکتر
- سازوکار اصلاح/ابطال گزارش اشتباه

**اصلاح پیشنهادی:** schema را محدودتر کنید، audit trail مستقل بسازید، برای report endpoint rate limit و idempotency key اضافه کنید و فرآیند dispute/correction طراحی کنید.

### ۶. در مسیر استعلام، `providerId` همیشه null است — شدت بالا

**محل:** `src/routes/creditCheck.routes.js`

`runCreditCheck` با `providerId: null` فراخوانی می‌شود. در نتیجه `checkConcurrentExposure` هیچ Providerای را exclude نمی‌کند، در حالی که کامنت سرویس می‌گوید باید activity سایر Providerها بررسی شود. این موضوع می‌تواند باعث شمردن eventهای Provider درخواست‌کننده یا محاسبهٔ نادرست anti-stacking شود.

**اصلاح پیشنهادی:** قبل از اجرای scoring، Provider متصل به `req.auth.id` را پیدا کنید و `provider.id` را ارسال کنید. اگر کسب‌وکار Provider نیست، رفتار دقیق و مورد تأیید محصول را مشخص کنید.

### ۷. مسیر گزارش کاربر کد ملی ندارد و ممکن است سرویس‌های بیرونی را با مقدار null صدا بزند — شدت بالا

**محل‌ها:** `src/routes/creditCheck.routes.js` و `src/services/scoring.service.js`

در `/me/report` مقدار `nationalId: null` به `runCreditCheck` داده می‌شود. سپس adapterهای ActiveLoans و UnpaidCheque ممکن است با `nationalCode: null` فراخوانی شوند. خطاها catch می‌شوند و دادهٔ صفر/منبع error برمی‌گردد؛ بنابراین کاربر ممکن است گزارش ظاهراً معتبر ولی ناقص دریافت کند.

**اصلاح پیشنهادی:** یا national ID را با طراحی امن و کنترل دسترسی در سمت سرور نگهداری/بازیابی کنید، یا این endpoint را فقط از داده‌های داخلی hashed پشتیبانی دهید و سرویس‌های بیرونی را در نبود national ID اجرا نکنید. پاسخ باید صریحاً `data completeness` و unavailable بودن منابع را اعلام کند و نباید نبود داده را با صفر معادل کند.

## مشکلات امنیتی و عملیاتی

### رازهای پیش‌فرض و credentialهای seed

در `src/config/env.js` مقدار پیش‌فرض `JWT_SECRET` برابر `dev-secret-change-me` است. در seed نیز در صورت نبود env، حساب admin با `admin / change-me-123` ساخته می‌شود و رمز عبور در log چاپ می‌شود. این موارد برای production خطرناک‌اند.

**اقدام:** در production startup را در صورت وجود secret پیش‌فرض fail کنید؛ seed production را جدا کنید؛ رمز admin را در log چاپ نکنید؛ و تغییر رمز/rotation را به عنوان قابلیت رسمی اضافه کنید.

### CORS کاملاً باز

`app.use(cors())` همهٔ originها را مجاز می‌کند. برای API دارای اطلاعات اعتباری، این تنظیم باید محدود به originهای واقعی فرانت‌اند باشد و در صورت استفاده از cookie، تنظیمات credentials و CSRF نیز دقیق طراحی شود.

### OTP فاقد کنترل کافی در سطح شماره و تلاش تأیید

rate limit فعلی روی مسیر `/auth/otp` عمدتاً IP-based است و برای هر OTP محدودیت تعداد تلاش ناموفق، قفل موقت شماره، cleanup رکوردهای مصرف‌شده/منقضی و جلوگیری از درخواست‌های تکراری دیده نمی‌شود. در نبود API key، کد OTP در log چاپ می‌شود که فقط باید در محیط local و با guard صریح مجاز باشد.

### افشای جزئیات خطا در محیط غیرproduction

`errorHandler` در هر محیط غیرproduction مقدار `err.message` را به client می‌دهد. این برای توسعه مفید است، ولی باید مطمئن شوید محیط staging یا اینترنت عمومی با `NODE_ENV=development` بالا نمی‌آید.

### نبود timeout برای fetchهای سرویس‌های بیرونی

در `apiIrClient.js` و `ontime24Client.js` برای fetch، timeout یا AbortController وجود ندارد. یک سرویس کند می‌تواند requestهای API را معطل کند و ظرفیت workerها را مصرف کند.

**اقدام:** timeout مشخص، retry محدود با backoff فقط برای خطاهای مناسب، circuit breaker و ثبت latency/source اضافه شود.

### Docker Compose

در `.env.example` مقدار `DATABASE_URL` از `localhost` استفاده می‌کند. داخل container API، `localhost` خود container API است، نه سرویس `db`. برای اجرای compose باید host دیتابیس `db` باشد، مانند:

```env
DATABASE_URL="postgresql://sabegheno:sabegheno@db:5432/sabegheno?schema=public"
```

همچنین `depends_on` فعلی فقط ترتیب start را تضمین می‌کند و آماده‌بودن PostgreSQL را تضمین نمی‌کند؛ healthcheck و retry migration لازم است. باز کردن پورت 5432 به host نیز برای production نباید پیش‌فرض باشد.

## مشکلات مدل داده و منطق محصول

1. در enum `EventType` مقدار `inquiry` وجود دارد، اما endpoint گزارش‌دهی آن را از ورودی قبول نمی‌کند؛ در نتیجه event استعلامی که anti-stacking به آن نیاز دارد از مسیر عمومی تولید نمی‌شود.
2. در scoring، `confidence` فقط بر اساس unavailable بودن دو منبع کم می‌شود و برای source=`error` یا ناکافی بودن داده رفتار یکسان و شفاف ندارد.
3. `recommendedLimit` از `requestedAmount * score / 900` محاسبه می‌شود و سقف واقعی 20 میلیون یا policy limit در آن دیده نمی‌شود.
4. `termMonths` ورودی ذخیره می‌شود اما در تصمیم و `recommendedTermMonths` تقریباً استفاده نمی‌شود.
5. queryهای ProviderEvent برای stacking روی `nationalIdHash` و زمان هستند، اما ترکیب index مناسب برای الگوی کامل query می‌تواند بهتر شود؛ پس از اندازه‌گیری، index ترکیبی `(nationalIdHash, eventType, createdAt)` بررسی شود.
6. اطلاعات `note` و eventها ممکن است دادهٔ شخصی یا حساس باشند؛ retention، masking و سطح دسترسی باید مشخص شود.

## کیفیت کد و نگهداشت

- تست unit و integration وجود ندارد؛ به‌خصوص auth، route ordering، policy، stacking و role access باید تست شوند.
- `asyncHandler` عمومی وجود ندارد و الگوی try/catch در همه routeها تکرار شده است.
- Swagger/OpenAPI و قرارداد versioned برای API دیده نمی‌شود.
- migration در zip بررسی‌شده وجود ندارد؛ README از `prisma migrate dev --name init` صحبت می‌کند، اما برای deploy باید migration commit‌شده و `prisma migrate deploy` وجود داشته باشد.
- لاگ‌گیری ساختاریافته، correlation ID و metrics برای سرویس‌های بیرونی وجود ندارد.
- endpoint health فقط زنده‌بودن process را می‌سنجد و اتصال دیتابیس/وابستگی‌ها را بررسی نمی‌کند.

## اولویت اصلاح پیشنهادی

### قبل از هر اتصال production یا داده واقعی

1. اصلاح ترتیب `/me/report` قبل از `/:id`.
2. اصلاح کنترل دسترسی Providerها و تفکیک admin/business routes.
3. حذف وضعیت کسب‌وکار از اعتماد صرف به JWT و بررسی وضعیت جاری/قابل revoke کردن توکن.
4. fail-fast برای `JWT_SECRET`، `NATIONAL_ID_SALT` و credentialهای پیش‌فرض.
5. حذف چاپ OTP و password از log.
6. اصلاح `DATABASE_URL` در Docker و افزودن healthcheck.
7. تعیین تکلیف استفاده از policy در scoring.
8. تکمیل providerId و رفتار anti-stacking.

### پیش از عرضه عمومی

1. اضافه‌کردن تست‌های integration برای تمام نقش‌ها و مسیرهای حساس.
2. اضافه‌کردن timeout/circuit breaker برای api.ir و آنتایم.
3. محدودکردن CORS و اضافه‌کردن rate limit per mobile برای OTP و report.
4. طراحی audit log، retention و فرآیند اصلاح گزارش اعتباری.
5. تعریف قرارداد OpenAPI و versioning.
6. اضافه‌کردن monitoring، metrics و health/readiness endpoints.
7. تکمیل مدل scoring با نسخه‌بندی مدل و ثبت دلیل تصمیم.

## نتیجه نهایی

این پروژه برای یک prototype فنی پایهٔ مناسبی دارد و از نظر syntax و نصب وابستگی‌ها سالم اجرا می‌شود، اما هنوز یک MVP امن و قابل اتکا برای داده‌های اعتباری نیست. مهم‌ترین کار فوری، اصلاح route و authorization، همگام‌سازی وضعیت کسب‌وکار با دیتابیس، و واقعی‌کردن اتصال policy به scoring است. پس از این اصلاحات، باید با PostgreSQL واقعی یک مجموعه تست integration اجرا شود و تنها بعد از موفقیت آن، اتصال فرانت‌اند و سرویس‌های بیرونی در staging انجام شود.

## دامنه بررسی

این بررسی بر اساس فایل فشردهٔ `sabegheno-backend۱(1).zip` انجام شد. اجرای سرویس end-to-end با PostgreSQL و credentialهای واقعی انجام نشد؛ بنابراین صحت قرارداد APIهای خارجی و migrationهای تولیدی نیازمند تست staging با مستندات و کلیدهای واقعی است.

Generated checks: `npm install`, `npm run prisma:generate`, `node --check` برای فایل‌های JavaScript، و `npm audit --omit=dev`.

کنترل ویژه: هیچ فایل source پروژه در این مرحله تغییر داده نشد.

