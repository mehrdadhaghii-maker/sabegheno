# گزارش بررسی فرانت‌اند سابقه‌نو

## خلاصه اجرایی

فرانت‌اند یک SPA مبتنی بر React 18 و Vite است. نصب وابستگی‌ها و build production با موفقیت انجام شد و خطای syntax یا build وجود ندارد. رابط کاربری از نظر ساختار اولیه، RTL، کامپوننت‌های قابل‌استفاده مجدد و تفکیک منطقی screenها قابل‌قبول است.

با این حال، در اتصال واقعی به بک‌اند چند ناسازگاری مهم وجود دارد. مهم‌ترین مورد این است که فرانت‌اند صفحات «سیاست اعتباردهی» و «پنل مدیریت/Providerها» را در اپ کسب‌وکار نمایش می‌دهد، در حالی که بک‌اند policy را فقط برای نقش admin مجاز می‌کند و endpointهای provider نیز از نظر طراحی قرار است مدیریتی باشند. همچنین گزارش شخصی کاربر به endpointی متصل است که در بک‌اند هم route ordering دارد و هم در نبود کد ملی خام، سرویس‌های خارجی را با مقدار null صدا می‌زند.

## وضعیت build و اجرا

| بررسی | نتیجه |
|---|---|
| `npm install` | موفق |
| `npm run build` | موفق |
| Vite | نسخه 5.4.x نصب‌شده از محدوده package |
| خروجی JS فشرده | حدود 601 KB، بالاتر از هشدار پیش‌فرض 500 KB |
| تست خودکار UI/API | وجود ندارد |
| مسیر API | از `VITE_API_BASE_URL` استفاده می‌کند |
| احراز هویت | JWT در `localStorage` ذخیره می‌شود |

هشدار build دربارهٔ بزرگ بودن chunk اصلی fatal نیست، اما برای موبایل و Android wrapper باید code-splitting انجام شود.

## یافته‌های مهم

### ۱. صفحهٔ Policy با مجوز بک‌اند سازگار نیست — شدت بحرانی

**فرانت‌اند:** `src/App.jsx`، `PolicyScreen` و منوی نقش کسب‌وکار

فرانت‌اند این APIها را صدا می‌زند:

```js
api.getPolicy();
api.updatePolicy(...);
```

اما در بک‌اند، `GET /policy` و `PUT /policy` با این middleware محافظت شده‌اند:

```js
requireAuth, requireRole("admin")
```

در عین حال، فرانت‌اند هیچ login یا token با role=`admin` ندارد و پس از ورود فقط نقش business یا user را پشتیبانی می‌کند. بنابراین صفحهٔ Policy برای کاربر کسب‌وکار با 403 مواجه می‌شود.

علاوه بر این، خود UI در متن صفحه می‌گوید policy «فعلاً فقط ذخیره می‌شود»؛ این با انتظار کاربر از عنوان «قوانین تأیید خودکار» هم‌خوان نیست و طبق بررسی بک‌اند هنوز scoring آن را اعمال نمی‌کند.

**راهکار:** یکی از این دو تصمیم باید گرفته شود:

- Policy را از این اپ حذف و به پنل admin مستقل منتقل کنید؛ یا
- احراز هویت admin و routeهای admin را در یک اپ/ماژول جدا پیاده کنید.

انتقال صرفاً role در localStorage راه‌حل امنیتی نیست؛ مجوز باید در JWT صادرشده و بک‌اند enforce شود.

### ۲. رابط Providerها با مرزبندی نقش‌ها ناسازگار است — شدت بالا

فرانت‌اند برای business صفحهٔ `BusinessProvidersScreen` را نشان می‌دهد و `GET /providers` و `GET /providers/:id` را صدا می‌زند. بک‌اند فعلاً این دو مسیر را فقط با `requireAuth` محافظت کرده است؛ بنابراین از یک طرف هر user دارای token هم می‌تواند Providerها و eventهای آن‌ها را بخواند، و از طرف دیگر مرزبندی مورد انتظار محصول مشخص نیست.

