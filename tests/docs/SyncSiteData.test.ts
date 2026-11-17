// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
// @ts-expect-error plain ESM script without types
import { dataErrors } from '../../scripts/sync-site.mjs';

// sync-site writes the samples and the gallery into the pages; a bad entry used to drop its card without a word. Now it stops and says why.
const root = resolve(__dirname, '../..');

describe('sync-site checks the data it writes', () => {
  it('the repository\'s samples and gallery are fine', () => {
    expect(dataErrors(root)).toEqual([]);
  });

  it('a bad sample or gallery piece is named, with what is wrong', () => {
    const dir = mkdtempSync(join(tmpdir(), 'syncdata-'));
    try {
      mkdirSync(join(dir, 'site/samples/x'), { recursive: true });
      mkdirSync(join(dir, 'site/gallery'), { recursive: true });
      writeFileSync(join(dir, 'site/samples/samples.json'), JSON.stringify({ samples: [{ id: 'x', kind: 'onee', lang: 'en', title: 't', messages: ['m'], page: 'x.html', poster: 'p.jpg', alt: 'a', minutes: 1, runs: 1, model: 'Claude Opus', version: '1.0.0' }] }));
      writeFileSync(join(dir, 'site/gallery/pieces.json'), JSON.stringify({ pieces: [{ id: 'g', title: '', subtitle: 's', width: 1280, height: 720, page: 'g.html', poster: 'g.jpg' }] }));
      const errors: string[] = dataErrors(dir);
      expect(errors.join('\n')).toMatch(/sample x: kind must be one of/);
      expect(errors.join('\n')).toMatch(/sample x: .*x\.html.* missing/);
      expect(errors.join('\n')).toMatch(/gallery g: title/);
      expect(errors.join('\n')).toMatch(/gallery g: .*g\.html.* missing/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
