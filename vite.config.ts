import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build --mode single` inlines everything (code, fonts, voice clips) into one
// self-contained HTML file, which is what gets published as the playable intro.
export default defineConfig(({ mode }) => ({
  base: './',
  server: { host: '127.0.0.1', port: 5173 },
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    assetsInlineLimit: mode === 'single' ? 100_000_000 : 4096,
    chunkSizeWarningLimit: 4000,
  },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));
