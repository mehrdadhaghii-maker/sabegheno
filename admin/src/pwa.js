// PWA glue: registers the service worker, offers "install the app", and offers "new version ready".
// Plain DOM on purpose (no React state) so it can never interfere with the panel itself.
const DAY = 86400000;

function bar(id, text, actions) {
  if (document.getElementById(id)) return null;
  const el = document.createElement("div");
  el.id = id;
  el.setAttribute("role", "status");
  el.dir = "rtl";
  el.style.cssText = "position:fixed;z-index:2147483000;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));max-width:520px;margin:0 auto;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px;border-radius:14px;background:#0B1F3A;color:#fff;font:600 13px/1.8 Vazirmatn,Tahoma,system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.28)";
  const t = document.createElement("span");
  t.style.cssText = "flex:1;min-width:160px";
  t.textContent = text;
  el.appendChild(t);
  for (const [label, primary, fn] of actions) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText = "border:0;border-radius:10px;padding:8px 14px;cursor:pointer;font:inherit;" + (primary ? "background:#0FAF9E;color:#fff" : "background:rgba(255,255,255,.14);color:#fff");
    b.onclick = () => { fn(el); };
    el.appendChild(b);
  }
  document.body.appendChild(el);
  return el;
}

export function initPwa(key = "app") {
  if (!("serviceWorker" in navigator)) return;
  const dismissedKey = `sabegheno-pwa-dismissed-${key}`;
  const dismissed = () => Date.now() - Number(localStorage.getItem(dismissedKey) || 0) < 14 * DAY;
  const dismiss = (el) => { try { localStorage.setItem(dismissedKey, String(Date.now())); } catch { /* private mode */ } el.remove(); };
  const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  // ---- install (Android / desktop Chrome) ----
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    if (standalone || dismissed()) return;
    setTimeout(() => bar("pwa-install", "سابقه‌نو را روی گوشی نصب کنید تا مثل یک اپلیکیشن باز شود.", [
      ["نصب", true, async (el) => { el.remove(); deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; }],
      ["بعداً", false, dismiss],
    ]), 6000);
  });
  window.addEventListener("appinstalled", () => { document.getElementById("pwa-install")?.remove(); deferred = null; });

  // ---- install hint (iPhone/iPad Safari has no install event) ----
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
  if (ios && !standalone && !dismissed()) {
    setTimeout(() => bar("pwa-ios", "برای نصب: دکمهٔ «اشتراک‌گذاری» (Share) را بزنید و «Add to Home Screen» را انتخاب کنید.", [["متوجه شدم", true, dismiss]]), 8000);
  }

  // ---- service worker + update prompt (production only) ----
  if (!import.meta.env.PROD) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (reloading) return; reloading = true; location.reload(); });

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).then((reg) => {
      const offer = (worker) => bar("pwa-update", "نسخهٔ جدید آماده است.", [
        ["به‌روزرسانی", true, () => worker.postMessage("SKIP_WAITING")],
        ["بعداً", false, (el) => el.remove()],
      ]);
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w?.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); });
      });
      // an installed app stays open for days: look for a new version whenever it comes back to the foreground
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => { /* PWA is an enhancement; the site works without it */ });
  });
}
