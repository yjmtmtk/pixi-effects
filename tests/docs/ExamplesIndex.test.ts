// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const { examples } = JSON.parse(readFileSync(resolve(root, 'examples/examples.json'), 'utf8')) as { examples: Array<{ id: string; file: string; title: string; blurb: string }> };

describe('examples/examples.json (the Examples entrance)', () => {
  it('lists every numbered example file, in order, and nothing that is missing', () => {
    const files = readdirSync(resolve(root, 'examples')).filter((f) => /^\d\d-.*\.html$/.test(f)).sort();
    expect(examples.filter((e) => /^\d\d$/.test(e.id)).map((e) => e.file)).toEqual(files);
    for (const e of examples) expect(existsSync(resolve(root, 'examples', e.file)), e.file).toBe(true);
  });
  it('every entry has a title and a one-line blurb', () => {
    for (const e of examples) { expect(e.title.length, e.file).toBeGreaterThan(0); expect(e.blurb.length, e.file).toBeGreaterThan(10); }
  });
  it('the index page shows every entry (run `npm run site:sync` after editing the list)', () => {
    const html = readFileSync(resolve(root, 'examples/index.html'), 'utf8');
    for (const e of examples) expect(html, e.file).toContain(`href="${e.file}"`);
  });
});
