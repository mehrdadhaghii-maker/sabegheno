/**
 * Loans API adapter (تسهیلات) — via api.ir's ActiveLoans.
 *
 * Endpoint: POST /api/sw1/ActiveLoans   Body: { nationalCode }
 *
 * IMPORTANT — data shape gap: this endpoint gives only AGGREGATE amounts,
 * not a per-loan list, and no count of settled/overdue loans (only total
 * amounts per bucket) — see scoring.service.js for how the amount buckets
 * (pastExpiredAmount, dishonoredAmount, suspiciousAmount) are used instead.
 */
const { apiIrRequest } = require("./apiIrClient");
const env = require("../config/env");

async function fetchLoanRecords(nationalId) {
  if (!env.apiIr.apiKey) {
    return {
      active: 0, totalCommitment: 0, settled: null, overdue: null,
      debtTotal: 0, pastExpiredAmount: 0, deferredAmount: 0, suspiciousAmount: 0, dishonoredAmount: 0,
      records: [], source: "unavailable",
    };
  }

  const payload = await apiIrRequest("/api/sw1/ActiveLoans", { nationalCode: nationalId });
  const data = payload.data || {};
  const info = data.info || {};
  const overdueInstallments = Number(info.overdueInstallments ?? info.overdueCount ?? info.pastExpiredCount ?? 0) || 0;
  const arrearsLevel = overdueInstallments <= 3 ? "current" : overdueInstallments <= 6 ? "past_due" : overdueInstallments <= 18 ? "arrears" : "doubtful";

  return {
    active: data.count ?? 0,
    totalCommitment: Number(info.totalAmount) || 0,
    settled: null,
    overdue: null,
    debtTotal: Number(info.debtTotalAmount) || 0,
    pastExpiredAmount: Number(info.pastExpiredTotalAmount) || 0,
    deferredAmount: Number(info.deferredTotalAmount) || 0,
    suspiciousAmount: Number(info.suspiciousTotalAmount) || 0,
    dishonoredAmount: Number(info.dishonored) || 0,
    overdueInstallments,
    arrearsLevel,
    records: [],
    source: "ok",
  };
}

module.exports = { fetchLoanRecords };
