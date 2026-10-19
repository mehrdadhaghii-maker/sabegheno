// Telegram alert for HTTP-500 errors. Silent no-op when the token is not set.
const env = require("../config/env");
const { maskPans } = require("../utils/pan");

const MIN_GAP_MS = 5000; // at most one message per 5 s
let lastSentAt = 0;
let suppressed = 0;

const tehranTime = () =>
  new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "medium" }).format(new Date());

async function sendErrorAlert({ message, route, method, statusCode }) {
  const { token, chatId, adminUrl } = env.telegram;
  if (!token || !chatId) return false;

  const now = Date.now();
  if (now - lastSentAt < MIN_GAP_MS) { suppressed += 1; return false; }
  lastSentAt = now;

  // Plain text on purpose (no parse_mode) — error text can contain any characters.
  const lines = [
    (statusCode && statusCode < 400 ? "ℹ️ اطلاع‌رسانی — سابقه‌نو" : "🚨 خطای سرور — سابقه‌نو"),
    `پیام: ${maskPans(String(message || "—")).slice(0, 400)}`,
    `مسیر: ${route || "—"}`,
    `متد: ${method || "—"}   وضعیت: ${statusCode || 500}`,
    `زمان (تهران): ${tehranTime()}`,
  ];
  if (suppressed) lines.push(`(+${suppressed} خطای دیگر در چند ثانیهٔ اخیر)`);
  if (adminUrl) lines.push(`پنل: ${adminUrl.replace(/\/$/, "")}/#/monitor`);
  suppressed = 0;

  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ chat_id: chatId, text: lines.join("\n"), disable_web_page_preview: true }),
    });
    clearTimeout(t);
    return r.ok;
  } catch (e) {
    console.error("[telegram] ارسال اعلان ناموفق بود:", e.message); // never log the token
    return false;
  }
}

module.exports = { sendErrorAlert };
