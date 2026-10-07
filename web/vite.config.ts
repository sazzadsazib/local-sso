import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

// Default target is the internal Go port that ./run.sh auto-picks first;
// ./run.sh always exports SSO_BACKEND explicitly. Never default to the Vite
// port itself: that would make /api proxy back into this same dev server.
const GO_BACKEND = process.env.SSO_BACKEND || `http://127.0.0.1:${process.env.GO_PORT || '8081'}`;

// In dev mode the UI is served by Vite (HMR) while every API / OIDC route is
// proxied to the Go server, so window.location.origin keeps working unchanged.
// /callback is deliberately NOT proxied: Go's HandleCallback only returns the
// embedded production index.html (hashed assets), which breaks HMR. Vite's own
// SPA fallback serves the dev index.html there instead - same behaviour as prod.
// changeOrigin MUST stay false: Go builds discovery URLs from the request Host
// header, which has to remain the public (Vite) host:port.
const oidcTenant = String.raw`^/(common|organizations|consumers|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/`;

export default defineConfig({
  plugins: [tailwindcss()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '^/api(?:/|$)': { target: GO_BACKEND, changeOrigin: false },
      [oidcTenant]: { target: GO_BACKEND, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
