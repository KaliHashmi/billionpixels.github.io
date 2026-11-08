#!/usr/bin/env node
// "What does this change affect?": before a push, list every screen, shared feature and test that uses
// the changed files, worked out from the imports in the code itself. Exact and offline: no AI, no map to
// keep up to date.
//
//   npm run impact                       uncommitted changes (or, if there are none, the last commit)
//   npm run impact -- --since <git ref>  everything changed since that commit or branch
//   npm run impact -- src/ui/theme.ts    these files
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = /\.(ts|tsx|mjs|js)$/;
const TEXT_ONLY = ['src/i18n/ar.ts'];
const EXTENSIONS = ['', '.ts', '.tsx', '.web.ts', '.web.tsx', '/index.ts', '/index.tsx'];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (CODE.test(name)) out.push(p);
  }
  return out;
}

const isDirectory = (p) => existsSync(p) && statSync(p).isDirectory();

/** Relative imports (and requires) of one file, as files of the project. */
export function importsOf(file, source, exists = existsSync) {
  const out = [];
  for (const m of source.matchAll(/(?:from|import|require)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const base = resolve(dirname(file), m[1]);
    const hit = EXTENSIONS.map((e) => base + e).find((p) => exists(p) && !isDirectory(p));
    if (hit) out.push(hit);
  }
  return out;
}

/** Who imports whom, reversed: file → the files that import it. */
export function reverseGraph(files, read = (f) => readFileSync(f, 'utf8'), exists = existsSync) {
  const users = new Map();
  for (const f of files) {
    for (const dep of importsOf(f, read(f), exists)) {
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
    const f = queue.shift();
    for (const u of users.get(f) ?? []) {
      if (!seen.has(u) && !changed.includes(u)) {
        seen.add(u);
        queue.push(u);
      }
    }
  }
  return [...seen];
}

/** src/app/moves/[id].tsx → /moves/[id]; src/app/(tabs)/index.tsx → / */
export function routeOf(rel) {
  const m = /^src\/app\/(.+)\.tsx?$/.exec(rel);
  if (!m || /(^|\/)_layout$/.test(m[1])) return undefined;
  return '/' + m[1].replace(/\([^)]+\)\/?/g, '').replace(/\/?index$/, '');
}

function changedFiles(args) {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const since = args.indexOf('--since');
  let list;
  if (since >= 0) list = git('diff', '--name-only', args[since + 1], '--', '.');
  else if (args.length) return args.map((a) => resolve(process.cwd(), a));
  else {
    list = [...git('diff', '--name-only', 'HEAD', '--', '.'), ...git('ls-files', '--others', '--exclude-standard', '--full-name', '--', '.')];
    if (!list.length) list = git('diff', '--name-only', 'HEAD~1', 'HEAD', '--', '.');
  }
  return [...new Set(list)].map((p) => join(top, p)).filter((p) => p.startsWith(ROOT + '/'));
}

function main() {
  const rel = (p) => relative(ROOT, p);
  const changed = changedFiles(process.argv.slice(2));
  if (!changed.length) {
    console.log('No changes.');
    return;
  }
  const code = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, '__tests__'))];
  const users = reverseGraph(code);
  // A platform file (storage.web.ts) is imported under its plain name. The Arabic translations are used by
  // every screen but only add text: they are checked by __tests__/i18n.test.ts, so they do not count here.
  const keys = changed.filter((f) => !TEXT_ONLY.includes(rel(f))).flatMap((f) => [f, f.replace(/\.web\.(tsx?)$/, '.$1')]);
  const hit = affected(users, keys).map(rel).sort();
  const changedRel = changed.map(rel);

  const screens = [...new Set([...changedRel, ...hit].map(routeOf).filter((r) => r !== undefined))].sort();
  const shared = hit.filter((f) => f.startsWith('src/') && !f.startsWith('src/app/'));
  const unitTests = [...changedRel, ...hit].filter((f) => f.startsWith('__tests__/')).sort();
  const e2e = walk(join(ROOT, 'e2e'))
    .filter((f) => f.endsWith('.spec.ts'))
    .filter((f) => {
      const text = readFileSync(f, 'utf8');
      return screens.some((r) => r !== '/' && text.includes(`'${r.replace(/\/\[[^\]]+\].*$/, '')}`));
    })
    .map(rel);
  const allScreens = walk(join(ROOT, 'src/app')).map(rel).map(routeOf).filter((r) => r !== undefined);
  const touchesEveryScreen = screens.length >= 0.8 * allScreens.length;

  console.log(`Changed (${changedRel.length}):`);
  for (const f of changedRel) console.log(`  ${f}`);
  console.log(`\nScreens affected (${screens.length})${touchesEveryScreen ? ': almost every screen (a core file changed)' : ''}:`);
  if (!touchesEveryScreen) for (const r of screens) console.log(`  ${r}`);
  console.log(`\nShared code that uses it (${shared.length}):`);
  for (const f of shared) console.log(`  ${f}`);
  console.log(`\nUnit tests that cover it (${unitTests.length}):`);
  for (const f of unitTests) console.log(`  ${f}`);
  console.log(`\nBrowser tests for those screens (${e2e.length}), plus e2e/smoke.spec.ts (opens every screen):`);
  for (const f of e2e) console.log(`  ${f}`);
  const untested = changedRel.some((f) => /^src\/.*\.tsx?$/.test(f)) && unitTests.length === 0 && e2e.length === 0;
  if (untested) console.log('\nNo test covers these files directly: check them by hand or add a test.');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
