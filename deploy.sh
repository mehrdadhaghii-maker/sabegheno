#!/usr/bin/env bash
# Production deploy for sabegheno.ir — run on the server from the project folder:  ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
ENVF=".env.production"
COMPOSE=(docker compose --env-file "$ENVF" -f docker-compose.production.yml)

[ -f "$ENVF" ] || { echo "✖ فایل $ENVF پیدا نشد (از .env.production.example بسازید)"; exit 1; }
command -v docker >/dev/null || { echo "✖ docker نصب نیست"; exit 1; }

echo "▶ ۱) بررسی تنظیمات (preflight)"
docker run --rm -v "$PWD":/work -w /work/backend node:20-alpine node scripts/preflight.js --file ../"$ENVF"

if docker ps --format '{{.Names}}' | grep -q '^sabegheno_db$'; then
  echo "▶ ۲) پشتیبان‌گیری از دیتابیس پیش از به‌روزرسانی"
  ./backup.sh
else
  echo "▶ ۲) دیتابیس هنوز اجرا نشده؛ پشتیبان لازم نیست (نصب اول)"
fi

echo "▶ ۳) ساخت و اجرای سرویس‌ها"
"${COMPOSE[@]}" up -d --build --remove-orphans

echo "▶ ۴) انتظار برای آماده‌شدن API و دیتابیس"
for i in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3000/api/health/ready >/dev/null 2>&1; then echo "✔ API آماده است"; break; fi
  [ "$i" = 60 ] && { echo "✖ API بالا نیامد؛ لاگ: ${COMPOSE[*]} logs --tail=100 api"; exit 1; }
  sleep 3
done

for p in 3000 3001 3002; do
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$p/" || true)
  echo "  پورت $p → HTTP $code"
done
echo
echo "✅ انجام شد. حالا در پنل ادمین → «وضعیت سرویس‌ها» وضعیت api.ir و بقیه را ببینید."
echo "   اگر رمز ادمین تصادفی بود:  ${COMPOSE[*]} logs api | grep -i -A3 password"
