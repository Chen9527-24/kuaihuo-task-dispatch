import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import Components from 'unplugin-vue-components/vite'
import { VantResolver } from 'unplugin-vue-components/resolvers'
import path from 'path'

function resolveProxyTarget(apiBaseUrl: string) {
  try {
    const url = new URL(apiBaseUrl)
    return url.origin
  } catch {
    return 'http://127.0.0.1:3000'
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const apiBaseUrl = env.VITE_API_BASE_URL || '/api/v1'
  const proxyTarget = env.VITE_API_PROXY_TARGET || resolveProxyTarget(apiBaseUrl)

  return {
    plugins: [
      vue(),
      Components({
        dts: 'src/components.d.ts',
        resolvers: [VantResolver({ importStyle: 'css' })],
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true
        },
        '/uploads': {
          target: proxyTarget,
          changeOrigin: true
        },
      },
    },
  }
})
