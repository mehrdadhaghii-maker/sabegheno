// security.md §1 — password policy: ≥ 8 chars with upper, lower, digit and symbol.
const crypto = require("crypto");

function checkPasswordPolicy(pw) {
  const p = String(pw ?? "");
  const problems = [];
  if (p.length < 8) problems.push("حداقل ۸ کاراکتر");
  if (!/[a-z]/.test(p)) problems.push("حرف کوچک انگلیسی");
  if (!/[A-Z]/.test(p)) problems.push("حرف بزرگ انگلیسی");
  if (!/\d/.test(p)) problems.push("عدد");
  if (!/[^A-Za-z0-9]/.test(p)) problems.push("نماد (مثل ! @ # $)");
  return { ok: problems.length === 0, problems };
}

const policyMessage = (problems) => `رمز عبور ضعیف است — باید شامل این موارد باشد: ${problems.join("، ")}`;

// Cryptographically-random password that always satisfies the policy.
function generateStrongPassword(length = 16) {
  const sets = ["abcdefghijkmnopqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!@#$%^&*-_=+"];
  const all = sets.join("");
  const pick = (s) => s[crypto.randomInt(s.length)];
  const chars = sets.map(pick);
  while (chars.length < length) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i--) { // Fisher–Yates with a CSPRNG
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

module.exports = { checkPasswordPolicy, policyMessage, generateStrongPassword };
