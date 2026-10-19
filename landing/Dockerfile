# stage 1: fetch the self-hosted Persian font (no third-party font CDN at runtime)
FROM node:20-alpine AS fonts
WORKDIR /f
RUN npm init -y >/dev/null && npm install @fontsource/vazirmatn --no-audit --no-fund
# stage 2: static site
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html styles.css main.js robots.txt sitemap.xml manifest.webmanifest /usr/share/nginx/html/
COPY assets /usr/share/nginx/html/assets
COPY --from=fonts /f/node_modules/@fontsource/vazirmatn/files/vazirmatn-arabic-400-normal.woff2 /usr/share/nginx/html/fonts/
COPY --from=fonts /f/node_modules/@fontsource/vazirmatn/files/vazirmatn-arabic-700-normal.woff2 /usr/share/nginx/html/fonts/
COPY --from=fonts /f/node_modules/@fontsource/vazirmatn/files/vazirmatn-arabic-900-normal.woff2 /usr/share/nginx/html/fonts/
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
