// node --test scripts/impact.test.mjs (part of npm run verify)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { affected, importsOf, reverseGraph, routeOf } from './impact.mjs';

const FILES = {
  '/p/src/ui/theme.ts': '',
  '/p/src/ui/components.tsx': "import { colors } from './theme';",
  '/p/src/domain/engine/index.ts': '',
  '/p/src/app/scan.tsx': "import { Button } from '../ui/components';\nimport x from '../domain/engine';",
  '/p/src/app/(tabs)/index.tsx': "import { colors } from '../../ui/theme';",
  '/p/__tests__/a.test.ts': "import { x } from '../src/domain/engine';",
};
const exists = (p) => p in FILES;
const read = (p) => FILES[p];

test('imports resolve to files, including folder index files', () => {
  assert.deepEqual(importsOf('/p/src/app/scan.tsx', FILES['/p/src/app/scan.tsx'], exists), ['/p/src/ui/components.tsx', '/p/src/domain/engine/index.ts']);
});

test('a change reaches every file that uses it, directly or through another file', () => {
  const users = reverseGraph(Object.keys(FILES), read, exists);
  assert.deepEqual(affected(users, ['/p/src/ui/theme.ts']).sort(), ['/p/src/app/(tabs)/index.tsx', '/p/src/app/scan.tsx', '/p/src/ui/components.tsx']);
  assert.deepEqual(affected(users, ['/p/src/domain/engine/index.ts']).sort(), ['/p/__tests__/a.test.ts', '/p/src/app/scan.tsx']);
  assert.deepEqual(affected(users, ['/p/src/app/scan.tsx']), []);
});

test('screens are named by their address in the app', () => {
  assert.equal(routeOf('src/app/(tabs)/index.tsx'), '/');
  assert.equal(routeOf('src/app/(tabs)/vendors.tsx'), '/vendors');
  assert.equal(routeOf('src/app/moves/[id].tsx'), '/moves/[id]');
  assert.equal(routeOf('src/app/moves/index.tsx'), '/moves');
  assert.equal(routeOf('src/app/_layout.tsx'), undefined);
  assert.equal(routeOf('src/ui/theme.ts'), undefined);
});
