import { defineConfig } from 'vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // autoCodeSplitting: each page's code downloads when that page is first opened
    TanStackRouterVite({ autoCodeSplitting: true }),
    react(),
    // The service worker is only built for production; `npm run dev` runs without one
    VitePWA({
      // 'prompt' waits for the user to reload (PwaUpdatePrompt) instead of reloading
      // the page under them, which could throw away a half-filled form
      registerType: 'prompt',
      includeAssets: ['logo.svg', 'logo-pdf.png', 'apple-touch-icon-180x180.png'],
      manifest: {
        id: '/',
        name: 'Landschaft — Plants Database',
        short_name: 'Landschaft',
        description: 'Landschaft plants database: plants, taxonomy and projects.',
        start_url: '/',
        display: 'standalone',
        // white matches the mobile header; cream matches the loading screen shown while the app starts
        theme_color: '#ffffff',
        background_color: '#f4f0ea',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache every chunk, the large PDF/Excel ones included: until the user accepts an
        // update the old build keeps running from this cache, and after a deploy its files
        // are gone from the server. API calls go to another origin and always use the network.
        globPatterns: ['**/*.{js,css,html}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Polyfill Buffer for @react-pdf/renderer (uses Node.js Buffer API internally)
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['@react-pdf/renderer'],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', '@tanstack/react-router'],
          'ui-core': ['@tanstack/react-query', 'axios', 'lucide-react'],
          // @react-pdf/renderer and exceljs are left out on purpose: as their own
          // chunks they were preloaded on every page; now they load on first export
          'radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-label',
            '@radix-ui/react-scroll-area',
            '@radix-ui/react-select',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-tooltip'
          ],
        },
      },
    },
  },
});
