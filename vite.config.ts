import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // three.js allein hat ~700 kB
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
});
