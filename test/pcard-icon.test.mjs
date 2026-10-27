import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Steam's Steam Deck artwork is a white logo on a transparent background.
// The status cards need the same dark tile as the other product icons, or
// the logo vanishes on the light theme surface.
test('status card icons sit on the Steam navy tile in every theme', () => {
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const rule = css.match(/\n\.pcard img\s*\{([^}]*)\}/);
  assert.ok(rule, '.pcard img rule');
  assert.match(rule[1], /background:\s*#1b2838\s*;/);
});
