// data.md §3 — a bank-card number must never be stored. This masks any Luhn-valid
// 13–19 digit run (spaces / dashes / Persian digits tolerated) in free text before
// it reaches the database or the logs.
const FA = "۰۱۲۳۴۵۶۷۸۹", AR = "٠١٢٣٤٥٦٧٨٩";
const toLatin = (s) => String(s).replace(/[۰-۹]/g, (d) => FA.indexOf(d)).replace(/[٠-٩]/g, (d) => AR.indexOf(d));

function luhn(digits) {
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n; alt = !alt;
  }
  return sum % 10 === 0;
}

function maskPans(text) {
  if (typeof text !== "string" || text.length < 13) return text;
  const latin = toLatin(text);
  return latin.replace(/(?<![\d])(?:\d[ -]?){12,18}\d(?![\d])/g, (m) => {
    const digits = m.replace(/[ -]/g, "");
    if (digits.length < 13 || digits.length > 19 || !luhn(digits)) return m;
    return `**** **** **** ${digits.slice(-4)}`;
  });
}

// Deep-mask every string in a JSON-ish value (used for error-log meta).
function maskDeep(v, depth = 0) {
  if (depth > 4) return "[truncated]";
  if (typeof v === "string") return maskPans(v);
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => maskDeep(x, depth + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).slice(0, 50).map(([k, x]) => [k, maskDeep(x, depth + 1)]));
  return v;
}

module.exports = { maskPans, maskDeep, luhn };
