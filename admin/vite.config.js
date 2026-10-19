import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  // security.md: production build is minified and ships NO source maps.
  build: { sourcemap: false, minify: "esbuild" },
});
