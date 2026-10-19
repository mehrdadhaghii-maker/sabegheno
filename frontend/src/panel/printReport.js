import { num, toman, tomanFull, faDigits, dateTimeFa, DECISION, cleanName } from "./kit.jsx";
import { assetUrl } from "../api.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Builds a self-contained, print-ready A4 report and opens the browser's print
// dialog (choose "Save as PDF" to download it). Uses the page's own stylesheets so
// the Vazirmatn font is embedded in the PDF.
export function printCheckReport(check, business = {}) {
  const d = DECISION[check.decision] || DECISION.review;
  const src = check.sources || {};
  const rows = [
    ["شناسه استعلام", check.id], ["تاریخ و زمان", dateTimeFa(check.createdAt)], ["مبلغ درخواستی", tomanFull(check.requestedAmount)],
    ["مدت بازپرداخت", `${num(check.termMonths)} ماه`], ["سقف پیشنهادی", tomanFull(check.recommendedLimit)],
    ["مدت پیشنهادی", check.recommendedTermMonths ? `${num(check.recommendedTermMonths)} ماه` : "—"],
    ["سطح ریسک", { low: "کم", medium: "متوسط", high: "زیاد" }[check.riskLevel] || "—"], ["اعتماد مدل", `${faDigits(check.confidence)}٪`],
    ["کسب‌وکارهای هم‌زمان", num(check.concurrentProviders)], ["تعهد بیرونی", tomanFull(check.totalExternalExposure)],
  ];
  const loans = src.loans || {}, checks = src.checks || {};
  const extra = [
    ["وام‌های فعال", loans.active != null ? num(loans.active) : "—"], ["مجموع تعهد وام", loans.totalCommitment != null ? tomanFull(loans.totalCommitment) : "—"],
    ["چک برگشتی فعال", checks.activeBounced != null ? num(checks.activeBounced) : "—"],
    ...((src.services || []).map((s) => [s.name, s.ok ? `${num(s.value)} ${s.unit || ""}` : "نامشخص"])),
  ];
  const logo = assetUrl(business.logoUrl);
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join("");
  const table = (r) => `<table>${r.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("")}</table>`;
  const html = `<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>گزارش اعتباری ${esc(check.id.slice(0, 8))}</title>${styles}
<style>
 @page{size:A4;margin:14mm} html,body{background:#fff!important;height:auto!important;overflow:visible!important}
 body{font-family:Vazirmatn,Tahoma,sans-serif;color:#14243A;font-size:13px;line-height:1.9;margin:0;padding:0}
 .r-head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0FAF9E;padding-bottom:12px;margin-bottom:18px}
 .r-head img.brand{height:54px} .r-biz{display:flex;align-items:center;gap:10px;font-weight:800} .r-biz img{width:44px;height:44px;border-radius:10px;object-fit:cover}
 h1{font-size:20px;margin:0 0 4px;color:#0B1F3A} .meta{color:#6B7A8C;font-size:12px}
 .verdict{display:flex;align-items:center;gap:22px;border:2px solid ${d.color};border-radius:16px;padding:16px 22px;margin:14px 0 18px;background:${d.color}14}
 .score{font-size:44px;font-weight:900;color:#0B1F3A;line-height:1.1} .vlabel{font-size:20px;font-weight:900;color:${d.color}}
 h2{font-size:15px;margin:18px 0 8px;color:#0B1F3A;border-inline-start:4px solid #0FAF9E;padding-inline-start:8px}
 table{width:100%;border-collapse:collapse} th,td{border:1px solid #DDE5EE;padding:7px 12px;text-align:right} th{background:#F4F7FA;width:38%;font-weight:700}
 .note{background:#FDF0D5;border-radius:10px;padding:10px 14px;margin:10px 0} .foot{margin-top:26px;border-top:1px solid #DDE5EE;padding-top:10px;color:#8A99AB;font-size:11px}
</style></head><body>
<div class="r-head"><img class="brand" src="${location.origin}/brand-lockup-horizontal.png" alt="سابقه‌نو"/><div class="r-biz">${logo ? `<img src="${esc(logo)}" alt=""/>` : ""}<span>${esc(cleanName(business.name || ""))}</span></div></div>
<h1>گزارش اعتبارسنجی مشتری</h1><div class="meta">صادرشده در ${esc(dateTimeFa(new Date()))} · کد ملی مشتری محافظت‌شده است</div>
<div class="verdict"><div class="score">${faDigits(check.score)}</div><div><div class="vlabel">${esc(d.label)}</div><div class="meta">امتیاز اعتباری از ۳۰۰ تا ۹۰۰</div></div></div>
${check.overrideReason ? `<div class="note"><b>دلایل و هشدارها:</b> ${esc(check.overrideReason)}</div>` : ""}
<h2>خلاصهٔ تصمیم</h2>${table(rows)}<h2>سوابق و منابع بررسی‌شده</h2>${table(extra)}
<div class="foot">این گزارش توسط سامانهٔ سابقه‌نو تولید شده و صرفاً برای تصمیم‌گیری داخلی کسب‌وکار است. نتیجه جنبهٔ الزام‌آور قانونی ندارد.</div>
</body></html>`;

  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:-9999px;width:0;height:0;border:0";
  document.body.appendChild(iframe);
  iframe.contentDocument.open(); iframe.contentDocument.write(html); iframe.contentDocument.close();
  const go = () => { try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } finally { setTimeout(() => iframe.remove(), 4000); } };
  // wait for fonts/images so the PDF is not rendered with fallback glyphs
  const wait = iframe.contentDocument.fonts?.ready || Promise.resolve();
  Promise.race([wait, new Promise((r) => setTimeout(r, 1500))]).then(() => setTimeout(go, 250));
}
