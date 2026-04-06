import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

const resolvePath = (relativePath) => fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
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
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['js/**/*.test.js', 'server/*.test.js', 'client/src/**/*.test.js'],
    exclude: ['**/node_modules/**'],
  },
});
