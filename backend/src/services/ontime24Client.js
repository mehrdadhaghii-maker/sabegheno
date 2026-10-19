/**
 * Shared low-level client for Ontime24's API (api.ontime24.ir).
 *
 * All of our external integrations — OTP/login now, and Payment/Wallet
 * later once its endpoint docs are available — go through this one place
 * so the base URL, the {version}=1 quirk, and bearer-token handling are
 * only written once.
 */
const env = require("../config/env");

const BASE_URL = env.ontime24.baseUrl || "https://api.ontime24.ir";
const VERSION = "1"; // per the docs: "همواره در بخش ورژن، عدد 1 وارد شود"

async function ontime24RequestRaw(path, { method = "GET", body, token } = {}) {
  const url = `${BASE_URL}${path.replace("{version}", VERSION)}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // some endpoints may return an empty body
  }

  if (!res.ok) {
    const err = new Error(`Ontime24 API error ${res.status} on ${path}`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

const { track } = require("./serviceStatus");
const ontime24Request = (path, opts) => track("ontime24", () => ontime24RequestRaw(path, opts));

module.exports = { ontime24Request, BASE_URL, VERSION };
