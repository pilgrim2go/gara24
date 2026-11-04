import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Khi phát triển: Vite (5173) chuyển tiếp API sang Worker chạy bằng `wrangler dev` (8787).
const api = 'http://localhost:8787';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': api, '/dev': api, '/webhooks': api } },
  build: { outDir: 'dist', sourcemap: true },
});
