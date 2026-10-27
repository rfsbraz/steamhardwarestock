import { after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Every temp path a test file makes lives under one folder that is removed after the
// file's tests, pass or fail. TMPDIR points there too, so sibling fixtures, child
// processes and code under test that calls os.tmpdir() stay inside it.
const root = mkdtempSync(path.join(os.tmpdir(), 'shs-test-'));
process.env.TMPDIR = root;
after(() => rmSync(root, { recursive: true, force: true }));

export function tmpDir(prefix) {
  return mkdtempSync(path.join(root, prefix));
}
