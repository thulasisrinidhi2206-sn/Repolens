import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPrebuiltViteOutput } from '../src/services/preview-build-mode';

test('detects a prebuilt Vite dist entry point', () => {
  assert.equal(hasPrebuiltViteOutput(['package.json', 'src/main.tsx', 'dist/index.html']), true);
});

test('detects dist entry point case-insensitively and with Windows separators', () => {
  assert.equal(hasPrebuiltViteOutput(['DIST\\INDEX.HTML']), true);
});

test('does not mistake source index.html for prebuilt output', () => {
  assert.equal(hasPrebuiltViteOutput(['index.html', 'src/main.tsx']), false);
});

test('does not treat a Vite source project without dist output as prebuilt', () => {
  assert.equal(hasPrebuiltViteOutput(['package.json', 'vite.config.ts', 'src/main.tsx']), false);
});
