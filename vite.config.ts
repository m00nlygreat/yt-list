import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/yt-list/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-icon.svg'],
      manifest: {
        name: 'YT List',
        short_name: 'YT List',
        description: 'A local-first YouTube playlist player.',
        theme_color: '#171717',
        background_color: '#171717',
        display: 'standalone',
        scope: '/yt-list/',
        start_url: '/yt-list/',
        icons: [
          {
            src: 'pwa-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/www\.youtube\.com\/iframe_api/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'youtube-api',
            },
          },
          {
            urlPattern: /^https:\/\/img\.youtube\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'youtube-thumbnails',
              expiration: {
                maxEntries: 150,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
    }),
  ],
})
