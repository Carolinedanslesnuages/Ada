import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vueDevTools()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // The DSFR contains media queries reserved for Internet Explorer (min-width:0\0)
  // that the minifier refuses: they are ignored.
  css: {
    lightningcss: { errorRecovery: true },
  },
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3100',
      '/__version__': 'http://localhost:3100',
    },
  },
})
