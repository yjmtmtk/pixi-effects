// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

describe('check.sampleFrames', () => {
  const base = { frameRate: 30, totalFrames: 300 };
  it('has the first and last frame, every scene\'s first and last frame, and a frame every 0.25 s', () => {
    const f = check.sampleFrames({ ...base, scenes: [{ start: 1, end: 4 }, { start: 4, end: 10 }] });
    for (const need of [0, 300, 30, 119, 120, 299]) expect(f, String(need)).toContain(need);
    expect(f).toContain(Math.round(0.25 * 30)); expect(f).toContain(Math.round(5.75 * 30));
    expect([...f]).toEqual([...new Set(f)].sort((a: number, b: number) => a - b));
  });
  it('never more than cap frames; a long movie widens the grid but keeps the scene edges', () => {
    const f = check.sampleFrames({ frameRate: 30, totalFrames: 30 * 600, scenes: Array.from({ length: 20 }, (_, i) => ({ start: i * 30, end: i * 30 + 30 })), cap: 240 });
    expect(f.length).toBeLessThanOrEqual(240);
    expect(f).toContain(30 * 30 - 1);
  });
  it('a scene end is the last frame inside it, not the first one after it', () => {
    expect(check.sampleFrames({ ...base, scenes: [{ start: 0, end: 5 }] })).toContain(149);
  });
});

describe('check.resolveAtList', () => {
  const ctx = { frameRate: 30, totalFrames: 300, duration: 10, rows: [{ name: 'title', start: 2, end: 6 }, { name: 'logo', start: 6, end: 9 }] };
  it('seconds, percent, frames and layer@start|mid|end', () => {
    expect(check.resolveAtList('3.5, 50%, f120, title@end, logo@mid, title@start', ctx).map((x: any) => x.frame)).toEqual([105, 150, 120, 179, 225, 60]);
  });
  it('a layer folded into a family row (pop-# ×4) is still addressed by its own name', () => {
    const rows = [{ name: 'title', start: 0, end: 10 }, { name: 'pop-# ×4', start: 1, end: 6, parts: [{ start: 1, end: 2 }, { start: 2, end: 3 }, { start: 3, end: 4 }, { start: 5, end: 6 }], partNames: ['pop-1', 'pop-2', 'pop-3', 'pop-4'] }];
    expect(check.resolveAtList('pop-3@end,pop-4@start', { ...ctx, rows }).map((x: any) => x.frame)).toEqual([119, 150]);
  });
  it('labels are readable and unique (they become file names)', () => {
    const l = check.resolveAtList('3.5,title@end', ctx).map((x: any) => x.label);
    expect(l).toEqual(['3.50s', 'title-end']);
    expect(check.resolveAtList('3.5,3.5', ctx).map((x: any) => x.label)).toEqual(['3.50s', '3.50s-2']);
  });
  it('labels are safe as file names: a layer called "a/b" or "x:y" does not make a folder or an illegal name', () => {
    const ctx2 = { ...ctx, rows: [{ name: 'a/b', start: 1, end: 3 }, { name: 'x:y*z', start: 3, end: 5 }] };
    expect(check.resolveAtList('a/b@end,x:y*z@start', ctx2).map((x: any) => x.label)).toEqual(['a-b-end', 'x-y-z-start']);
  });
  it('says what it could not read', () => {
    expect(() => check.resolveAtList('nope@end', ctx)).toThrow(/no layer named "nope".*title.*logo/s);
    expect(() => check.resolveAtList('banana', ctx)).toThrow(/cannot read "banana".*3\.5.*50%.*f120.*name@end/s);
    expect(() => check.resolveAtList('99', ctx)).toThrow(/past the end/);
  });
});

describe('scenes: check.mjs and the library agree on what a scene is', () => {
  it('named top-level COMPOSITIONS of a second or more; not other layers (a 61-layer film has no 61 scenes), nested ones, automatic names, folded runs, or short ones', async () => {
    const { namedScenes } = await import('../../src/core/scenes');
    const rows = [
      { name: 'intro', type: 'composition', start: 0, end: 3, depth: 0 }, { name: 'text#2', type: 'composition', start: 0, end: 9, depth: 0 },
      { name: 'blip', type: 'composition', start: 1, end: 1.5, depth: 0 }, { name: 'inner', type: 'composition', start: 1, end: 3, depth: 1 },
      { name: 'outro', type: 'composition', start: 3, end: 9, depth: 0 }, { name: 'snow-# ×130', type: 'composition', start: 0, end: 9, depth: 0 },
      { name: 'title', type: 'text', start: 0, end: 9, depth: 0 }, { name: 'bgm', type: 'audio', start: 0, end: 9, depth: 0 }, { name: 'cam', type: 'camera', start: 0, end: 9, depth: 0 },
    ];
    const expected = [{ name: 'intro', start: 0, end: 3 }, { name: 'outro', start: 3, end: 9 }];
    expect(namedScenes(rows)).toEqual(expected);
    expect(check.scenesOf(rows)).toEqual(expected);
  });
});

describe('check.parseArgs: --query (a page that reads its address, as in the batch recipe)', () => {
  it('is added to the page address; a leading ? is allowed; none by default', () => {
    expect(check.parseArgs(['p.html']).query).toBeNull();
    expect(check.parseArgs(['p.html', '--query', 'name=Aiko&score=92']).query).toBe('name=Aiko&score=92');
    expect(check.parseArgs(['p.html', '--query', '?a=1']).query).toBe('a=1');
  });
});

describe('check.parseArgs: --at, --draft, --onion', () => {
  it('reads them, with the old defaults when absent', () => {
    expect(check.parseArgs(['p.html'])).toMatchObject({ at: null, draft: false, onion: null });
    expect(check.parseArgs(['p.html', '--at', '3,title@end', '--draft', '--onion', '1:3'])).toMatchObject({ at: '3,title@end', draft: true, onion: [1, 3] });
    expect(() => check.parseArgs(['p.html', '--onion', '3'])).toThrow(/--onion must look like 1:3/);
  });
});
