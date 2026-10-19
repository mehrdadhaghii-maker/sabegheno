/**
 * Shared low-level client for api.ir (s.api.ir) — used by every service
 * sourced from that account: bounced checks, active loans, Shahkar
 * (mobile/national-ID match), PersonInfo (civil registry), PostalCodeInfo,
 * and SmsOTP. One API key covers all of these under the same account, so
 * the base URL + auth header are only written once here.
 *
 * Auth confirmed from the account's own key screen: put the key in the
 * `Authorization` header as `Bearer {apikey}`.
 */
const env = require("../config/env");

async function apiIrRequestRaw(path, body) {
  if (!env.apiIr.baseUrl || !env.apiIr.apiKey) {
    const err = new Error("api.ir is not configured (API_IR_BASE_URL / API_IR_KEY missing)");
    err.code = "NOT_CONFIGURED";
    throw err;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.apiIr.timeoutMs || 15000);
  let res;
  try {
    res = await fetch(`${env.apiIr.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.apiIr.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    const e = new Error(err.name === "AbortError" ? `api.ir timeout on ${path}` : `api.ir network error on ${path}`);
    e.code = err.name === "AbortError" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_NETWORK_ERROR";
    throw e;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const err = new Error(`api.ir error ${res.status} on ${path}`);
    err.status = res.status;
    throw err;
  }

  let payload;
  try { payload = await res.json(); }
  catch { throw new Error(`api.ir returned invalid JSON on ${path}`); }
  if (payload.success === false) {
    const err = new Error(payload.message || `api.ir rejected the request on ${path}`);
    err.apiIrCode = payload.code;
    throw err;
  }
  return payload;
}

// every call reports its outcome to the live status board (per endpoint: apiir:ShahkarPro, apiir:…)
const { track } = require("./serviceStatus");
const apiIrRequest = (path, body) => track(`apiir:${String(path).split("/").filter(Boolean).pop() || "root"}`, () => apiIrRequestRaw(path, body));

module.exports = { apiIrRequest };
