import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const serverPort = Number(process.env.SWARM_PORT ?? 4317);
// strictPort: a second office must fail loudly, not quietly take the next port while proxying to this SWARM_PORT.
const clientPort = Number(process.env.SWARM_CLIENT_PORT || 5317);

export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: {
    port: clientPort,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${serverPort}`,
      '/ws': {
        target: `ws://127.0.0.1:${serverPort}`,
        ws: true,
        changeOrigin: true,
        configure: (proxy) => proxy.on('proxyReqWs', (proxyReq) => {
          // The office validates its own Host and Origin port; Vite otherwise forwards the browser's client port.
          proxyReq.setHeader('Origin', `http://127.0.0.1:${serverPort}`);
        }),
      },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
});
