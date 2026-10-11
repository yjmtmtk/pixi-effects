// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// docs/api-surface.txt is the public surface (every export of every entry, the DSL keys of every layer) read from the sources. A change to it is a decision:
// look at the diff, then `node scripts/api-surface.mjs --write`. (A renamed or removed name breaks somebody's file: say so in the CHANGELOG.)
const root = resolve(__dirname, '../..');
const { surface }: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'scripts/api-surface.mjs')).href);

describe('the public surface', () => {
  it('docs/api-surface.txt is up to date (run `node scripts/api-surface.mjs --write` and read the diff)', async () => {
    const now: string = await surface();
    const kept = readFileSync(join(root, 'docs/api-surface.txt'), 'utf8');
    expect(now === kept, 'the public surface changed: node scripts/api-surface.mjs --write, then read git diff docs/api-surface.txt').toBe(true);
  }, 60000);

  it('lists the four entries and the DSL tables', async () => {
    const kept = readFileSync(join(root, 'docs/api-surface.txt'), 'utf8');
    for (const h of ['== pixi-effects ==', '== pixi-effects/controller ==', '== pixi-effects/present ==', '== pixi-effects/three ==', '== DSL (the runtime tables) ==']) expect(kept).toContain(h);
    expect(kept).toMatch(/^class Movie$/m);
    expect(kept).toMatch(/^  playUntil\(/m);
    expect(kept).toMatch(/^filter types: chromaKey custom .*\bblur noise alpha colorMatrix grain warp adjustment\b/m);       // the runtime filter tables, in full
  });
});
