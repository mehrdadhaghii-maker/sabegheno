/**
 * OTP delivery — independent of any data-provider partner. We generate and
 * verify the code ourselves (see auth.routes.js + utils/crypto.js); this
 * file's only job is handing the code to api.ir's SmsOTP for delivery.
 *
 * Endpoint: POST /api/sw1/SmsOTP
 * Body:     { code, mobile, template }
 * Response: { success, code, message, data: true }
 *
 * `template` selects the SMS wording on api.ir's side — using 1 (their
 * default) until a custom template is set up for "کد تایید سابقه‌نو: ...".
 */
const { apiIrRequest } = require("./apiIrClient");
const env = require("../config/env");

async function sendOtpSms(mobile, code) {
  if (!env.apiIr.apiKey) {
    console.log(`[OTP-DEV-MODE] would send code ${code} to ${mobile}`);
    return { ok: true, devMode: true };
  }

  return apiIrRequest("/api/sw1/SmsOTP", { code, mobile, template: 1 });
}

module.exports = { sendOtpSms };
