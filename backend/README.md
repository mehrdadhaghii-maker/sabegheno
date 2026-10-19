# سابقه‌نو — Backend API

بک‌اند واقعی (Node.js + Express + PostgreSQL/Prisma) که پشت پروتوتایپ React قرار می‌گیره.

## اجرای سریع (لوکال، با Docker)

```bash
cp .env.example .env
docker compose up -d db          # فقط دیتابیس رو بالا می‌آره
npm install
npm run prisma:migrate           # ساخت جداول
npm run prisma:seed              # داده اولیه Providerها
npm run dev                      # اجرای API روی http://localhost:4000
```

## اجرا بدون Docker (اگر خودتون Postgres دارید)

`DATABASE_URL` رو تو `.env` به دیتابیس خودتون اشاره بدید، بعد:

```bash
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

## وضعیت اتصال API ها

| چی | وضعیت | فایل |
|---|---|---|
| **OTP / ورود** | ✅ مستقل — کد رو خودمون می‌سازیم، api.ir فقط SMS رو می‌فرسته | `src/services/otp.service.js` |
| **Shahkar** (تطبیق موبایل با کد ملی) | ✅ متصل — تو ورود «کاربر» چک می‌شه | `src/services/shahkar.service.js` |
| **PersonInfo** (ثبت‌احوال) | ✅ متصل — اختیاری، فقط اگه تاریخ تولد داده بشه | `src/services/personInfo.service.js` |
| **PostalCodeInfo** (آدرس از کدپستی) | ✅ متصل — یک Endpoint عمومی `POST /utils/postal-code` | `src/services/postalCode.service.js` |
| API تسهیلات (ActiveLoans) | ✅ متصل — فقط مبالغ تجمیعی، بدون لیست تک‌تک وام | `src/services/loansProvider.service.js` |
| API چک صیادی (UnpaidChequePro) | ✅ متصل | `src/services/checksProvider.service.js` |
| کیف پول / وام آنتایم۲۴ (Payment API) | ⏳ منتظر مستندات Endpoint | `src/services/wallet.service.js` |

### درباره‌ی اتصال OTP آنتایم۲۴

- آدرس پایه: `https://api.ontime24.ir`
- فلو: `POST /Auth/SendCode { phoneNumber }` بعد `POST /Auth/Login { phoneNumber, code }` → توکن JWT خودِ آنتایم۲۴
- روی سرور Stage کد واقعی پیامک نمی‌شه؛ کد ثابت **12345** همیشه جواب می‌ده
- توکن آنتایم۲۴ فقط برای تأیید مالکیت شماره موبایل استفاده می‌شه؛ بعدش سابقه‌نو توکن خودش رو صادر می‌کنه. اگه بعداً به کیف پول/وام وصل بشیم، احتمالاً لازمه توکن آنتایم۲۴ رو هم نگه داریم — این بخش رو وقتی مستندات Payment API اومد کامل می‌کنیم

### بررسی بقیه‌ی میکروسرویس‌های آنتایم۲۴ (طبق سند شما)

اولویت‌بندی از نگاه ارزش برای سابقه‌نو:

1. **Payment API (کیف پول، وام، قلک) — بیشترین ارزش.** این دقیقاً همون منبع «رفتار اعتباری» ایه که تو پروتوتایپ فرانت‌اند از قبل به اسم Provider «آنتایم۲۴» Mock کرده بودیم؛ رفتار پس‌انداز، وام‌های فعال و مانده کیف پول سیگنال اعتباری خیلی خوبیه. **ولی سند شما فقط اسمش رو آورده، Endpoint و Schema نداره** — لطفاً مستندات همین سرویس (یا لینک Swagger مخصوص «Payment.API - 1.0») رو بفرستید.
2. **Score API (امتیازات و گردونه شانس)** — به‌نظر بیشتر یه فیچر Gamification/وفاداری‌ئه تا سیگنال اعتباری مستقیم؛ اگه مستنداتش رو بفرستید بررسی می‌کنم ولی اولویتش پایین‌تر از Payment ئه.
3. **Bill API (قبض، شارژ، بسته اینترنت، خلافی)** — نظم در پرداخت قبض/شارژ می‌تونه یه سیگنال ضعیف اما مفید باشه؛ اولویت متوسط.
4. **IdentityProvider، File، Ticket، Contacts، GiftCard، Notification، Chat** — برای تصمیم اعتباری کاربردی ندارن، فعلاً نادیده می‌گیریم.