در کد فرانت‌اند نیز کامنت‌ها متناقض‌اند: صفحه «Read-only provider monitoring for a logged-in BUSINESS» نام‌گذاری شده، اما endpointها در README بیشتر برای پنل ادمین معرفی شده‌اند.

**راهکار:** قرارداد را مشخص کنید:

- اگر monitoring عمومی برای business است، بک‌اند فقط فیلدهای غیرحساس و Providerهای مجاز را برگرداند.
- اگر admin-only است، صفحه را به پروژهٔ admin منتقل کنید و backend را با `requireRole("admin")` محدود کنید.
- هرگز eventهای خام Providerها را برای نقش user نمایش ندهید.

### ۳. صفحهٔ گزارش شخصی کاربر به endpoint معیوب بک‌اند متصل است — شدت بحرانی

در `src/api.js`:

```js
getMyReport: () => request("/credit-checks/me/report")
```

اما در بک‌اند route دینامیک `/:id` قبل از `/me/report` آمده و درخواست را می‌گیرد. در نتیجه صفحهٔ `MyReportScreen` در عمل به احتمال زیاد 403/404 دریافت می‌کند.

حتی پس از اصلاح ترتیب route، بک‌اند در مسیر گزارش شخصی مقدار `nationalId: null` را به scoring می‌دهد. فرانت‌اند فقط hash را داخل token دریافت می‌کند و کد ملی خام را نگه نمی‌دارد؛ بنابراین سرویس‌های ActiveLoans و UnpaidCheque نمی‌توانند گزارش واقعی بیرونی بسازند.

**راهکار:** route بک‌اند را اصلاح کنید و قرارداد احراز هویت/بازیابی داده را بازطراحی کنید. پاسخ باید وضعیت ناقص‌بودن منابع را شفاف نشان دهد و دادهٔ unavailable را با صفر اشتباه نکند.

### ۴. مدل پاسخ خطای فرانت‌اند با خطاهای validation و production کامل نیست — شدت متوسط

`api.js` فقط `data.error` را به کاربر نشان می‌دهد و `detail` را جداگانه روی error قرار می‌دهد، اما UI هیچ‌جا `detail` را نمایش نمی‌دهد. در نتیجه خطاهای Zod یا خطاهای قابل‌اقدام ممکن است برای کاربر فقط پیام عمومی باشند.

از طرف دیگر، بک‌اند در محیط غیرproduction `err.message` را برمی‌گرداند؛ نباید frontend به وجود detail برای منطق کسب‌وکار وابسته شود.

**راهکار:** قرارداد خطای versioned با `code`, `message`, `fieldErrors`, `requestId` تعریف کنید و mapping پیام‌های validation را در client داشته باشید.

### ۵. session در localStorage از نظر امنیتی و lifecycle محدودیت دارد — شدت بالا

توکن JWT در `localStorage` با کلید `sabegheno_auth` ذخیره می‌شود. هر XSS موفق می‌تواند token را بخواند. همچنین فرانت‌اند در صورت 401، token را پاک نمی‌کند و کاربر به‌صورت خودکار به login برنمی‌گردد؛ صفحات فقط خطای API را نشان می‌دهند.

`getAuth()` نیز JSON ذخیره‌شده را بدون schema validation می‌خواند. مقادیر خراب یا token منقضی‌شده تا زمان خطا در state می‌مانند.

**راهکار:** برای web، ترجیحاً session امن با HttpOnly/Secure/SameSite cookie و CSRF protection استفاده کنید. اگر Bearer token الزاماً در client است، expiry را parse کنید، روی 401 logout/redirect انجام دهید، schema را validate کنید و refresh/revocation strategy داشته باشید.

### ۶. ورودی‌های مالی و محدودیت‌های محصول در frontend کامل نیستند — شدت بالا

