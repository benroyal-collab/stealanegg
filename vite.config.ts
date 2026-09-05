import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: false,
    // Split the heavy 3D runtime out of the initial payload. The shell (menu +
    // loader) must stay under the 250KB gzip budget; three/rapier arrive only
    // once the player presses Play.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('rapier')) return 'physics';
            if (id.includes('three') || id.includes('postprocessing')) return 'three';
            if (id.includes('react')) return 'react';
          }
          return undefined;
        },
      },
    },
  },
  worker: { format: 'es' },
});
