import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8783';

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('exceljs')) return 'vendor-exceljs';
            if (id.includes('element-plus') || id.includes('@element-plus')) return 'vendor-element-plus';
            if (id.includes('vue') || id.includes('pinia') || id.includes('vue-router')) return 'vendor-vue';
            return 'vendor';
          }
        }
      }
    },
    server: {
      host: '127.0.0.1',
      port: 8781,
      strictPort: true,
      watch: {
        usePolling: true,
        interval: 500,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100
        }
      },
      hmr: {
        overlay: true
      },
      proxy: {
        '/uploads': { target: proxyTarget, changeOrigin: true },
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        }
      }
    }
  };
});
