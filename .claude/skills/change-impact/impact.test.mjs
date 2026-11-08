// node --test <scripts folder>/impact.test.mjs (part of npm run verify)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affected, aliasesOf, importsOf, reverseGraph, routeOf } from './impact.mjs';

const FILES = {
  '/p/src/ui/theme.ts': '',
  '/p/src/ui/components.tsx': "import { colors } from './theme';",
  '/p/src/domain/engine/index.ts': '',
  '/p/src/app/scan.tsx': "import { Button } from '../ui/components';\nimport x from '../domain/engine';\nimport React from 'react';",
  '/p/src/app/(tabs)/index.tsx': "import { colors } from '@/ui/theme';",
  '/p/__tests__/a.test.ts': "const x = require('../src/domain/engine');",
};
const opts = { exists: (p) => p in FILES, read: (p) => FILES[p], aliases: [['@/', '/p/src/']] };

test('imports resolve to project files: relative, folder index, alias and require; packages are ignored', () => {
  assert.deepEqual(importsOf('/p/src/app/scan.tsx', FILES['/p/src/app/scan.tsx'], opts), ['/p/src/ui/components.tsx', '/p/src/domain/engine/index.ts']);
  assert.deepEqual(importsOf('/p/src/app/(tabs)/index.tsx', FILES['/p/src/app/(tabs)/index.tsx'], opts), ['/p/src/ui/theme.ts']);
  assert.deepEqual(importsOf('/p/__tests__/a.test.ts', FILES['/p/__tests__/a.test.ts'], opts), ['/p/src/domain/engine/index.ts']);
});

test('a change reaches every file that uses it, directly or through another file', () => {
  const users = reverseGraph(Object.keys(FILES), opts);
  assert.deepEqual(affected(users, ['/p/src/ui/theme.ts']).sort(), ['/p/src/app/(tabs)/index.tsx', '/p/src/app/scan.tsx', '/p/src/ui/components.tsx']);
  assert.deepEqual(affected(users, ['/p/src/domain/engine/index.ts']).sort(), ['/p/__tests__/a.test.ts', '/p/src/app/scan.tsx']);
  assert.deepEqual(affected(users, ['/p/src/app/scan.tsx']), []);
});

test('tsconfig path aliases are read, comments allowed', () => {
  assert.deepEqual(aliasesOf('{ // c\n "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }', '/p'), [['@/', '/p/src/']]);
  assert.deepEqual(aliasesOf('{ "compilerOptions": {} }', '/p'), []);
  assert.deepEqual(aliasesOf('not json', '/p'), []);
});

test('screens are named by their address in the app', () => {
  assert.equal(routeOf('src/app/(tabs)/index.tsx', 'src/app'), '/');
  assert.equal(routeOf('src/app/(tabs)/vendors.tsx', 'src/app'), '/vendors');
  assert.equal(routeOf('app/(app)/admin/employees/[id].tsx', 'app'), '/admin/employees/[id]');
  assert.equal(routeOf('src/app/moves/index.tsx', 'src/app'), '/moves');
  assert.equal(routeOf('src/app/_layout.tsx', 'src/app'), undefined);
  assert.equal(routeOf('app/+not-found.tsx', 'app'), undefined);
  assert.equal(routeOf('src/ui/theme.ts', 'src/app'), undefined);
  assert.equal(routeOf('src/ui/theme.ts', undefined), undefined);
});
