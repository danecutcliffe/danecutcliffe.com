import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    base: env.VITE_APP_BASE_PATH || '/lease/',
    build: {
      outDir: env.VITE_BUILD_OUT_DIR || '../lease',
      emptyOutDir: true,
    },
  };
});
