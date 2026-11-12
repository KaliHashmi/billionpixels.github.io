// Relays the published UAT app to http://127.0.0.1:<port>, so the browser tests can run against the live site.
//   node e2e/live-proxy.mjs [port]        (used by playwright.live.config.ts)
// The tests open addresses such as /moves; the live app lives under /billionpixels.github.io/hisab-uat/,
// so those are redirected there. Everything under /billionpixels.github.io/ is fetched from GitHub Pages as is.
import { createServer } from 'node:http';

const ORIGIN = process.env.LIVE_ORIGIN ?? 'https://kalihashmi.github.io';
const SITE = '/billionpixels.github.io';
const APP = `${SITE}/hisab-uat`;
const port = Number(process.argv[2] ?? 4180);

createServer(async (req, res) => {
  try {
    if (!req.url.startsWith(`${SITE}/`)) {
      res.writeHead(302, { location: APP + (req.url === '/' ? '/' : req.url) });
      return res.end();
    }
    const upstream = await fetch(ORIGIN + req.url, { headers: { 'cache-control': 'no-cache' } });
    const body = Buffer.from(await upstream.arrayBuffer());
    // GitHub Pages answers deep links with 404.html, which starts the app; the browser only needs the page.
    res.writeHead(upstream.status === 404 ? 200 : upstream.status, { 'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end(String(e));
  }
}).listen(port, '127.0.0.1', () => console.log(`Live UAT relayed at http://127.0.0.1:${port}`));
