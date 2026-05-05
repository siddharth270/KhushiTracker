import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // We author manifest.webmanifest by hand in /public
      manifest: false,
      workbox: {
        navigateFallback: '/index.html',
        // Don't precache the API route — we want fresh data
        navigateFallbackDenylist: [/^\/\.netlify\/functions\//],
        runtimeCaching: [
          {
            // Network-first for our serverless function with a 5 s timeout —
            // if the network is slow/dead the SW falls back to last good response,
            // so the dashboard still shows numbers offline.
            urlPattern: ({ url }) => url.pathname.startsWith('/.netlify/functions/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'followers-api',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 10 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ request }) => request.destination === 'image',
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 32, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
});