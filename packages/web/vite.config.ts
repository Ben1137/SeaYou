import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'SeaYou - Marine Weather Dashboard',
        short_name: 'SeaYou',
        description: 'Real-time marine weather forecasts for sailors, surfers, and ocean enthusiasts',
        theme_color: '#0ea5e9',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/SeaYou/',
        start_url: '/SeaYou/',
        icons: [
          {
            src: '/SeaYou/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/SeaYou/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: '/SeaYou/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // Cache Open-Meteo API calls
            urlPattern: /^https:\/\/.*api\.open-meteo\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Cache Marine API calls
            urlPattern: /^https:\/\/marine-api\.open-meteo\.com\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'marine-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 30 * 60 // 30 minutes
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            // Cache geocoding API
            urlPattern: /^https:\/\/geocoding-api\.open-meteo\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'geocoding-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
              }
            }
          },
          {
            // Cache static assets
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true, // Enable in development for testing
        type: 'module'
      }
    })
  ],
  base: '/SeaYou/', // Important: This should match your GitHub repo name
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
})
