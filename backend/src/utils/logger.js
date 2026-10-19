// Winston logger: Console (colored in dev, JSON in prod) + rotating JSON file
// (development only — in production everything goes to stdout) + database.
const path = require("path");
const winston = require("winston");
const env = require("../config/env");
const { maskPans, maskDeep } = require("./pan");

const LEVEL_EMOJI = { error: "❌", warn: "⚠️", info: "", debug: "" };

// data.md: never let a card number reach the logs.
const redact = winston.format((info) => {
  info.message = maskPans(String(info.message));
  if (info.meta) info.meta = maskDeep(info.meta);
  return info;
});

const withEmoji = winston.format((info) => {
  if (!info.emoji) info.emoji = LEVEL_EMOJI[info.level] || "";
  return info;
});

const consoleFormat = winston.format.printf(({ timestamp, level, message, emoji, route, method, statusCode }) => {
  const ctx = [method, route, statusCode].filter(Boolean).join(" ");
  return `${timestamp} ${emoji ? `${emoji} ` : ""}${level}: ${message}${ctx ? `  (${ctx})` : ""}`;
});

/** Saves one error row. NEVER throws and never logs through winston (no recursion). */
async function logErrorToDB(entry) {
  try {
    const prisma = require("../db/prisma"); // lazy: logger must load even if Prisma is not generated yet
    await prisma.errorLog.create({
      data: {
        message: maskPans(String(entry.message || "unknown error")).slice(0, 2000),
        stack: entry.stack ? maskPans(String(entry.stack)).slice(0, 5000) : null,
        route: entry.route ? String(entry.route).slice(0, 300) : null,
        method: entry.method ? String(entry.method).slice(0, 10) : null,
        userId: entry.userId ? String(entry.userId) : null,
        statusCode: Number.isInteger(entry.statusCode) ? entry.statusCode : null,
        meta: entry.meta ? maskDeep(entry.meta) : undefined,
      },
    });
  } catch (e) {
    console.error("[logger] ذخیرهٔ خطا در دیتابیس ناموفق بود:", e.message);
  }
}

// Custom transport — persists every `error`-level entry unless flagged skipDb.
class DbTransport extends winston.Transport {
  log(info, callback) {
    setImmediate(() => this.emit("logged", info));
    if (info.level === "error" && !info.skipDb) {
      logErrorToDB({ message: info.message, stack: info.stack, route: info.route, method: info.method, userId: info.userId, statusCode: info.statusCode, meta: info.meta });
    }
    callback();
  }
}

const transports = [
  new winston.transports.Console({
    format: env.isProd
      ? winston.format.combine(winston.format.timestamp(), redact(), winston.format.json())
      : winston.format.combine(winston.format.colorize({ level: true }), winston.format.timestamp({ format: "HH:mm:ss" }), redact(), withEmoji(), consoleFormat),
  }),
  new DbTransport({ level: "error" }),
];

if (!env.isProd) {
  // 5 MB per file, 5 files kept, JSON lines.
  transports.push(new winston.transports.File({
    filename: path.join(process.cwd(), "logs", "app.log"),
    maxsize: 5 * 1024 * 1024, maxFiles: 5, tailable: true,
    format: winston.format.combine(winston.format.timestamp(), redact(), winston.format.json()),
  }));
}

const logger = winston.createLogger({
  level: env.logLevel,
  format: winston.format.combine(winston.format.errors({ stack: true })),
  transports,
});

// Convenience helpers carrying the emoji vocabulary from the spec.
logger.success = (msg, meta) => logger.info(msg, { emoji: "✅", ...meta });
logger.security = (msg, meta) => logger.warn(msg, { emoji: "🔐", ...meta });
logger.cleanup = (msg, meta) => logger.info(msg, { emoji: "🧹", ...meta });
logger.logErrorToDB = logErrorToDB;

module.exports = logger;
