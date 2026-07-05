import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8001',
      '/auth': 'http://localhost:8001',
      '/ws': { target: 'ws://localhost:8001', ws: true },
      '/proxy/kucoin': {
        target: 'https://api-futures.kucoin.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/proxy\/kucoin/, ''),
      },
      '/proxy/gate': {
        target: 'https://api.gateio.ws',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/proxy\/gate/, ''),
      },
      '/proxy/mexc': {
        target: 'https://contract.mexc.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/proxy\/mexc/, ''),
      },
    },
  },
  build: {
    outDir: '../web-dist',
  },
})
