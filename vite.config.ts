import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { rapierWasmPlugin } from './scripts/rapierWasmPlugin.ts';

export default defineConfig({
  plugins: [react(), rapierWasmPlugin()],
  build: {
    target: 'es2022',
    sourcemap: false,
    // Split the heavy 3D runtime out of the initial payload. The shell (menu +
    // loader) must stay under the 250KB gzip budget; three/rapier arrive only
    // once the player presses Play.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          // Order matters: @react-three/* paths contain both 'react' and
          // 'three', so the specific cases have to be tested first.
          if (id.includes('rapier')) return 'physics';
          if (id.includes('/three/') || id.includes('postprocessing')) return 'three';
          if (id.includes('@react-three')) return 'r3f';
          if (id.includes('/react') || id.includes('/scheduler')) return 'react';
          return undefined;
        },
      },
    },
  },
  worker: { format: 'es' },
});
