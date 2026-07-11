import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist'
  },
  test: {
    // Storage specs need a real IndexedDB; fake-indexeddb is wired in setup.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts']
  }
});
