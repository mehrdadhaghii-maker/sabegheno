// All monitoring dates are shown in Tehran time with Persian formatting.
const dt = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", dateStyle: "short", timeStyle: "medium" });
const tm = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit" });
const hr = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", hour: "2-digit", minute: "2-digit", hour12: false });
export const tehranDateTime = (d) => (d ? dt.format(new Date(d)) : "—");
export const tehranTime = (d) => (d ? tm.format(new Date(d)) : "—");
export const tehranHour = (d) => hr.format(new Date(d));
export const statusTone = (c) => (c >= 500 ? "bad" : c >= 400 ? "warn" : "good");