## Endpoint های اصلی

- `POST /auth/otp/request` `{ mobile, role }`
- `POST /auth/otp/verify` `{ mobile, code, role, businessName?, nationalId? }` → `{ token }`
- `POST /credit-checks` (نیاز به توکن کسب‌وکار) `{ nationalId, requestedAmount, termMonths }`
- `GET /credit-checks` تاریخچه استعلام‌های همون کسب‌وکار
- `GET /credit-checks/me/report` (نیاز به توکن کاربر) گزارش شخصی
- `POST /providers/report` `{ nationalId, eventType, amount, delayDays?, note? }`
- `GET /providers` و `GET /providers/:id` برای پنل ادمین
- `GET /policy` و `PUT /policy` سیاست اعتباردهی

### پنل مدیریت سابقه‌نو (Admin — نقش جدا از کسب‌وکار/کاربر)

- `POST /admin/login` `{ username, password }` → `{ token }` — با اطلاعات پیش‌فرض `npm run prisma:seed` ساخته می‌شه (رجوع به `ADMIN_DEFAULT_USERNAME`/`ADMIN_DEFAULT_PASSWORD` تو `.env`)
- `GET /admin/overview` KPI های داشبورد (تعداد کسب‌وکارهای در انتظار تأیید، تأییدشده، استعلام‌های امروز، تفکیک تصمیم‌ها)
- `GET /admin/businesses?status=pending_docs` لیست کسب‌وکارها (فیلتر اختیاری با status)
- `PATCH /admin/businesses/:id` `{ status?, contractSigned? }` — تأیید/تعلیق کسب‌وکار
- `GET /admin/credit-checks?decision=review&businessId=...` تمام استعلام‌های کل سیستم (فیلتر اختیاری)

**مهم:** بعد از اولین اجرای Seed، حتماً پسورد ادمین پیش‌فرض رو عوض کنید (فعلاً Endpoint تغییر پسورد نداریم — مستقیم تو دیتابیس یا با یه اسکریپت کوچیک انجام بدید).

همه‌ی Endpoint های نیازمند احراز هویت، توکن JWT رو با هدر `Authorization: Bearer <token>` می‌خوان.

## نکات امنیتی مهم

- کد ملی هرگز خام ذخیره نمی‌شه — همیشه با `hashNationalId()` هش می‌شه (`src/utils/crypto.js`). `NATIONAL_ID_SALT` رو تو `.env` عوض کنید.
- `JWT_SECRET` رو حتماً به یه مقدار طولانی و تصادفی تغییر بدید قبل از Production.
- کلیدهای API واقعی رو فقط تو `.env` روی سرور خودتون بذارید، هیچ‌وقت تو Git کامیت نکنید (`.gitignore` از قبل `.env` رو نادیده می‌گیره).

## Deploy روی سرور خودتون

```bash
docker compose up -d --build
docker compose exec api npm run prisma:deploy
docker compose exec api npm run prisma:seed
```

برای production واقعی، یه Reverse Proxy (nginx یا Caddy) جلوی پورت 4000 بذارید و SSL رو اونجا مدیریت کنید.

## چیزی که هنوز باقی مونده

- منطق امتیازدهی (`src/services/scoring.service.js`) فعلاً یک مدل ساده placeholder هست — باید با مدل واقعی کسب‌وکار جایگزین بشه.
- فرانت‌اند React (که قبلاً ساختیم) هنوز به این API وصل نشده — باید Mock Data داخلش با فراخوانی‌های `fetch` به این Endpoint ها جایگزین بشه.


## Local test notes (fixed version)

Inside Docker, set `DATABASE_URL` host to `db`, not `localhost`. Admin-only policy and provider monitoring belong to the separate admin app. The business client only uses business-scoped credit-check and provider-report endpoints.
