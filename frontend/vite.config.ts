import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build a same-origin development proxy.
 *
 * Browsers attach an Origin header even to many same-origin POST requests.
 * Vite forwards that header by default, so Spring sees `http://localhost:5173`
 * and can still reject the request as CORS even though the browser called the
 * relative `/engine/...` URL. Removing Origin/Referer at the proxy boundary
 * makes this a normal server-to-server request and keeps CORS policy out of the
 * development path. Production should provide the same path prefixes through
 * its reverse proxy.
 */
const backendProxy = (
  target: string,
  rewrite?: (path: string) => string
): ProxyOptions => ({
  target,
  changeOrigin: true,
  secure: false,
  proxyTimeout: 120_000,
  timeout: 120_000,
  rewrite,
  configure(proxy) {
    proxy.on('proxyReq', (proxyReq) => {
      proxyReq.removeHeader('origin');
      proxyReq.removeHeader('referer');
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load all keys so proxy targets can be configured without exposing them to
  // browser code. `VITE_*` remains for backward compatibility with existing
  // local .env files.
  const env = loadEnv(mode, process.cwd(), '');

  const NODE_BACKEND = env.NODE_PROXY_TARGET || env.VITE_NODE_URL || 'http://localhost:8081';
  const ENGINE_BACKEND =
    env.ENGINE_PROXY_TARGET || env.VITE_ENGINE_PROXY_TARGET || env.VITE_ENGINE_URL || 'http://localhost:8080';
  const ENGINE_MONITOR_BACKEND =
    env.ENGINE_MONITOR_PROXY_TARGET ||
    env.VITE_ENGINE_MONITOR_PROXY_TARGET ||
    env.VITE_ENGINE_MONITOR_URL ||
    'http://localhost:8082';
  const OLLAMA_BACKEND =
    env.OLLAMA_PROXY_TARGET || env.VITE_OLLAMA_PROXY_TARGET || env.VITE_OLLAMA_HOST || 'http://127.0.0.1:11434';

  return {
    plugins: [react()],
    assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg', '**/*.svg', '**/*.gif', '**/*.webp'],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
    server: {
      port: Number(env.VITE_DEV_PORT) || 5173,
      strictPort: true,
      proxy: {
        // Node workspace/file API.
        '/api': backendProxy(NODE_BACKEND),

        // Spring automation engine and sibling WAR contexts.
        '/engine': backendProxy(ENGINE_BACKEND),
        '/VulnerabilityScanner': backendProxy(ENGINE_BACKEND),
        '/voice_transcription': backendProxy(ENGINE_BACKEND),

        // The monitor service exposes /api/engine/* at its root. Browser code
        // uses /engine-monitor/api/engine/* so it remains same-origin.
        '/engine-monitor': backendProxy(
          ENGINE_MONITOR_BACKEND,
          (path) => path.replace(/^\/engine-monitor(?=\/|$)/, '') || '/'
        ),

        // Ollama exposes /api/* at its root.
        '/ollama': backendProxy(
          OLLAMA_BACKEND,
          (path) => path.replace(/^\/ollama(?=\/|$)/, '') || '/'
        ),
      },
    },
  };
});
