import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// `BASE_PATH=/repo-name/` builds for a subpath (GitHub Pages project sites). Everything else uses "/".
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'coba-kacamataku',
        short_name: 'Kacamataku',
        description: 'Find glasses that suit your face, then try them on. Everything runs on your device.',
        lang: 'en',
        theme_color: '#0F766E',
        background_color: '#F3F4F6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The app shell is cached up front. The face model (3.7 MB) and the WebAssembly runtime (13 MB) are
        // too big to precache for everyone, so they are cached the first time they are used.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        // The 3D chunk (three.js, named after its entry file `drawer`) is only fetched when 3D is turned on,
        // so it is cached on first use as well instead of being downloaded by everyone.
        globIgnores: ['models/**', 'wasm/**', 'dev/**', 'assets/drawer-*.js'],
        navigateFallback: `${base}index.html`,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /\/assets\/drawer-[^/]+\.js$/.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'three-chunk-v1', expiration: { maxEntries: 2 }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: ({ url }) => /\/(models|wasm)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'ml-assets-v1',
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
