import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Where the site is published. Link previews (WhatsApp and others) need the full address of the preview image.
// At launch, build with the real domain: SITE_URL=https://example.com/ npm run build
const SITE_URL = process.env.SITE_URL ?? 'https://kalihashmi.github.io/billionpixels.github.io/futurex/';

// `npm run build`: the real site (GitHub Pages now, Cloudflare Pages at launch), files kept separate.
// `npm run build:preview`: the private preview, with fonts and images inlined.
export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react(), { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', SITE_URL) }],
  build: {
    assetsInlineLimit: mode === 'preview' ? 50_000_000 : 4096,
    cssCodeSplit: false,
    sourcemap: false,
  },
}));
