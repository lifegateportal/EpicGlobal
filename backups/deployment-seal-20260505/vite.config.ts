import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: true,
        manualChunks: (id: string) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
          if (id.includes('node_modules/recharts')) return 'chart-vendor'
          if (id.includes('node_modules/@xyflow')) return 'flow-vendor'
          if (id.includes('node_modules/framer-motion')) return 'motion-vendor'
          if (id.includes('node_modules/socket.io-client')) return 'socket-vendor'
        },
      },
    },
  },
})
