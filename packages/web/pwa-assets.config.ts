import { defineConfig, minimalPreset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  preset: {
    ...minimalPreset,
    apple: {
      sizes: [180],
      padding: 0.3,
      // iOS does not support transparent apple-touch-icon backgrounds — it fills
      // them with solid black. Bake in the brand navy so the logo stays visible.
      resizeOptions: { background: '#082d5d' },
    },
  },
  images: 'public/pwa-512x512.svg',
})
