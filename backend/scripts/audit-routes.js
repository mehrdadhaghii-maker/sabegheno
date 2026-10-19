// hack.md "Authentication Bypass": lists every HTTP route and whether it is behind
// requireAuth (+ which role guard). Exits 1 if an unexpected public route exists.
//   npm run audit:routes
process.env.DISABLE_CRON = "true";
const app = require("../src/app");

// The ONLY routes allowed to be public.
const PUBLIC = new Set([
  "POST /auth/otp/request", "POST /auth/otp/verify", "POST /auth/refresh", "POST /admin/login",
  "GET /health", "GET /api/health",
]);

const stripPrefix = (re) => {
  const m = re.source.match(/^\^\\\/(.+?)\\\/\?\(\?=\\\/\|\$\)$/);
  return m ? "/" + m[1].replace(/\\\//g, "/") : "";
};

const rows = [];
function walk(stack, prefix, inherited) {
  let guards = [...inherited];
  for (const layer of stack) {
    if (layer.route) {
      const names = [...guards, ...layer.route.stack.map((l) => l.name)];
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      for (const method of methods) rows.push({ method, path: (prefix + layer.route.path).replace(/\/+$/, "") || "/", auth: (names.includes("requireAuth") || names.includes("requireApiKey")), guards: names.filter((n) => /^requireRole|requireApprovedBusiness/.test(n)) });
    } else if (layer.name === "router" && layer.handle.stack) {
      walk(layer.handle.stack, prefix + stripPrefix(layer.regexp), guards);
    } else if (layer.name === "requireAuth" || layer.name === "requireApiKey" || /^requireRole|requireApprovedBusiness/.test(layer.name)) {
      guards.push(layer.name);              // router.use(requireAuth, …) protects everything declared after it
    }
  }
}
// app-level mounts such as app.use("/monitor", requireAuth, isAdmin, router) are separate layers
// with the same path — collect their guards per prefix first.
const mountGuards = new Map();
for (const l of app._router.stack) {
  if (!l.route && l.name !== "router" && /^(requireAuth|requireRole|requireApiKey)/.test(l.name)) {
    const k = stripPrefix(l.regexp); mountGuards.set(k, [...(mountGuards.get(k) || []), l.name]);
  }
}
for (const l of app._router.stack) {
  if (l.route) rows.push({ method: Object.keys(l.route.methods)[0].toUpperCase(), path: l.route.path, auth: false, guards: [] });
  else if (l.name === "router") { const p = stripPrefix(l.regexp); walk(l.handle.stack, p, mountGuards.get(p) || []); }
}

const bad = rows.filter((r) => !r.auth && !PUBLIC.has(`${r.method} ${r.path}`) && !PUBLIC.has(`${r.method} ${r.path.replace(/^\/api/, "")}`));
const seen = new Set();
for (const r of rows.sort((a, b) => a.path.localeCompare(b.path))) {
  const key = `${r.method} ${r.path.replace(/^\/api/, "")}`;
  if (seen.has(key)) continue; seen.add(key);
  console.log(`${r.auth ? "🔒" : (PUBLIC.has(key) ? "🌐" : "⛔")} ${r.method.padEnd(6)} ${key.split(" ")[1].padEnd(42)} ${r.guards.join(", ")}`);
}
console.log(`\n${seen.size} route(s) — ${bad.length ? `⛔ ${bad.length} UNPROTECTED` : "✅ no unexpected public routes"}`);
process.exit(bad.length ? 1 : 0);
