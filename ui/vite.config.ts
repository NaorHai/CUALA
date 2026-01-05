import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      open: true
    },
    define: {
      'import.meta.env.SERVER': JSON.stringify(env.SERVER || 'http://localhost:3001'),
      'import.meta.env.DEV_MODE': JSON.stringify(env.DEV_MODE || 'true'),
    },
  }
})

