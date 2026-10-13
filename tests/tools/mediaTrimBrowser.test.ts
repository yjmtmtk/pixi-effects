// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { colorsAt, chrome } from '../support/videoColors';

const root = resolve(__dirname, '../..');
const media: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/media.mjs')).href);
const fx = (n: string) => join(root, 'tests/fixtures/media', n);

// colors.mp4: second k is one flat colour: red, green, blue, yellow, magenta, cyan; key frames at 0, 2, 4 s.
describe.skipIf(!chrome || process.env.SKIP_BROWSER_TESTS)('trim by copy: what a real browser shows of the cut file', () => {
  it('a cut that starts on a key frame shows the source\'s colours from its first frame (2–4 s: blue, then yellow)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trim-chrome-'));
    try {
      const out = join(dir, 'cut.mp4');
      await media.trimFile({ input: fx('colors.mp4'), start: 2, end: 4, out });
      const r = await colorsAt(out, [0, 0.5, 0.95, 1.05, 1.5, 1.9]);
      expect(Math.abs(r.duration - 2)).toBeLessThan(0.1);
      expect(r.at).toEqual({ 0: 'blue', 0.5: 'blue', 0.95: 'blue', 1.05: 'yellow', 1.5: 'yellow', 1.9: 'yellow' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);

  it('a cut asked to start BETWEEN key frames (3.3 s) starts on the next one (4 s) and shows only that colour (magenta) from its first frame: a plain file with no hidden pre-roll frames', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trim-chrome-'));
    try {
      const out = join(dir, 'cut.mp4');
      const t = await media.trimFile({ input: fx('colors.mp4'), start: 3.3, end: 4.9, out });
      expect(t.actual[0]).toBe(4);
      const r = await colorsAt(out, [0, 0.1, 0.3, 0.5, 0.8]);
      expect(Object.values(r.at)).toEqual(['magenta', 'magenta', 'magenta', 'magenta', 'magenta']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);

  it('the same holds for webm', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'trim-chrome-'));
    try {
      const out = join(dir, 'cut.webm');
      const t = await media.trimFile({ input: fx('colors.webm'), start: 2, end: 4, out });
      expect(t.actual[0]).toBe(2);
      const r = await colorsAt(out, [0.2, 1.5]);
      expect(r.at).toEqual({ 0.2: 'blue', 1.5: 'yellow' });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 60_000);
});
