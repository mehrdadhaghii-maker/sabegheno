// Thin client for the Sabegheno admin API.
// Session model (auth.md / security.md): a 15-minute access token + a rotating refresh
// token. The server enforces a single active session and a 30-minute idle timeout.
// NOTE: both tokens live in localStorage, so XSS hygiene matters (no dangerouslySetInnerHTML,
// strict CSP in nginx). See docs/security/SECURITY.md.
export const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const KEY = "sabegheno_admin_auth";
export const LOGOUT_REASON_KEY = "sabegheno_admin_logout_reason";

function jwtExp(token) {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).exp * 1000;
  } catch {
    return 0;
  }
}

// Kept as long as a refresh token exists — an expired ACCESS token alone no longer logs you out.
export const getAuth = () => {
  try {
    const a = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!a?.token || !a?.refreshToken) { localStorage.removeItem(KEY); return null; }
    return a;
  } catch {
    return null;
  }
};

export const setAuth = (v) => {
  if (v) localStorage.setItem(KEY, JSON.stringify(v));
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("admin-auth", { detail: v }));
};

function forceLogout(message) {
  if (message) { try { sessionStorage.setItem(LOGOUT_REASON_KEY, message); } catch { /* private mode */ } }
  setAuth(null);
}

const makeErr = (r, d) => Object.assign(new Error(d?.error || `خطای سرور (${r.status})`), { status: r.status, code: d?.code, data: d });

// One shared refresh at a time (parallel requests must not rotate the token twice).
let refreshing = null;
async function refreshTokens() {
  if (!refreshing) {
    const used = getAuth();
    refreshing = (async () => {
      if (!used?.refreshToken) throw new Error("no refresh token");
      const r = await fetch(`${BASE_URL}/auth/refresh`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken: used.refreshToken }) });
      let d = null; try { d = await r.json(); } catch { /* empty */ }
      if (!r.ok) {
        // another tab may already have rotated the tokens — if so, just adopt them
        const now = getAuth();
        if (now && now.refreshToken !== used.refreshToken) return now;
        throw makeErr(r, d);
      }
      const next = { ...used, token: d.token, refreshToken: d.refreshToken };
      localStorage.setItem(KEY, JSON.stringify(next)); // silent update (no logout event)
      return next;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

// poll:true marks background polling so it does NOT count as activity for the idle timeout.
async function send(path, { method, body, poll }, token) {
  let r;
  try {
    r = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(poll ? { "X-Background-Poll": "1" } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`اتصال به سرور برقرار نشد (${BASE_URL})`);
  }
  let d = null;
  try { d = await r.json(); } catch { /* empty body */ }
  return { r, d };
}

export async function request(path, opts = {}) {
  const { method = "GET", body, poll = false } = opts;
  let a = getAuth();
  try {
    if (a && jwtExp(a.token) < Date.now() + 10_000) a = await refreshTokens(); // refresh BEFORE sending when about to expire
  } catch (e) {
    forceLogout(e.code ? e.message : "نشست شما به پایان رسید؛ دوباره وارد شوید");
    throw e;
  }
  let { r, d } = await send(path, { method, body, poll }, a?.token);
  if (r.status === 401 && a && d?.code === "TOKEN_EXPIRED") {
    try { a = await refreshTokens(); ({ r, d } = await send(path, { method, body, poll }, a.token)); }
    catch (e) { forceLogout(e.message); throw e; }
  }
  if (!r.ok) {
    // login failures are 401 too — only an authenticated request that is rejected ends the session
    if (r.status === 401 && a && path !== "/admin/login") forceLogout(d?.error);
    throw makeErr(r, d);
  }
  return d;
}

const qs = (o) => {
  const p = new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== ""));
  return p.toString() ? `?${p}` : "";
};

export const queryString = qs;

