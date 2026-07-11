import { defineConfig } from 'vite';

// share.usebruno.com — a thin static shell around the @opencollection/docs
// renderer (loaded from the CDN). No framework needed.
export default defineConfig({
  build: {
    outDir: 'dist'
  },
  test: {
    environment: 'node'
  }
});
