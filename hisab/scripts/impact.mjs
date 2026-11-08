#!/usr/bin/env node
// "What does this change affect?": before a push, list every screen, shared file and test that uses the
// changed files, worked out from the imports in the code itself. Exact and offline: no AI, no map to keep
// up to date. Works in any JavaScript / TypeScript project (Expo Router screens are named by their address).
// Master copy: .claude/skills/change-impact/impact.mjs. Projects copy it into their scripts folder.
//
//   npm run impact                       uncommitted changes (or, if there are none, the last commit)
//   npm run impact -- --since <git ref>  everything changed since that commit or branch
//   npm run impact -- src/ui/theme.ts    these files
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The project folder: the one above the folder this script is in.
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.web.ts', '.web.tsx', '.native.ts', '.native.tsx', '/index.ts', '/index.tsx', '/index.js'];
// Translation files are used by every screen but only hold text; their own tests check them.
const TEXT_ONLY = /(^|\/)(i18n|locales?|translations?)\/[a-z]{2}(-[A-Za-z]{2})?\.(ts|js|json)$|(^|\/)strings\.[a-z]{2}\.(ts|js)$/;
const UNIT_TEST = /(^|\/)__tests__\/|\.test\.[jt]sx?$/;
const BROWSER_TEST = /(^|\/)(e2e|tests?)\/.*\.spec\.[jt]sx?$/;

const isDirectory = (p) => existsSync(p) && statSync(p).isDirectory();

/** Path aliases from tsconfig.json, e.g. "@/*": ["./src/*"] → [['@/', '<root>/src/']]. */
export function aliasesOf(tsconfigText, root) {
  try {
    const json = JSON.parse(tsconfigText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'])\/\/.*$/gm, '$1').replace(/,(\s*[}\]])/g, '$1'));
    return Object.entries(json.compilerOptions?.paths ?? {}).map(([from, to]) => [from.replace(/\*$/, ''), resolve(root, json.compilerOptions?.baseUrl ?? '.', String(to[0]).replace(/\*$/, '')) + (String(to[0]).endsWith('/*') ? '/' : '')]);
  } catch {
    return [];
  }
}

/** The project files one file imports (relative paths and aliases; packages are ignored). */
export function importsOf(file, source, { exists = existsSync, aliases = [] } = {}) {
  const out = [];
  for (const m of source.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)) {
    const spec = m[1];
    const alias = aliases.find(([from]) => spec.startsWith(from));
    const base = spec.startsWith('.') ? resolve(dirname(file), spec) : alias ? alias[1] + spec.slice(alias[0].length) : null;
    if (!base) continue;
    const hit = EXTENSIONS.map((e) => base + e).find((p) => exists(p) && !isDirectory(p));
    if (hit) out.push(hit);
  }
  return out;
}

/** Who imports whom, reversed: file → the files that import it. */
export function reverseGraph(files, { read = (f) => readFileSync(f, 'utf8'), ...opts } = {}) {
  const users = new Map();
  for (const f of files) {
    for (const dep of importsOf(f, read(f), opts)) {
      if (!users.has(dep)) users.set(dep, new Set());
      users.get(dep).add(f);
    }
  }
  return users;
}

/** Every file that uses the changed files, directly or through other files. */
export function affected(users, changed) {
  const seen = new Set();
  const queue = [...changed];
  while (queue.length) {
    for (const u of users.get(queue.shift()) ?? []) {
      if (!seen.has(u) && !changed.includes(u)) {
        seen.add(u);
        queue.push(u);
      }
    }
  }
  return [...seen];
}

/** Expo Router: app/moves/[id].tsx → /moves/[id]; app/(tabs)/index.tsx → /. Layouts and special files are not screens. */
export function routeOf(rel, routeDir) {
  if (!routeDir || !rel.startsWith(routeDir + '/')) return undefined;
  const m = /^(.+)\.[jt]sx?$/.exec(rel.slice(routeDir.length + 1));
  if (!m || /(^|\/)(_layout|\+[a-z-]+)$/.test(m[1]) || /\+api$/.test(m[1]) || /(^|\/)__tests__\//.test(m[1])) return undefined;
  return '/' + m[1].replace(/\([^)]+\)\/?/g, '').replace(/\/?index$/, '');
}

