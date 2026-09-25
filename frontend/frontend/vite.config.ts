/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/**
 * El paquete compartido (DTOs, eventos, validaciones Zod) se consume desde su código fuente TypeScript
 * (`cliente/shared/src`), de modo que frontend y backend usan exactamente los mismos contratos
 * sin publicar el paquete ni compilarlo a CommonJS.
 */
const sharedSrc = fileURLToPath(new URL('../cliente/shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@reservas-vuelos/shared': sharedSrc,
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    // zod se resuelve siempre desde node_modules del frontend (el paquete compartido no se instala aparte)
    dedupe: ['zod', 'react', 'react-dom'],
  },
  server: {
    port: 5173,
    host: true,
    fs: { allow: ['..'] },
  },
  preview: { port: 4173, host: true },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@tanstack/react-query', 'socket.io-client', 'zod'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.d.ts'],
    },
  },
});
