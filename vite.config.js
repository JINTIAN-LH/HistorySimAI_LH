import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const resolvePath = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));
const devApiProxyTarget = process.env.DEV_API_PROXY_TARGET || 'https://historysimai-lh.onrender.com';

export default defineConfig({
  base: './',
  plugins: [react()],
  root: resolvePath('./client'),
  publicDir: resolvePath('./public'),
  build: {
    outDir: resolvePath('./dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolvePath('./client/index.html')
      }
    }
  },
  server: {
    port: 8080,
    open: true,
    fs: {
      allow: [resolvePath('./')]
    },
    proxy: {
      '/api': {
        target: devApiProxyTarget,
        changeOrigin: true,
        secure: true
      }
    }
  },
  resolve: {
    alias: {
      '@': resolvePath('./js'),
      '@api': resolvePath('./js/api'),
      '@client': resolvePath('./client/src'),
      '@data': resolvePath('./public/data'),
      '@legacy': resolvePath('./js'),
      '@styles': resolvePath('./css'),
      '@systems': resolvePath('./js/systems'),
      '@ui': resolvePath('./js/ui')
    }
  }
});
