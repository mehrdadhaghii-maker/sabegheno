/**
 * Shahkar (شاهکار) — confirms a mobile number actually belongs to a given
 * national ID. Via api.ir's ShahkarPro (chosen over the plain version for
 * its stated higher reliability — either works per the account's docs).
 *
 * Endpoint: POST /api/sw1/ShahkarPro
 * Body:     { nationalCode, mobile, isCompany }
 * Response: { success, code, message, data: true|false }
 *
 * Used to close a real security gap in the end-user ("کاربر") self-report
 * login: without this, anyone who knows a stranger's national ID could view
 * their credit report just by receiving an OTP on their OWN phone. Shahkar
 * makes sure the phone number and the national ID actually match.
 */
const { apiIrRequest } = require("./apiIrClient");
const env = require("../config/env");

async function verifyMobileMatchesNationalId(nationalId, mobile, { isCompany = false } = {}) {
  if (!env.apiIr.apiKey) {
    // Fail safe: without the ability to verify, don't silently trust —
    // but don't hard-block local dev either. Callers should treat
    // `unavailable` as "couldn't confirm" and decide accordingly.
    return { matched: null, source: "unavailable" };
  }

  const payload = await apiIrRequest("/api/sw1/ShahkarPro", {
    nationalCode: nationalId,
    mobile,
    isCompany,
  });

  return { matched: payload.data === true, source: "ok" };
}

module.exports = { verifyMobileMatchesNationalId };