در `NewCheckScreen` فقط مثبت‌بودن مبلغ و مدت بررسی می‌شود. سقف/کف مبلغ، حداکثر مدت، واحد تومان/ریال، و حد مجاز ۲۰ میلیون یا policy واقعی در frontend enforce نشده است. بک‌اند نیز در schema سقف مشخصی ندارد.

همچنین `DecisionSimulator` بازهٔ ثابت ۵۰ تا ۱۵۰ میلیون دارد، در حالی که کمپین «اعتبار من» و داده‌های پروژه از سقف ۲۰ میلیون صحبت می‌کنند. این UI ممکن است کاربر را با بازهٔ محصول واقعی دچار تناقض کند.

**راهکار:** واحد پول و limits را از یک contract مشترک بگیرید، validation را در هر دو سمت انجام دهید و simulator را از `recommendedLimit`/policy واقعی تغذیه کنید؛ frontend فقط لایهٔ UX است و نباید مرجع امنیتی باشد.

### ۷. دادهٔ ناقص با fallbackهای ساختگی یا گمراه‌کننده به UI می‌رسد — شدت بالا

در `computeIndicators`، اگر اطلاعات پرداخت موجود نباشد مقدار پیش‌فرض ۷۰ قرار می‌گیرد و اگر دادهٔ تسهیلات unavailable باشد، مقدارهای derived ممکن است به وضعیت ظاهراً معتبر تبدیل شوند. همین‌طور `buildCustomerView` با مقادیر fallback صفر، متن‌هایی مانند «بدون چک برگشتی فعال» یا «بدون تسهیلات معوق» تولید می‌کند؛ در حالی که صفر ممکن است به معنی «داده موجود نیست» نباشد.

این مورد برای محصول اعتبارسنجی ریسک جدی دارد، چون missing data را مثبت نشان می‌دهد.

**راهکار:** برای هر شاخص سه وضعیت داشته باشید: `known`, `unknown/unavailable`, `error`. در UI به‌جای جملهٔ مثبت، «اطلاعات در دسترس نیست» نمایش دهید و score/decision را از backend معتبر دریافت کنید.

### ۸. مسیر adminUpdateProvider در API client وجود ندارد — شدت متوسط

در `App.jsx`، داخل `ProviderDetail` این فراخوانی وجود دارد:

```js
api.adminUpdateProvider(provider.id, ...)
```

اما در `src/api.js` تابعی با این نام وجود ندارد. در وضعیت فعلی `ProviderDetail` از صفحهٔ business بدون `businesses` رندر می‌شود و دکمهٔ لینک‌کردن ظاهر نمی‌شود، اما اگر این branch فعال شود، با `TypeError` مواجه خواهد شد.

**راهکار:** اگر لینک‌کردن فقط admin است، این component و API را به پنل admin منتقل کنید. در غیر این صورت endpoint، تابع client، schema و permission را کامل و تست کنید.

### ۹. دریافت دوبارهٔ جزئیات تاریخچه منابع را از دست می‌دهد — شدت متوسط

در `openCheck` وقتی رکورد از history باز می‌شود، `GET /credit-checks/:id` فقط خود `CreditCheck` را برمی‌گرداند و `sources` ندارد؛ frontend نیز `buildCustomerView(record, null, extra)` را اجرا می‌کند. بنابراین جزئیات loans/checks/exposure در صفحهٔ جزئیات با fallback نمایش داده می‌شود، در حالی که بعد از استعلام جدید همان اطلاعات وجود دارد.

**راهکار:** endpoint detail پاسخ پایدار و کامل برگرداند، یا endpoint جدا برای source breakdown تعریف شود. UI نباید بین «استعلام تازه» و «همان استعلام از تاریخچه» دو تجربهٔ متفاوت داشته باشد.

### ۱۰. نبود route واقعی مرورگر و deep-link handling — شدت متوسط

