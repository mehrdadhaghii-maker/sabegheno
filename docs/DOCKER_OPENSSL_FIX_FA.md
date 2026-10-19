# اصلاح سازگاری Prisma و OpenSSL

تمام stageهای Node در Dockerfileهای backend، frontend و admin از `node:20-slim` استفاده می‌کنند. این image مبتنی بر Debian است و برای Prisma در مقایسه با Alpine سازگاری مطمئن‌تری با OpenSSL دارد.

هیچ دستور `apk` در Dockerfileهای پروژه وجود ندارد. imageهای Nginx همچنان `nginx:1.27-alpine` هستند، چون Prisma یا Node را اجرا نمی‌کنند و نیازی به تغییر آن‌ها نیست.

اعتبارسنجی انجام‌شده: `prisma generate`، بررسی syntax تمام فایل‌های backend و build فرانت‌اند و پنل ادمین موفق بوده‌اند.
