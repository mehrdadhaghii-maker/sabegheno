// Thin client around the real sabegheno-backend API (see backend README).
// Base URL is configurable via VITE_API_BASE_URL — defaults to the local
// docker-compose setup on http://localhost:4000.

export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const AUTH_KEY = "sabegheno_auth";

// --- auth persistence (localStorage) ---------------------------------
// Stored shape: { token, refreshToken, role: "business" | "user", entity, mobile }
// Session rules are enforced by the server (auth.md): 15-min access token + rotating
// refresh token, ONE active session per account, 30-minute idle timeout.
// NOTE: tokens live in localStorage → XSS hygiene matters (no dangerouslySetInnerHTML, strict CSP).
export const LOGOUT_REASON_KEY = "sabegheno_logout_reason";

export function getAuth() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    const a = raw ? JSON.parse(raw) : null;
    if (!a?.token || !a?.refreshToken) { if (raw) localStorage.removeItem(AUTH_KEY); return null; }
    return a;
  } catch {
    return null;
  }
}

export function setAuth(auth) {
  if (auth) localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  else localStorage.removeItem(AUTH_KEY);
  window.dispatchEvent(new CustomEvent("sabegheno-auth-changed", { detail: auth }));
}

function forceLogout(message) {
  if (message) { try { sessionStorage.setItem(LOGOUT_REASON_KEY, message); } catch { /* private mode */ } }
  setAuth(null);
}

function jwtExp(token) {
  try { return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000; } catch { return 0; }
}

const makeErr = (res, data) => Object.assign(new Error(data?.error || `خطای سرور (${res.status})`), { status: res.status, code: data?.code, detail: data?.detail, data });

