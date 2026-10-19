// Runs the data.md retention job once, right now:  npm run retention:run
const prisma = require("../src/db/prisma");
const { runRetention } = require("../src/services/dataRetention.service");
runRetention().then((r) => console.log("گزارش پاک‌سازی:", r)).finally(() => prisma.$disconnect());
