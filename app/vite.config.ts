import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const base = env.VITE_APP_BASE_PATH || '/time/';
  const outDir = env.VITE_BUILD_OUT_DIR || '../time';

  return {
    plugins: [react()],
    base,
    build: {
      outDir,
      emptyOutDir: true,
    },
  };
});
