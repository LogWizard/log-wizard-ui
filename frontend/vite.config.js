import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../public',
    emptyOutDir: false, // 🌿 IMPORTANT: Do not delete existing avatars/uploads
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`
      }
    }
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://localhost:2053',
        changeOrigin: true,
        secure: false
      },
      '/messages': {
        target: 'https://localhost:2053',
        changeOrigin: true,
        secure: false
      },
      '/avatars': {
        target: 'https://localhost:2053',
        changeOrigin: true,
        secure: false
      },
      '/uploads': {
        target: 'https://localhost:2053',
        changeOrigin: true,
        secure: false
      }
    }
  }
});
