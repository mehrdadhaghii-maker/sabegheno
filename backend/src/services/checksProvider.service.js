/**
 * Bounced-checks API adapter (چک صیادی برگشتی) — via api.ir's UnpaidChequePro.
 *
 * Endpoint: POST /api/sw1/UnpaidChequePro   Body: { nationalCode }
 *
 * IMPORTANT — data gap: this endpoint only returns *currently unpaid*
 * bounced checks. It has no "رفع سوءاثر شده" (resolved) or "issued" total —
 * so those two come back as `null` (not 0) per the product's own rule that
 * missing data must never be shown as zero.
 */
const { apiIrRequest } = require("./apiIrClient");
const env = require("../config/env");

function toJalaliSlashes(raw) {
  if (!raw || String(raw).length !== 8) return raw || null;
  const s = String(raw);
  return `${s.slice(0, 4)}/${s.slice(4, 6)}/${s.slice(6, 8)}`;
}

async function fetchCheckRecords(nationalId) {
  if (!env.apiIr.apiKey) {
    return { activeBounced: 0, resolved: null, issued: null, records: [], source: "unavailable" };
  }

  const payload = await apiIrRequest("/api/sw1/UnpaidChequePro", { nationalCode: nationalId });
  const data = payload.data || {};
  const chequeList = data.chequeList || [];

  return {
    activeBounced: data.count ?? chequeList.length,
    resolved: null,
    issued: null,
    records: chequeList.map((c) => ({
      date: toJalaliSlashes(c.chequeDate),
      amount: Number(c.bouncedAmount ?? c.amount) || 0,
      resolved: false,
      bank: c.branchDescription || null,
      reason: c.dishonorReason || null,
    })),
    source: "ok",
  };
}

module.exports = { fetchCheckRecords };
