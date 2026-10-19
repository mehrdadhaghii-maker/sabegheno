// Landing interactions — no inline scripts / styles so a strict CSP works.
const PANEL_URL = "https://app.sabegheno.ir";              // business panel
const API_BASE = "https://app.sabegheno.ir/api/v1";        // public API (same host as the panel)
const FA = "۰۱۲۳۴۵۶۷۸۹";
const fa = (n) => String(n).replace(/\d/g, (d) => FA[d]);

document.querySelectorAll("[data-panel]").forEach((a) => { a.href = PANEL_URL; });

// mobile menu
const mb = document.getElementById("menuBtn"), menu = document.getElementById("menu");
mb?.addEventListener("click", () => { const o = menu.classList.toggle("open"); mb.setAttribute("aria-expanded", String(o)); });
menu?.addEventListener("click", (e) => { if (e.target.closest("a")) { menu.classList.remove("open"); mb.setAttribute("aria-expanded", "false"); } });

// reveal on scroll
const io = "IntersectionObserver" in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 }) : null;
document.querySelectorAll(".rv").forEach((el) => (io ? io.observe(el) : el.classList.add("in")));

// count-up (Persian digits)
function countUp(el, to, ms = 1600) {
  const t0 = performance.now();
  const step = (t) => { const p = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - p, 3); el.textContent = fa(Math.round(to * e)); if (p < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// numbers are in the HTML already (works without JS); reset to ۰ only when we are going to animate them
if (!reduce && "IntersectionObserver" in window) document.querySelectorAll("[data-count]").forEach((el) => { el.textContent = fa(0); });
const cio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { countUp(e.target, +e.target.dataset.count); cio.unobserve(e.target); } }), { threshold: 0.6 });
if (!reduce) document.querySelectorAll("[data-count]").forEach((el) => cio.observe(el));

// hero gauge: needle sweep + score count-up
const gc = document.getElementById("gaugeCard"), sn = document.getElementById("scoreNum");
setTimeout(() => { gc?.classList.add("go"); if (sn && !reduce) countUp(sn, +sn.dataset.to, 2000); }, 450);

// API code tabs
const CODE = {
  curl: `curl -X POST ${API_BASE}/inquiries \\
  -H "X-API-Key: sbg_live_XXXXXXXX" \\
  -H "Content-Type: application/json" \\
  -d '{"nationalId":"0012345678","requestedAmount":80000000,"termMonths":6}'

# → { "decision": "approve", "score": 672, "grade": "A2",
#     "overlaps": [{ "brand": "فروشگاه الف", "at": "…" }], … }`,
  node: `const res = await fetch("${API_BASE}/inquiries", {
  method: "POST",
  headers: { "X-API-Key": process.env.SABEGHENO_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ nationalId: "0012345678", requestedAmount: 80_000_000, termMonths: 6 }),
});
const r = await res.json();
console.log(r.decision, r.score, r.grade, r.overlaps);`,
  php: `<?php
$ch = curl_init("${API_BASE}/inquiries");
curl_setopt_array($ch, [
  CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => ["X-API-Key: " . getenv("SABEGHENO_KEY"), "Content-Type: application/json"],
  CURLOPT_POSTFIELDS => json_encode(["nationalId" => "0012345678", "requestedAmount" => 80000000, "termMonths" => 6]),
]);
$r = json_decode(curl_exec($ch), true);
echo $r["decision"], " ", $r["score"], " ", $r["grade"];`,
  py: `import os, requests
r = requests.post("${API_BASE}/inquiries",
    headers={"X-API-Key": os.environ["SABEGHENO_KEY"]},
    json={"nationalId": "0012345678", "requestedAmount": 80_000_000, "termMonths": 6},
    timeout=30).json()
print(r["decision"], r["score"], r["grade"], r["overlaps"])`,
};
const box = document.getElementById("codeBox");
const show = (k) => { box.textContent = CODE[k]; document.querySelectorAll(".code .tabs button").forEach((b) => b.classList.toggle("on", b.dataset.t === k)); };
document.querySelectorAll(".code .tabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.t)));
show("curl");

// ---- "companies that trust us": brand + logo of businesses the admin opted in (public, read-only endpoint) ----
(function partners() {
  const grid = document.getElementById("partnerGrid"), empty = document.getElementById("partnerEmpty");
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 4 }, () => '<li class="sk" aria-hidden="true"></li>').join("");
  const mono = (n) => String(n || "؟").trim().charAt(0);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  fetch("/api/public/partners", { headers: { Accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad status"))))
    .then(({ partners }) => {
      grid.replaceChildren();
      if (!partners || !partners.length) { empty.hidden = false; return; }
      for (const p of partners) {
        const li = el("li", "partner rv");               // textContent only → a brand name can never inject markup
        const logo = el("div", "logo");
        if (p.logoUrl) {
          const img = el("img"); img.src = "/api" + p.logoUrl; img.alt = `لوگوی ${p.name}`; img.loading = "lazy"; img.width = 84; img.height = 84;
          img.onerror = () => { img.replaceWith(el("span", "mono", mono(p.name))); };
          logo.append(img);
        } else logo.append(el("span", "mono", mono(p.name)));
        li.append(logo, el("b", "", p.name));
        grid.append(li);
        if (io) io.observe(li); else li.classList.add("in");
      }
    })
    .catch(() => { grid.replaceChildren(); empty.hidden = false; });
})();
