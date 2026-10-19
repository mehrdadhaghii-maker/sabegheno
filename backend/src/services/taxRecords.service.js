/**
 * TaxRecords (استعلام پرونده‌های مالیاتی) — via api.ir. Looks up a tax/
 * registration record by an "inquiryCode" (the example shown is an 11-digit
 * economic/legal-entity code, not a personal national ID — this appears to
 * be aimed at companies/legal entities, not individual customers).
 *
 * Endpoint: POST /api/sw1/TaxRecords
 * Body:     { inquiryCode }
 * Response: { data: { records: [{ name, economicCode, registrationStatus,
 *             registrationStep }] } }
 *
 * Not wired into the individual credit-scoring pipeline (scoring.service.js)
 * since it's keyed differently — exposed as a general lookup utility for
 * now, e.g. for verifying a business/legal-entity counterparty.
 */
const { apiIrRequest } = require("./apiIrClient");
const env = require("../config/env");

async function lookupTaxRecords(inquiryCode) {
  if (!env.apiIr.apiKey) {
    const err = new Error("api.ir is not configured");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  const payload = await apiIrRequest("/api/sw1/TaxRecords", { inquiryCode });
  const data = payload.data || {};

  return {
    records: (data.records || []).map((r) => ({
      name: r.name || null,
      economicCode: r.economicCode || null,
      registrationStatus: r.registrationStatus || null,
      registrationStep: r.registrationStep || null,
    })),
  };
}

module.exports = { lookupTaxRecords };
