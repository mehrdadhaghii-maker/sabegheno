// Payment for a natural person's own credit report. Zarinpal v4 in production, a fake gateway in development.
const crypto = require("crypto");
const prisma = require("../db/prisma");
const env = require("../config/env");

const cfg = env.payment;
const ZP = "https://payment.zarinpal.com/pg/v4/payment";
const fail = (status, message, code) => Object.assign(new Error(message), { status, publicMessage: message, code });
const board = require("./serviceStatus");

async function zpPost(path, body) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  const t0 = Date.now();
  try {
    const r = await fetch(`${ZP}/${path}.json`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body), signal: ctl.signal });
    const out = await r.json();
    board.record("zarinpal", { ok: r.status < 500, ms: Date.now() - t0, status: r.status, error: r.status >= 500 ? `HTTP ${r.status}` : null });
    return out;
  } catch (e) {
    board.record("zarinpal", { ok: false, ms: Date.now() - t0, error: e.name === "AbortError" ? "timeout" : e.message });
    throw fail(502, "ارتباط با درگاه پرداخت برقرار نشد؛ کمی بعد دوباره تلاش کنید");
  } finally { clearTimeout(t); }
}

/** Creates a pending payment and returns where the browser must go. */
async function startReportPayment(user) {
  if (cfg.gateway === "none") throw fail(503, "درگاه پرداخت هنوز تنظیم نشده است", "GATEWAY_NOT_CONFIGURED");
  const amountToman = cfg.priceToman;

  if (cfg.gateway === "mock") {
    const authority = `MOCK-${crypto.randomBytes(8).toString("hex")}`;
    await prisma.payment.create({ data: { userId: user.id, amount: amountToman, gateway: "mock", authority } });
    return { gateway: "mock", authority, amount: amountToman, redirectUrl: `${cfg.frontendUrl}/payment/return?Authority=${authority}&Status=OK` };
  }

  const res = await zpPost("request", {
    merchant_id: cfg.merchantId, amount: amountToman * 10, // Zarinpal counts in RIAL
    callback_url: `${cfg.frontendUrl}/payment/return`, description: "دریافت گزارش اعتباری سابقه‌نو",
    metadata: { mobile: user.mobile },
  });
  const authority = res?.data?.authority;
  if (res?.data?.code !== 100 || !authority) throw fail(502, "درگاه پرداخت درخواست را نپذیرفت؛ دوباره تلاش کنید");
  await prisma.payment.create({ data: { userId: user.id, amount: amountToman, gateway: "zarinpal", authority } });
  return { gateway: "zarinpal", authority, amount: amountToman, redirectUrl: `https://payment.zarinpal.com/pg/StartPay/${authority}` };
}

/** Called after the browser returns from the gateway. Idempotent. */
async function verifyReportPayment(userId, authority, statusFromGateway) {
  const pay = await prisma.payment.findUnique({ where: { authority } });
  if (!pay || pay.userId !== userId) throw fail(404, "پرداخت یافت نشد");
  if (pay.status === "paid") return pay;
  if (statusFromGateway && statusFromGateway !== "OK") {
    await prisma.payment.update({ where: { id: pay.id }, data: { status: "failed" } });
    throw fail(402, "پرداخت انجام نشد یا لغو شد", "PAYMENT_FAILED");
  }
  if (pay.gateway === "mock") {
    if (cfg.gateway !== "mock") throw fail(400, "پرداخت آزمایشی در این محیط مجاز نیست");
    return prisma.payment.update({ where: { id: pay.id }, data: { status: "paid", paidAt: new Date(), refId: "MOCK" } });
  }
  const res = await zpPost("verify", { merchant_id: cfg.merchantId, amount: pay.amount * 10, authority });
  const code = res?.data?.code;
  if (code === 100 || code === 101) { // 101 = already verified
    return prisma.payment.update({ where: { id: pay.id }, data: { status: "paid", paidAt: new Date(), refId: String(res.data.ref_id ?? "") } });
  }
  await prisma.payment.update({ where: { id: pay.id }, data: { status: "failed" } });
  throw fail(402, "تأیید پرداخت ناموفق بود", "PAYMENT_FAILED");
}

/**
 * One payment = ONE inquiry (15,000 toman by default, charged every time a person asks).
 * - an unused paid payment is consumed and a fresh report is generated;
 * - a report that was already generated stays re-viewable for REPORT_ACCESS_HOURS from its stored
 *   snapshot, so reloading the page never charges twice.
 * Returns the report payload, or null when the person must pay.
 */
async function getOrCreateReport(userId, generate) {
  const since = new Date(Date.now() - cfg.accessHours * 3600_000);
  const unused = await prisma.payment.findFirst({ where: { userId, status: "paid", usedAt: null, paidAt: { gt: since } }, orderBy: { paidAt: "asc" } });
  if (unused) {
    // claim first (atomic) so two parallel requests can never spend the same payment twice
    const claimed = await prisma.payment.updateMany({ where: { id: unused.id, usedAt: null }, data: { usedAt: new Date() } });
    if (claimed.count === 1) {
      try {
        const result = await generate();
        const payload = { report: result.report };
        await prisma.payment.update({ where: { id: unused.id }, data: { reportSnapshot: payload } });
        return payload;
      } catch (err) {
        await prisma.payment.update({ where: { id: unused.id }, data: { usedAt: null } }).catch(() => {}); // generation failed → give the payment back
        throw err;
      }
    }
  }
  const used = await prisma.payment.findFirst({ where: { userId, status: "paid", usedAt: { gt: since } }, orderBy: { usedAt: "desc" } });
  return used?.reportSnapshot || null;
}

/** Can this person see a report right now without paying again? */
async function hasPaidReport(userId) {
  const since = new Date(Date.now() - cfg.accessHours * 3600_000);
  const p = await prisma.payment.findFirst({ where: { userId, status: "paid", OR: [{ usedAt: null, paidAt: { gt: since } }, { usedAt: { gt: since } }] } });
  return !!p;
}

module.exports = { startReportPayment, verifyReportPayment, hasPaidReport, getOrCreateReport };
