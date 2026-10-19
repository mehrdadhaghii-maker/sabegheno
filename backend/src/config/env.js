require("dotenv").config();

const nodeEnv = process.env.NODE_ENV || "development";
const DEFAULT_JWT = "dev-secret-change-me";
const jwtSecret = process.env.JWT_SECRET || DEFAULT_JWT;

// Refuse to boot a production server that signs tokens with the public default.
if (nodeEnv === "production" && jwtSecret === DEFAULT_JWT) {
  throw new Error("JWT_SECRET تنظیم نشده است؛ در production باید یک مقدار تصادفی بلند (۳۲+ کاراکتر) تنظیم شود");
}
if (nodeEnv === "production" && jwtSecret.length < 32) {
  console.warn("[security] JWT_SECRET کوتاه‌تر از ۳۲ کاراکتر است؛ یک مقدار تصادفی بلندتر انتخاب کنید");
}

const list = (v) => String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
const num = (v, d) => (Number.isFinite(Number(v)) && v !== undefined && v !== "" ? Number(v) : d);

module.exports = {
  port: num(process.env.PORT, 4000),
  nodeEnv,
  isProd: nodeEnv === "production",
  jwtSecret,

  // --- auth.md / security.md: short-lived access token + rotating refresh token ---
  auth: {
    accessTtl: process.env.ACCESS_TOKEN_TTL || "15m",         // JWT lifetime
    idleMinutes: num(process.env.SESSION_IDLE_MINUTES, 30),   // inactivity → session closed
    refreshDays: num(process.env.REFRESH_TOKEN_DAYS, 7),      // absolute session cap
    maxFailedLogins: num(process.env.MAX_FAILED_LOGINS, 5),
    lockHours: num(process.env.LOCK_HOURS, 48),
    otpMaxAttempts: num(process.env.OTP_MAX_ATTEMPTS, 5),
  },

  // --- hack.md: CORS only for the listed front-end origins ---
  corsOrigins: list(process.env.CORS_ORIGINS),
  trustProxy: num(process.env.TRUST_PROXY, 1), // nginx in front → real client IP for rate limiting
  rateLimit: {
    authMax: num(process.env.RATE_LIMIT_AUTH_MAX, 100),   // 100 / 15 min / IP on login+OTP endpoints
    apiMax: num(process.env.RATE_LIMIT_API_MAX, 1200),    // authenticated API, per IP / 15 min
  },

  // --- monitoring ---
  logLevel: process.env.LOG_LEVEL || "info",
  logRetentionDays: num(process.env.LOG_RETENTION_DAYS, 30),
  telegram: {
    token: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
    adminUrl: process.env.ADMIN_PANEL_URL || "",
  },

  // --- data.md ---
  retention: {
    hardDeleteAfterDays: num(process.env.HARD_DELETE_AFTER_DAYS, 30),
    inactiveMonths: num(process.env.INACTIVE_ACCOUNT_MONTHS, 12),
  },

  // --- v16: paid self-report for natural persons ---
  payment: {
    merchantId: process.env.ZARINPAL_MERCHANT_ID || "",
    // zarinpal when a merchant id is set; otherwise a fake gateway in development and "none" in production.
    gateway: process.env.ZARINPAL_MERCHANT_ID ? "zarinpal" : (nodeEnv === "production" ? "none" : "mock"),
    priceToman: num(process.env.REPORT_PRICE_TOMAN, 15000),
    accessHours: num(process.env.REPORT_ACCESS_HOURS, 24),
    frontendUrl: (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/$/, ""),
  },

  // One account/key covers every s.api.ir service we use: checks, loans,
  // Shahkar, PersonInfo, PostalCodeInfo, SmsOTP.
  apiIr: {
    baseUrl: process.env.API_IR_BASE_URL || "https://s.api.ir",
    apiKey: process.env.API_IR_KEY || "",
    timeoutMs: num(process.env.API_IR_TIMEOUT_MS, 15000),
  },

  ontime24: {
    baseUrl: process.env.ONTIME24_BASE_URL || "https://api.ontime24.ir",
    adminUsername: process.env.ONTIME24_ADMIN_USERNAME || "",
    adminPassword: process.env.ONTIME24_ADMIN_PASSWORD || "",
  },
};