// One shared refresh at a time (parallel requests must not rotate the token twice).
let refreshing = null;
async function refreshTokens() {
  if (!refreshing) {
    const used = getAuth();
    refreshing = (async () => {
      if (!used?.refreshToken) throw new Error("no refresh token");
      const res = await fetch(`${BASE_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: used.refreshToken }) });
      let data = null; try { data = await res.json(); } catch { /* empty */ }
      if (!res.ok) {
        const now = getAuth(); // another tab may already have rotated the tokens
        if (now && now.refreshToken !== used.refreshToken) return now;
        throw makeErr(res, data);
      }
      const next = { ...used, token: data.token, refreshToken: data.refreshToken };
      localStorage.setItem(AUTH_KEY, JSON.stringify(next)); // silent (no logout event)
      return next;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function doFetch(path, { method, body, poll }, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (poll) headers["X-Background-Poll"] = "1"; // background polling must not count as activity (idle timeout)
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch (networkErr) {
    const err = new Error(`اتصال به بک‌اند برقرار نشد (${BASE_URL}) — مطمئن شوید سرور بالاست`);
    err.cause = networkErr;
    throw err;
  }
  let data = null;
  try { data = await res.json(); } catch { /* some responses (204) may have no body */ }
  return { res, data };
}

// --- low-level request helper -----------------------------------------
async function request(path, { method = "GET", body, auth = true, token: tokenOverride, poll = false } = {}) {
  if (!auth || tokenOverride) {
    const { res, data } = await doFetch(path, { method, body, poll }, tokenOverride);
    if (!res.ok) throw makeErr(res, data);
    return data;
  }
  let a = getAuth();
  try {
    if (a && jwtExp(a.token) < Date.now() + 10_000) a = await refreshTokens();
  } catch (e) { forceLogout(e.code ? e.message : "نشست شما به پایان رسید؛ دوباره وارد شوید"); throw e; }

  let { res, data } = await doFetch(path, { method, body, poll }, a?.token);
  if (res.status === 401 && a && data?.code === "TOKEN_EXPIRED") {
    try { a = await refreshTokens(); ({ res, data } = await doFetch(path, { method, body, poll }, a.token)); }
    catch (e) { forceLogout(e.message); throw e; }
  }
  if (!res.ok) {
    if (res.status === 401 && a) forceLogout(data?.error); // the server ended this session (idle / replaced / password change…)
    throw makeErr(res, data);
  }
  return data;
}

// --- endpoints ----------------------------------------------------------

export const api = {
  // Auth / OTP (Ontime24-backed) — no token needed yet.
  // intent: "register" | "login" — a business must register before it can log in
  requestOtp: (mobile, role, intent = "login", businessName) =>
    request("/auth/otp/request", { method: "POST", body: { mobile, role, intent, ...(businessName ? { businessName } : {}) }, auth: false }),

  verifyOtp: (payload) =>
    request("/auth/otp/verify", { method: "POST", body: payload, auth: false }),
  getSession: () => request("/auth/me"),
  logoutAll: () => request("/auth/logout-all", { method: "POST" }),
  logout: async () => { try { await request("/auth/logout", { method: "POST" }); } catch { /* already gone */ } },
  deleteAccount: () => request("/auth/account", { method: "DELETE", body: { confirm: "حذف" } }),

  // Credit checks (business-only, except /me/report which is user-only).
  createCreditCheck: (payload) =>
    request("/credit-checks", { method: "POST", body: payload }),

  listCreditChecks: () => request("/credit-checks"),

  getStats: (days = 30) => request(`/credit-checks/stats?days=${days}`),

  getCreditCheck: (id) => request(`/credit-checks/${id}`),
  getCheckReport: (id) => request(`/credit-checks/${id}/report`),

  getMyReport: () => request("/credit-checks/me/report"),

  // Paid self-report (natural persons)
  reportPaymentStatus: () => request("/payments/report/status"),
  startReportPayment: () => request("/payments/report/start", { method: "POST" }),
  verifyReportPayment: (authority, status) => request("/payments/report/verify", { method: "POST", body: { authority, status } }),

  // Credit ledger ("اعتبارهای اعطایی")
  listFacilities: () => request("/facilities"),
  createFacility: (b) => request("/facilities", { method: "POST", body: b }),
  patchFacility: (id, b) => request(`/facilities/${id}`, { method: "PATCH", body: b }),
  payInstallment: (id, seq, paidAt) => request(`/facilities/${id}/installments/${seq}/pay`, { method: "POST", body: paidAt ? { paidAt } : {} }),
  fillFacilityNid: (id, nationalId) => request(`/facilities/${id}/national-id`, { method: "POST", body: { nationalId } }),
  fillDefaulterNid: (id, nationalId) => request(`/providers/defaulters/${id}/national-id`, { method: "POST", body: { nationalId } }),
  settleFacility: (id, settledAt) => request(`/facilities/${id}/settle`, { method: "POST", body: settledAt ? { settledAt } : {} }),

  // Contract (the admin publishes it; every business sees the current one)
  getContract: () => request("/business/contract"),
  acceptContract: () => request("/business/contract/accept", { method: "POST" }),
  downloadContract: async (fileName = "contract.pdf") => {
    await request("/auth/me");                         // refreshes the access token if it is about to expire
    const a = getAuth();
    const res = await fetch(`${BASE_URL}/business/contract/file`, { headers: { Authorization: `Bearer ${a?.token}` } });
    if (!res.ok) throw new Error("دریافت قرارداد ممکن نشد");
    const url = URL.createObjectURL(await res.blob());
    const el = Object.assign(document.createElement("a"), { href: url, download: fileName });
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  },

  // API keys
  listApiKeys: () => request("/business/api-keys"),
  createApiKey: (name) => request("/business/api-keys", { method: "POST", body: { name } }),
  revokeApiKey: (id) => request(`/business/api-keys/${id}`, { method: "DELETE" }),

  // Provider event reporting (business-only, requires the business to be
  // linked to a Provider row).
  reportProviderEvent: (payload) =>
    request("/providers/report", { method: "POST", body: payload }),
  reportProviderEventsBulk: (rows) =>
    request("/providers/report/bulk", { method: "POST", body: { rows } }),

  listRecentReports: () => request("/providers/report/recent"),

  // Providers admin panel — any authenticated role can read.
  listProviders: () => request("/providers"),

  getProvider: (id) => request(`/providers/${id}`),

  // Business profile, logo, support, notifications, defaulters (v14)
  getBusinessMe: () => request("/business/me"),
  uploadLogo: (dataUrl, token) => request("/business/logo", { method: "POST", body: { dataUrl }, token }),
  listTickets: (poll) => request("/support/tickets", { poll }),
  createTicket: (payload) => request("/support/tickets", { method: "POST", body: payload }),
  replyTicket: (id, body) => request(`/support/tickets/${id}/messages`, { method: "POST", body: { body } }),
  getNotifications: () => request("/notifications", { poll: true }),
  readAllNotifications: () => request("/notifications/read-all", { method: "POST" }),
  readNotification: (id) => request(`/notifications/${id}/read`, { method: "POST" }),
  myDefaulters: () => request("/providers/defaulters/mine"),

  // Policy (business-only).
  getPolicy: () => request("/policy"),

  updatePolicy: (payload) => request("/policy", { method: "PUT", body: payload }),
};

// Logos are stored by the backend as "/uploads/logos/<id>.png"; make them absolute.
export const assetUrl = (u) => (u ? (/^https?:/.test(u) ? u : `${BASE_URL}${u}`) : null);