function main() {
  const args = process.argv.slice(2);
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const top = git('rev-parse', '--show-toplevel')[0];
  const rel = (p) => relative(ROOT, p);

  let changed;
  const since = args.indexOf('--since');
  if (since >= 0) changed = git('diff', '--name-only', args[since + 1], '--', '.').map((p) => join(top, p));
  else if (args.length) changed = args.map((a) => resolve(process.cwd(), a));
  else {
    changed = [...git('diff', '--name-only', 'HEAD', '--', '.'), ...git('ls-files', '--others', '--exclude-standard', '--full-name', '--', '.')].map((p) => join(top, p));
    if (!changed.length) changed = git('diff', '--name-only', 'HEAD~1', 'HEAD', '--', '.').map((p) => join(top, p));
  }
  changed = [...new Set(changed)].filter((p) => p.startsWith(ROOT + '/'));
  if (!changed.length) return console.log('No changes.');

  const files = git('ls-files', '--cached', '--others', '--exclude-standard')
    .filter((f) => CODE.test(f) && !/(^|\/)node_modules\//.test(f))
    .map((f) => join(ROOT, f))
    .filter((f) => existsSync(f));
  const tsconfig = join(ROOT, 'tsconfig.json');
  const aliases = existsSync(tsconfig) ? aliasesOf(readFileSync(tsconfig, 'utf8'), ROOT) : [];
  const users = reverseGraph(files, { aliases });
  const routeDir = ['src/app', 'app'].find((d) => isDirectory(join(ROOT, d)));

  const changedRel = changed.map(rel);
  const text = changedRel.filter((f) => TEXT_ONLY.test(f));
  // A platform file (storage.web.ts) is imported under its plain name.
  const keys = changed.filter((f) => !TEXT_ONLY.test(rel(f))).flatMap((f) => [f, f.replace(/\.(web|native|ios|android)\.([jt]sx?)$/, '.$2')]);
  const hit = affected(users, keys).map(rel).sort();
  const all = [...changedRel, ...hit];

  const allScreens = files.map(rel).map((f) => routeOf(f, routeDir)).filter((r) => r !== undefined);
  const screens = [...new Set(all.map((f) => routeOf(f, routeDir)).filter((r) => r !== undefined))].sort();
  const shared = hit.filter((f) => routeOf(f, routeDir) === undefined && !UNIT_TEST.test(f) && !BROWSER_TEST.test(f));
  const unitTests = [...new Set(all.filter((f) => UNIT_TEST.test(f)))].sort();
  const browserTests = files
    .map(rel)
    .filter((f) => BROWSER_TEST.test(f))
    .filter((f) => changedRel.includes(f) || screens.some((r) => r !== '/' && readFileSync(join(ROOT, f), 'utf8').includes(`'${r.replace(/\/\[[^\]]+\].*$/, '')}`)));
  const everyScreen = allScreens.length > 0 && screens.length >= 0.8 * allScreens.length;

  const list = (title, items, note = '') => {
    console.log(`\n${title} (${items.length})${note}:`);
    for (const i of items) console.log(`  ${i}`);
  };
  list('Changed', changedRel);
  if (text.length) console.log(`  (translations only: ${text.join(', ')} — not followed, checked by the translation tests)`);
  if (routeDir) list('Screens affected', everyScreen ? [] : screens, everyScreen ? ': almost every screen (a core file changed)' : '');
  list('Shared code that uses it', shared);
  list('Unit tests that cover it', unitTests);
  list('Browser tests for those screens', browserTests);
  const code = changedRel.some((f) => CODE.test(f) && !TEXT_ONLY.test(f) && !UNIT_TEST.test(f) && !BROWSER_TEST.test(f));
  if (code && !unitTests.length && !browserTests.length) console.log('\nNo test covers these files: check them by hand, or add a test.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
