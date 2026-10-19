#!/usr/bin/env bash
# Daily backup of the database + uploaded logos. Keeps the newest 14.  Cron (03:15 every night):
#   15 3 * * * cd /opt/sabegheno && ./backup.sh >> /var/log/sabegheno-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")"
DEST="${BACKUP_DIR:-/var/backups/sabegheno}"
mkdir -p "$DEST"; chmod 700 "$DEST"
STAMP="$(date +%Y%m%d-%H%M%S)"

docker exec sabegheno_db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner' | gzip -9 > "$DEST/db-$STAMP.sql.gz"
docker run --rm -v sabegheno_uploads_data:/data:ro -v "$DEST":/out alpine tar czf "/out/uploads-$STAMP.tgz" -C /data . 2>/dev/null || echo "⚠ پشتیبان فایل‌های آپلودی گرفته نشد (volume پیدا نشد؟)"

[ -s "$DEST/db-$STAMP.sql.gz" ] || { echo "✖ فایل پشتیبان خالی است"; exit 1; }
ls -1t "$DEST"/db-*.sql.gz | tail -n +15 | xargs -r rm -f
ls -1t "$DEST"/uploads-*.tgz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "✔ $(date '+%F %T') پشتیبان ساخته شد: $DEST/db-$STAMP.sql.gz ($(du -h "$DEST/db-$STAMP.sql.gz" | cut -f1))"
