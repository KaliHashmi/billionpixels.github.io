// Checks every store text in docs/STORE_LISTING.md against its limit (<!-- field: name max N --> above it).
//   node scripts/listing-lengths.mjs
import { readFileSync } from 'node:fs';
const text = readFileSync(new URL('../docs/STORE_LISTING.md', import.meta.url), 'utf8');
const re = /<!-- field: (\S+) max (\d+) -->\n([\s\S]*?)(?=\n<!-- field:|\n### |\n## |\n---)/g;
let bad = 0;
for (const [, name, max, body] of text.matchAll(re)) {
  const value = body.trim();
  if (value.startsWith('(Use ')) continue;
  const n = [...value].length;
  const ok = n <= Number(max);
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'TOO LONG'} ${name}: ${n}/${max}`);
}
process.exit(bad ? 1 : 0);