اپ با state داخلی `screen` کار می‌کند و از URL route استفاده نمی‌کند. refresh، bookmark، back/forward مرورگر و deep-link به Credit Map پشتیبانی نمی‌شوند. برای نسخهٔ وب production این باعث از دست رفتن screen و state می‌شود.

**راهکار:** از React Router یا routing سبک مبتنی بر URL استفاده کنید و routeهای محافظت‌شده را با role guard بسازید.

## نکات UI/UX و دسترس‌پذیری

- برخی buttonها و table rowها رفتار کلیکی دارند اما semantic مناسب یا keyboard handler ندارند؛ ردیف‌های جدول با `onClick` باید keyboard-accessible باشند.
- برای dialog/Sheet، focus trap، `role="dialog"`، `aria-modal` و بستن با Escape دیده نمی‌شود.
- ورودی OTP و فیلدهای موبایل/national ID بهتر است `inputMode`, `autoComplete`, `maxLength` و `type` مناسب داشته باشند.
- فونت از Google Fonts در runtime بارگذاری می‌شود؛ برای production فارسی و محیط‌های محدود، self-host یا fallback test شود.
- متن «متصل به API واقعی» حتی زمانی که API base URL پیش‌فرض localhost است، ممکن است در محیط demo گمراه‌کننده باشد.

## عملکرد و نگهداشت

- chunk اصلی حدود 601 KB است؛ Recharts و همهٔ screenها در bundle اصلی آمده‌اند. با route-level lazy loading و `manualChunks` حجم اولیه کم شود.
- Recharts نسخهٔ نصب‌شده در lock resolution هشدار deprecated branch 2.x دارد؛ migration به Recharts 3 یا بررسی جایگزین انجام شود.
- تمام اپ در یک فایل بزرگ `App.jsx` قرار دارد. جداسازی `components`, `screens`, `auth`, `credit-map` و `providers` نگهداشت و تست را ساده‌تر می‌کند.
- تست واحد/کامپوننت و تست contract با backend وجود ندارد.

## نقشهٔ اصلاح پیشنهادی

### مرحلهٔ اول — پیش از اتصال staging

1. تعیین مرزبندی دقیق business/admin و حذف Policy/Admin از اپ اشتباه.
2. اصلاح `/credit-checks/me/report` در بک‌اند و تکمیل قرارداد گزارش شخصی.
3. اصلاح missing-data handling در `computeIndicators` و `buildCustomerView`.
4. افزودن logout خودکار روی 401 و اعتبارسنجی session ذخیره‌شده.
5. تعریف limits مالی مشترک برای frontend/backend.
6. حذف یا تکمیل `adminUpdateProvider`.

### مرحلهٔ دوم — پیش از عرضه عمومی

1. افزودن React Router و route guards.
2. افزودن contract tests برای تمام APIهای `src/api.js`.
3. افزودن تست‌های UI برای login، OTP، business dashboard و my report.
4. پیاده‌سازی دسترس‌پذیری dialog/table/form.
5. code-splitting و کاهش حجم bundle.
6. تعریف design token و کامپوننت‌های مستقل برای جلوگیری از رشد `App.jsx`.

## نتیجه نهایی

فرانت‌اند از نظر build و ظاهر اولیه قابل استفادهٔ prototype است، اما هنوز به‌عنوان client قابل اعتماد برای workflow اعتباری production آماده نیست. اولویت اصلی، هم‌راستا کردن نقش‌ها و endpointها با بک‌اند، جلوگیری از نمایش دادهٔ ناقص به‌عنوان وضعیت مثبت، و طراحی درست lifecycle احراز هویت است. پس از اصلاح این قراردادها، اتصال staging و تست end-to-end با PostgreSQL و سرویس‌های واقعی انجام شود.

## دامنه بررسی

این گزارش بر اساس `sabegheno-frontend۱(1).zip` و تطبیق با بک‌اند بررسی‌شده در همین نشست تهیه شده است. build production با `npm run build` موفق بود و هیچ فایل source پروژه در این مرحله تغییر نکرد.
