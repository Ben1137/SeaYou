import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Normalise: must start AND end with /
  const rawBase = env.VITE_PWA_BASE || '/'
  const base = rawBase.endsWith('/') ? rawBase : `${rawBase}/`

  return {
  server: {
    fs: {
      // Allow serving files from the workspace root (for monorepo packages)
      allow: ['../..']
    },
    // Proxy configuration to fix CORS issues with Open-Meteo APIs during development
    proxy: {
      '/api/geocoding': {
        target: 'https://geocoding-api.open-meteo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/geocoding/, ''),
        secure: true,
      },
      '/api/marine': {
        target: 'https://marine-api.open-meteo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/marine/, ''),
        secure: true,
      },
      '/api/weather': {
        target: 'https://api.open-meteo.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/weather/, ''),
        secure: true,
      },
      '/api/places': {
        target: 'https://maps.googleapis.com/maps/api/place',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/places/, ''),
        secure: true,
      },
      '/api/noaa': {
        target: 'https://gis.charttools.noaa.gov/arcgis/rest/services',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/noaa/, ''),
        secure: true,
      },
    },
  },
  plugins: [
    // GLSL shader loader - must run BEFORE react plugin with enforce: 'pre'
    {
      name: 'glsl-loader',
      enforce: 'pre' as const,
      transform(code, id) {
        if (id.endsWith('.glsl') || id.endsWith('.vert') || id.endsWith('.frag')) {
          return {
            code: `export default ${JSON.stringify(code)};`,
            map: null,
          };
        }
      },
    },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png', 'pwa-64x64.png'],
      manifest: {
        name: 'SeaYou - Marine Weather Dashboard',
        short_name: 'SeaYou',
        description: 'Real-time marine weather forecasts for sailors, surfers, and ocean enthusiasts',
        theme_color: '#082d5d',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        scope: base,
        start_url: base,
        icons: [
          {
            src: `${base}pwa-64x64.png`,
            sizes: '64x64',
            type: 'image/png'
          },
          {
            src: `${base}pwa-192x192.png`,
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: `${base}pwa-512x512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: `${base}maskable-icon-512x512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Force the new SW to activate immediately on first reload rather than
        // waiting for all tabs to close. Prevents stale bundles (e.g. old
        // MAX_BBOX_DEG=2.0) from persisting after a deploy.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/OneSignal/],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // 3 MiB to accommodate WebGL shaders
        // Merge OneSignal Web SDK v16 worker logic into Vite's generated sw.js.
        // Without this, VitePWA's sw.js claims the root scope and immediately
        // marks OneSignalSDKWorker.js as redundant, breaking push subscription
        // (`[WM] No SW registration for postMessage`, 409 Conflict, undefined
        // Player ID). Hosting a single merged worker at /sw.js lets OneSignal
        // reuse VitePWA's registration via `serviceWorkerPath: 'sw.js'`.
        importScripts: ['https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js'],
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
            // Cache OpenSeaMap seamark tiles (CacheFirst — tiles change rarely)
            urlPattern: /^https:\/\/tiles\.openseamap\.org\/seamark\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'openseamap-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Cache NOAA ENC chart tiles proxied via /api/noaa
            urlPattern: /^https?:\/\/.*\/api\/noaa.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'noaa-enc-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Cache LINZ NZMariner chart tiles (CacheFirst — official charts update infrequently)
            urlPattern: /^https:\/\/tiles-cdn\.koordinates\.com\/services.*\/layer=50772\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'linz-tiles',
              expiration: {
                maxEntries: 500,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // MapTiler basemap style JSON — stale-while-revalidate (style changes infrequently)
            urlPattern: /^https:\/\/api\.maptiler\.com\/maps\/.*\/style\.json.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'maptiler-style',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 24 * 60 * 60 // 1 day
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // MapTiler vector/raster tiles — cache-first, tiles are content-addressed
            urlPattern: /^https:\/\/api\.maptiler\.com\/tiles\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'maptiler-tiles',
              expiration: {
                maxEntries: 1000,
                maxAgeSeconds: 7 * 24 * 60 * 60 // 1 week
              },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            // Overpass API harbour fetch — network-first, data changes regularly
            urlPattern: /^https:\/\/overpass\.private\.coffee\/api\/.*/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'overpass-cache',
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 // 1 hour
              },
              cacheableResponse: { statuses: [0, 200] }
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
        enabled: false, // Disabled in development to avoid base path issues
        type: 'module'
      }
    })
  ],
  base, // set by VITE_PWA_BASE: '/' for Vercel, '/SeaYou1.0/' for GitHub Pages
  resolve: {
    alias: {
      // Point @seame/core to its TypeScript source so Vite/Rollup/vite-plugin-pwa
      // can resolve it even on a fresh CI checkout where dist/ does not exist yet.
      '@seame/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    // Target modern browsers that support ES class fields natively
    target: 'es2022',
    rollupOptions: {
      output: {
        // Prevent code splitting issues with maplibre-gl
        manualChunks: {
          maplibre: ['maplibre-gl'],
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
    esbuildOptions: {
      // Target modern browsers - ES2022 supports class fields natively
      // This prevents __publicField helper issues
      target: 'es2022',
    },
  },
  // Fix __publicField error: esbuild should NOT transform class fields
  // By targeting ES2022+, class fields are kept as-is (native browser support)
  esbuild: {
    target: 'es2022',
  },
  }
})
