import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // github pages serves the site from /DokanKhata/, the workflow sets PAGES_BASE for that build
  base: process.env.PAGES_BASE ?? '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    // send /api to the API so it's the same origin and the login cookie just works
    proxy: { '/api': 'http://localhost:3001' },
  },
});
