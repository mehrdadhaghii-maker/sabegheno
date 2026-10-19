#!/bin/sh
set -eu
echo "[sabegheno] waiting for database schema"
npx prisma db push --skip-generate
node prisma/seed.js
exec node src/server.js