export const adminApi = {
  login: (username, password, totp) => request("/admin/login", { method: "POST", body: { username, password, ...(totp ? { totp } : {}) } }),
  logout: async () => { try { await request("/auth/logout", { method: "POST" }); } catch { /* already gone */ } },
  logoutAll: () => request("/auth/logout-all", { method: "POST" }),
  security: () => request("/admin/security"),
  changePassword: (currentPassword, newPassword) => request("/admin/password", { method: "POST", body: { currentPassword, newPassword } }),
  setup2fa: () => request("/admin/2fa/setup", { method: "POST" }),
  enable2fa: (code) => request("/admin/2fa/enable", { method: "POST", body: { code } }),
  disable2fa: (password, code) => request("/admin/2fa/disable", { method: "POST", body: { password, code } }),
  reviews: (status = "pending", poll) => request(`/admin/reviews${queryString({ status })}`, { poll }),
  review: (id) => request(`/admin/reviews/${id}`),
  decideReview: (id, body) => request(`/admin/reviews/${id}/decide`, { method: "POST", body }),
  runRetention: () => request("/admin/data-retention/run", { method: "POST" }),
  analytics: (days = 30) => request(`/admin/analytics${qs({ days })}`),
  businesses: (status) => request(`/admin/businesses${qs({ status })}`),
  updateBusiness: (id, body) => request(`/admin/businesses/${id}`, { method: "PATCH", body }),
  checks: (q = {}) => request(`/admin/credit-checks${qs(q)}`),
  providers: () => request("/providers"),
  createProvider: (body) => request("/admin/providers", { method: "POST", body }),
  updateProvider: (id, body) => request(`/admin/providers/${id}`, { method: "PATCH", body }),
  policy: () => request("/policy"),
  rules: () => request("/policy/rules"),
  createRule: (b) => request("/policy/rules", { method: "POST", body: b }),
  updateRule: (id, b) => request(`/policy/rules/${id}`, { method: "PATCH", body: b }),
  deleteRule: (id) => request(`/policy/rules/${id}`, { method: "DELETE" }),
  revealNationalId: (kind, id) => request("/admin/national-id/reveal", { method: "POST", body: { kind, id } }),
  systemHealth: (fresh) => request(`/admin/system-health${fresh ? "?fresh=1" : ""}`),
  testAllServices: (nationalId, birthDate) => request("/admin/services/test-all", { method: "POST", body: { nationalId, ...(birthDate ? { birthDate } : {}) } }),
  services: () => request("/admin/services"),
  createService: (b) => request("/admin/services", { method: "POST", body: b }),
  updateService: (id, b) => request(`/admin/services/${id}`, { method: "PATCH", body: b }),
  deleteService: (id) => request(`/admin/services/${id}`, { method: "DELETE" }),
  testService: (id, nationalId, birthDate) => request(`/admin/services/${id}/test`, { method: "POST", body: { nationalId, ...(birthDate ? { birthDate } : {}) } }),
  previewService: (draft, nationalId, birthDate, serviceId) => request("/admin/services/preview", { method: "POST", body: { draft, nationalId, ...(birthDate ? { birthDate } : {}), ...(serviceId ? { serviceId } : {}) } }),
  // contracts
  contracts: () => request("/admin/contracts"),
  publishContract: (b) => request("/admin/contracts", { method: "POST", body: b }),
  setLanding: (id, show) => request(`/admin/businesses/${id}/landing`, { method: "PATCH", body: { show } }),
  tickets: (status, poll) => request(`/admin/support/tickets${qs({ status })}`, { poll }),
  replyTicket: (id, body, close) => request(`/admin/support/tickets/${id}/reply`, { method: "POST", body: { body, close } }),
  setTicketStatus: (id, status) => request(`/admin/support/tickets/${id}`, { method: "PATCH", body: { status } }),
  sendNotification: (b) => request("/admin/notifications", { method: "POST", body: b }),
  notifications: () => request("/admin/notifications"),
  defaulters: () => request("/admin/defaulters"),
  resolveDefaulter: (id) => request(`/admin/defaulters/${id}/resolve`, { method: "POST" }),
  updatePolicy: (body) => request("/policy", { method: "PUT", body }),
};

// Logos are stored by the backend as "/uploads/logos/<id>.png"; make them absolute.
export const assetUrl = (u) => (u ? (/^https?:/.test(u) ? u : `${BASE_URL}${u}`) : null);
