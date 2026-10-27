import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpDir } from './helpers/tmp.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OTHER_TESTS = readdirSync(path.join(root, 'test'))
  .filter((f) => f.endsWith('.test.mjs') && f !== path.basename(fileURLToPath(import.meta.url)))
  .map((f) => `test/${f}`);

test('the test suite leaves nothing behind in TMPDIR', () => {
  const tmp = tmpDir('shs-cleanup-');
  // Drop NODE_TEST_CONTEXT so the child runs as its own test run, not as a subtest of this one.
  const { NODE_TEST_CONTEXT, ...env } = process.env;
  execFileSync(process.execPath, ['--test', ...OTHER_TESTS], { cwd: root, env: { ...env, TMPDIR: tmp }, stdio: 'pipe' });
  assert.deepEqual(readdirSync(tmp), []);
});
