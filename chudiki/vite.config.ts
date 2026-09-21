import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'phone-keep-alive',
      configureServer(server) {
        server.httpServer?.on('listening', () => {
          const httpServer = server.httpServer;
          if (!httpServer) return;
          httpServer.keepAliveTimeout = 120_000;
          httpServer.headersTimeout = 125_000;
          httpServer.requestTimeout = 0;
          httpServer.timeout = 0;
        });
      },
      configurePreviewServer(server) {
        server.httpServer?.on('listening', () => {
          const httpServer = server.httpServer;
          if (!httpServer) return;
          httpServer.keepAliveTimeout = 120_000;
          httpServer.headersTimeout = 125_000;
          httpServer.requestTimeout = 0;
          httpServer.timeout = 0;
        });
      },
    },
  ],
  base: process.env.VITE_BASE || '/',
  server: {
    host: '0.0.0.0',
    port: 5178,
    strictPort: true,
    allowedHosts: true,
    hmr: false,
    watch: {
      ignored: ['**/public/models/**', '**/*.glb'],
    },
    proxy: {
      '/api/zoo': {
        target: process.env.VITE_API_PROXY || 'http://127.0.0.1:8010',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/zoo/, ''),
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 5178,
    strictPort: true,
    allowedHosts: true,
  },
});
