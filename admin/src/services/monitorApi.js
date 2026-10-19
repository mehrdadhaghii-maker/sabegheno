// Monitoring API client. Every call is a background poll (X-Background-Poll) so the
// 5-second auto-refresh never keeps an abandoned admin session alive.
import { request, queryString } from "../api.js";

const get = (path, params) => request(`/monitor${path}${queryString(params || {})}`, { poll: true });

export const getStats = () => get("/stats");
export const getErrors = (p) => get("/errors", p);
export const getErrorById = (id) => request(`/monitor/errors/${id}`); // user-initiated → counts as activity
export const resolveError = (id) => request(`/monitor/errors/${id}/resolve`, { method: "PATCH" });
export const getChartData = (hours = 24) => get("/chart-data", { hours });
export const getRecentRequests = (limit = 20) => get("/requests/recent", { limit });
export const getTopRoutes = (days = 7, limit = 10) => get("/top-routes", { days, limit });
