// Single source of truth for the integration docs shown inside the business panel.
export const apiBase = (base) => (base.startsWith("http") ? `${base.replace(/\/$/, "")}/v1` : `${window.location.origin}${base.replace(/\/$/, "")}/v1`);

export const ENDPOINTS = [
  ["POST", "/v1/inquiries", "استعلام لحظه‌ای — همان «استعلام جدید» پنل، بدون ورود دستی"],
  ["GET", "/v1/inquiries/:id", "دریافت دوبارهٔ نتیجه (تصمیم پس از بررسی پیشرفته هم به‌روز می‌شود)"],
  ["POST", "/v1/facilities", "ثبت یا به‌روزرسانی یک اعتبار (با externalRef تکراری نمی‌شود)"],
  ["POST", "/v1/facilities/bulk", "همگام‌سازی گروهی تا ۲۰۰ اعتبار در هر درخواست"],
  ["POST", "/v1/facilities/:externalRef/settle", "اعلام تسویه — بلافاصله اعمال می‌شود"],
  ["GET", "/v1/facilities", "فهرست اعتبارهای ثبت‌شدهٔ شما"],
];

export function snippets(base, key = "sbg_live_XXXXXXXXXXXXXXXXXXXXXXXX") {
  const body = `{"nationalId":"0012345678","requestedAmount":80000000,"termMonths":6,"customerBirthDate":"1371/5/12"}`;
  return {
    curl: `curl -X POST ${base}/inquiries \\
  -H "X-API-Key: ${key}" \\
  -H "Content-Type: application/json" \\
  -d '${body}'`,
    node: `const res = await fetch("${base}/inquiries", {
  method: "POST",
  headers: { "X-API-Key": process.env.SABEGHENO_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ nationalId: "0012345678", requestedAmount: 80_000_000, termMonths: 6 }),
});
const r = await res.json();
// r.decision: "approve" | "review" | "decline"   r.score: 0–900   r.grade: "A1"…"E3"
console.log(r.decision, r.score, r.grade, r.overlaps);`,
    php: `<?php
$ch = curl_init("${base}/inquiries");
curl_setopt_array($ch, [
  CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["X-API-Key: " . getenv("SABEGHENO_KEY"), "Content-Type: application/json"],
  CURLOPT_POSTFIELDS => json_encode(["nationalId" => "0012345678", "requestedAmount" => 80000000, "termMonths" => 6]),
]);
$r = json_decode(curl_exec($ch), true);
echo $r["decision"], " ", $r["score"], " ", $r["grade"];`,
    python: `import os, requests
r = requests.post("${base}/inquiries",
    headers={"X-API-Key": os.environ["SABEGHENO_KEY"]},
    json={"nationalId": "0012345678", "requestedAmount": 80_000_000, "termMonths": 6},
    timeout=30).json()
print(r["decision"], r["score"], r["grade"], r["overlaps"])`,
    settle: `curl -X POST ${base}/facilities/INV-1024/settle \\
  -H "X-API-Key: ${key}" -H "Content-Type: application/json" \\
  -d '{"settledAt":"2026-10-09T10:00:00Z"}'`,
    facility: `curl -X POST ${base}/facilities \\
  -H "X-API-Key: ${key}" -H "Content-Type: application/json" \\
  -d '{"externalRef":"INV-1024","nationalId":"0012345678","title":"خرید اقساطی",
       "amount":20000000,"remainingAmount":12000000,
       "disbursedAt":"2026-07-01T00:00:00Z","dueDate":"2026-12-01T00:00:00Z"}'`,
  };
}
