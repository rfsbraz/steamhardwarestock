import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// These files build the site into os.tmpdir()/shs-dist-*. Run them against an empty TMPDIR
// and check that nothing they created is left behind.
const BUILD_TESTS = ['affiliate', 'analytics', 'go-redirects', 'jsaux-feed'].map((f) => `test/${f}.test.mjs`);

test('build tests remove their shs-dist-* folders and fixtures', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'shs-cleanup-'));
  // Drop NODE_TEST_CONTEXT so the child runs as its own test run, not as a subtest of this one.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  try {
    execFileSync(process.execPath, ['--test', ...BUILD_TESTS], { cwd: root, env: { ...env, TMPDIR: tmp }, stdio: 'pipe' });
    assert.deepEqual(readdirSync(tmp).filter((f) => f.startsWith('shs-dist-')), []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
