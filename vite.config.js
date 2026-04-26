import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const resolvePath = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));
const devApiProxyTarget = process.env.DEV_API_PROXY_TARGET || 'https://historysimai-lh.onrender.com';
const buildVersion = process.env.BUILD_VERSION || new Date().toISOString();

function manualChunks(id) {
  const normalizedId = id.split('\\').join('/');

  if (normalizedId.includes('/node_modules/react-dom/')) return 'react-dom-vendor';
  if (normalizedId.includes('/node_modules/react/')) return 'react-vendor';

  return undefined;
}

function buildVersionPlugin(version) {
  return {
    name: 'build-version-injector',
    transformIndexHtml(html) {
      const escapedVersion = String(version).replace(/"/g, '&quot;');
      const buildMeta = `<meta name="x-build-version" content="${escapedVersion}">`;
      if (html.includes('name="x-build-version"')) {
        return html.replace(/<meta name="x-build-version" content="[^"]*">/g, buildMeta);
      }
      return html.replace('</head>', `  ${buildMeta}\n</head>`);
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __BUILD_VERSION__: JSON.stringify(buildVersion),
  },
  plugins: [react(), buildVersionPlugin(buildVersion)],
  root: resolvePath('./client'),
  publicDir: resolvePath('./public'),
  build: {
    outDir: resolvePath('./dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolvePath('./client/index.html')
      },
      output: {
        manualChunks,
      },
    }
  },
  server: {
    port: 8080,
    open: true,
    fs: {
      allow: [resolvePath('./')]
    },
    proxy: {
      '/api/chongzhen/talentRecruit': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/api/chongzhen/talentInteract': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/api/chongzhen/ministerAdvise': {
        target: 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/api': {
        target: devApiProxyTarget,
        changeOrigin: true,
        secure: true,
      },
    },
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
