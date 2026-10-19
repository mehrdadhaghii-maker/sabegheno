# مستند API عمومی سابقه‌نو (نسخهٔ v1)

استعلام لحظه‌ای و اعلام اعتبار/تسویه مستقیم از سیستم خودتان؛ بدون ورود دستی اطلاعات.

## شروع
1. حساب کسب‌وکار باید **تأیید نهایی** شده باشد.
2. در پنل: **اتصال API ← ساخت کلید**. کلید با پیشوند `sbg_live_` فقط **یک‌بار** نمایش داده می‌شود (در دیتابیس فقط هش آن ذخیره می‌شود).
3. هر درخواست باید هدر `X-API-Key: <کلید>` و `Content-Type: application/json` داشته باشد.
4. آدرس پایه: `https://app.sabegheno.ir/api/v1`
5. سقف: **۱۲۰ درخواست در دقیقه برای هر کلید** (پاسخ ۴۲۹ با `code: RATE_LIMITED`). حداکثر ۵ کلید فعال.

خطاها: `{ "error": "پیام فارسی", "code": "…" }` — کدها: `API_KEY_MISSING`, `API_KEY_INVALID`, `BUSINESS_NOT_APPROVED`, `VALIDATION` (۴۰۰ + فهرست `fields`), `RATE_LIMITED`.

## ۱) استعلام — `POST /v1/inquiries`
```json
{ "nationalId": "0012345678", "requestedAmount": 80000000, "termMonths": 6, "customerBirthDate": "1371/5/12" }
```
`customerBirthDate` اختیاری و **شمسی** است (`سال/ماه/روز`، ارقام فارسی هم پذیرفته می‌شود). تاریخ میلادی رد می‌شود.

پاسخ (۲۰۱):
```json
{
  "id": "…", "decision": "approve | review | decline", "awaitingAdvancedReview": false,
  "score": 672, "grade": "A2", "riskLevel": "low",
  "recommendedLimit": 60000000, "recommendedTermMonths": 6, "reasons": null,
  "overlaps": [{ "brand": "فروشگاه الف", "at": "2026-10-09T08:00:00Z" }],
  "facilities": [{ "brand": "…", "amount": 0, "dueDate": "…", "remainingAmount": 0, "penaltyAmount": 0, "status": "current", "statusLabel": "جاری", "settledAt": null }],
  "totals": { "count": 1, "active": 1, "settled": 0, "overdue": 0, "openAmount": 0, "totalGranted": 0, "penalty": 0 },
  "createdAt": "…"
}
```
- `decision = review` و `awaitingAdvancedReview = true` ⇒ استعلام برای **اعتبارسنجی پیشرفته** (بررسی دستی) ارجاع شده. نتیجه را با `GET /v1/inquiries/:id` پیگیری کنید یا اعلان پنل را ببینید؛ بعد از تصمیم کارشناس `decision` به `approve`/`decline` تغییر می‌کند.
- داده‌های خام وام/چک شخص ثالث هرگز در API بیرون داده نمی‌شود.

## ۲) ثبت یا به‌روزرسانی اعتبار — `POST /v1/facilities`
اعتبار از **لحظهٔ پرداخت** ثبت می‌شود (مثل ثبت وام در سامانه‌های اعتباری بانکی) و با پرداخت **آخرین قسط** از تعهدات جاری خارج می‌شود.
```json
{ "externalRef": "INV-1024", "nationalId": "0012345678", "title": "خرید اقساطی",
  "amount": 20000000, "remainingAmount": 12000000, "penaltyAmount": 0,
  "disbursedAt": "2026-07-01T00:00:00Z", "dueDate": "2026-12-01T00:00:00Z" }
```
با `externalRef` تکراری، همان ردیف به‌روز می‌شود (idempotent). بدون آن هر بار ردیف جدید ساخته می‌شود.

**اعتبار اقساطی** — به‌جای `dueDate` یکی از دو روش:
```json
{ "externalRef": "LOAN-9", "nationalId": "0012345678", "amount": 8000000,
  "disbursedAt": "2026-07-01T00:00:00Z",
  "installmentCount": 4, "firstDueDate": "2026-08-01T00:00:00Z", "intervalMonths": 1 }
```
(اقساط مساوی؛ باقی‌ماندهٔ گرد کردن روی قسط آخر می‌نشیند؛ با `installmentAmount` مبلغ هر قسط را — مثلاً با سود — مشخص کنید) یا برنامهٔ کامل:
```json
{ "installments": [ { "dueDate": "2026-08-01T00:00:00Z", "amount": 2100000 }, { "dueDate": "2026-09-01T00:00:00Z", "amount": 2100000 } ] }
```
ارسال دوبارهٔ برنامه هرگز قسطِ پرداخت‌شده را «پرداخت‌نشده» نمی‌کند.

### پرداخت یک قسط — `POST /v1/facilities/:externalRef/installments/:seq/pay`
```json
{ "paidAt": "2026-08-03T10:00:00Z", "paidAmount": 2100000 }
```
هر دو فیلد اختیاری‌اند. با پرداخت **آخرین قسط** اعتبار همان لحظه تسویه می‌شود (`settledNow: true`). وضعیت اعتبار از قدیمی‌ترین قسط پرداخت‌نشده محاسبه می‌شود؛ پرداخت به‌موقع امتیاز را بالا و تأخیر آن را پایین می‌آورد.
گروهی: `POST /v1/facilities/bulk` با `{ "items": [ … تا ۲۰۰ مورد ] }` — هر مورد جداگانه موفق/ناموفق می‌شود.

## ۳) تسویه — `POST /v1/facilities/:externalRef/settle`
```json
{ "settledAt": "2026-10-09T10:00:00Z" }
```
**بلافاصله** اعمال می‌شود. اگر این تسویه آخرین اعتبار معوق/مشکوک‌الوصول شخص نزد شما را ببندد، ثبت بدحسابی او (که شما گزارش کرده‌اید) هم آزاد می‌شود و پاسخ `releasedDefault: true` دارد.

## ۴) فهرست — `GET /v1/facilities?nationalId=…`

## وضعیت اعتبار (محاسبه‌شده، نه ذخیره‌شده)
| وضعیت | شرط |
|---|---|
| جاری | سررسید نرسیده |
| سررسید گذشته | ۱ تا ۵۹ روز تأخیر |
| معوق | ۶۰ تا ۱۷۹ روز |
| مشکوک‌الوصول | ۱۸۰ روز و بیشتر |
| تسویه‌شده | `settledAt` دارد |

## قانون ۷۲ ساعت
وضعیت اعتبارهای ثبت‌شده با API باید **حداکثر هر ۷۲ ساعت** تأیید/به‌روز شود (هر `POST /v1/facilities` تأیید حساب می‌شود). هر شب ساعت ۰۴:۰۰ (تهران) برای اعتبارهای بی‌به‌روزرسانی بیش از ۷۲ ساعت یک اعلان به پنل شما ارسال می‌شود. **تسویه را بلافاصله اعلام کنید** تا مشتری بتواند دوباره اعتبار بگیرد.
