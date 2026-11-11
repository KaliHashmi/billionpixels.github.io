import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run build`: the real site (Cloudflare Pages), files kept separate.
// `npm run build:preview`: the private preview, with fonts and images inlined.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  build: {
    assetsInlineLimit: mode === 'preview' ? 50_000_000 : 4096,
    cssCodeSplit: false,
    sourcemap: false,
  },
}));
