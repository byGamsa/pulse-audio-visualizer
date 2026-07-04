import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Tauri braucht einen festen Port
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  // three.js allein hat ~700 kB
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
});
