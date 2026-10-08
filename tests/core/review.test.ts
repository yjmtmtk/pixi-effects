import { describe, it, expect } from 'vitest';
import { sampleFrames, resolveAtList, groupIssues, splitIssues } from '../../src/core/review';
import { namedScenes } from '../../src/core/scenes';

describe('sampleFrames', () => {
  const base = { frameRate: 30, totalFrames: 300 };
  it('has the first and last frame, every scene\'s first and last frame, and a frame every 0.25 s', () => {
    const f = sampleFrames({ ...base, scenes: [{ start: 1, end: 4 }, { start: 4, end: 10 }] });
    for (const need of [0, 300, 30, 119, 120, 299]) expect(f, String(need)).toContain(need);
    expect(f).toContain(Math.round(0.25 * 30)); expect(f).toContain(Math.round(5.75 * 30));
    expect([...f]).toEqual([...new Set(f)].sort((a: number, b: number) => a - b));
  });
  it('never more than cap frames; a long movie widens the grid but keeps the scene edges', () => {
    const f = sampleFrames({ frameRate: 30, totalFrames: 30 * 600, scenes: Array.from({ length: 20 }, (_, i) => ({ start: i * 30, end: i * 30 + 30 })), cap: 240 });
    expect(f.length).toBeLessThanOrEqual(240);
    expect(f).toContain(30 * 30 - 1);
  });
  it('a scene end is the last frame inside it, not the first one after it', () => {
    expect(sampleFrames({ ...base, scenes: [{ start: 0, end: 5 }] })).toContain(149);
  });
});

describe('resolveAtList', () => {
  const ctx = { frameRate: 30, totalFrames: 300, duration: 10, rows: [{ name: 'title', start: 2, end: 6 }, { name: 'logo', start: 6, end: 9 }] };
  it('seconds, percent, frames and layer@start|mid|end', () => {
    expect(resolveAtList('3.5, 50%, f120, title@end, logo@mid, title@start', ctx).map((x: any) => x.frame)).toEqual([105, 150, 120, 179, 225, 60]);
  });
  it('a layer folded into a family row (pop-# ×4) is still addressed by its own name', () => {
    const rows = [{ name: 'title', start: 0, end: 10 }, { name: 'pop-# ×4', start: 1, end: 6, parts: [{ start: 1, end: 2 }, { start: 2, end: 3 }, { start: 3, end: 4 }, { start: 5, end: 6 }], partNames: ['pop-1', 'pop-2', 'pop-3', 'pop-4'] }];
    expect(resolveAtList('pop-3@end,pop-4@start', { ...ctx, rows }).map((x: any) => x.frame)).toEqual([119, 150]);
  });
  it('labels are readable and unique (they become file names)', () => {
    const l = resolveAtList('3.5,title@end', ctx).map((x: any) => x.label);
    expect(l).toEqual(['3.50s', 'title-end']);
    expect(resolveAtList('3.5,3.5', ctx).map((x: any) => x.label)).toEqual(['3.50s', '3.50s-2']);
  });
  it('labels are safe as file names: a layer called "a/b" or "x:y" does not make a folder or an illegal name', () => {
    const ctx2 = { ...ctx, rows: [{ name: 'a/b', start: 1, end: 3 }, { name: 'x:y*z', start: 3, end: 5 }] };
    expect(resolveAtList('a/b@end,x:y*z@start', ctx2).map((x: any) => x.label)).toEqual(['a-b-end', 'x-y-z-start']);
  });
  it('says what it could not read', () => {
    expect(() => resolveAtList('nope@end', ctx)).toThrow(/no layer named "nope".*title.*logo/s);
    expect(() => resolveAtList('banana', ctx)).toThrow(/cannot read "banana".*3\.5.*50%.*f120.*name@end/s);
    expect(() => resolveAtList('99', ctx)).toThrow(/past the end/);
  });
});


describe('namedScenes: what a scene is', () => {
  it('named top-level COMPOSITIONS of a second or more; not other layers (a 61-layer film has no 61 scenes), nested ones, automatic names, folded runs, or short ones', () => {
    const rows = [
      { name: 'intro', type: 'composition', start: 0, end: 3, depth: 0 }, { name: 'text#2', type: 'composition', start: 0, end: 9, depth: 0 },
      { name: 'blip', type: 'composition', start: 1, end: 1.5, depth: 0 }, { name: 'inner', type: 'composition', start: 1, end: 3, depth: 1 },
      { name: 'outro', type: 'composition', start: 3, end: 9, depth: 0 }, { name: 'snow-# ×130', type: 'composition', start: 0, end: 9, depth: 0 },
      { name: 'title', type: 'text', start: 0, end: 9, depth: 0 }, { name: 'bgm', type: 'audio', start: 0, end: 9, depth: 0 }, { name: 'cam', type: 'camera', start: 0, end: 9, depth: 0 },
    ];
    expect(namedScenes(rows)).toEqual([{ name: 'intro', start: 0, end: 3 }, { name: 'outro', start: 3, end: 9 }]);
  });
});

describe('groupIssues / splitIssues', () => {
  it('groupIssues: issues that differ only by numbers are one kind, with count and frame range', () => {
    const g = groupIssues([
      { frame: 0, issues: ['text layer "a" is cut off: 120px beyond the right edge', 'x overlaps y by 50%'] },
      { frame: 30, issues: ['text layer "a" is cut off: 80px beyond the right edge'] },
      { frame: 60, issues: ['text layer "a" is cut off: 20px beyond the right edge'] },
    ]);
    expect(g).toEqual([
      { message: 'text layer "a" is cut off: 120px beyond the right edge', count: 3, firstFrame: 0, lastFrame: 60 },
      { message: 'x overlaps y by 50%', count: 1, firstFrame: 0, lastFrame: 0 },
    ]);
  });

  it('splitIssues: overlaps are for the eyes (often intentional), cut-off / off-canvas / no size are problems; strict makes all problems', () => {
    const groups = [
      { message: 'text layer "a" is cut off by the canvas edge: 12px beyond the right edge', count: 2, firstFrame: 0, lastFrame: 30 },
      { message: 'text layers "g" and "t" overlap by 99% of the smaller one', count: 3, firstFrame: 36, lastFrame: 48 },
      { message: 'text layer "b" has no size (empty text, or not drawn yet)', count: 1, firstFrame: 0, lastFrame: 0 },
    ];
    const loose = splitIssues(groups, false);
    expect(loose.problems.map((g: any) => g.message)).toEqual([groups[0].message, groups[2].message]);
    expect(loose.review.map((g: any) => g.message)).toEqual([groups[1].message]);
    const strict = splitIssues(groups, true);
    expect(strict.problems).toHaveLength(3);
    expect(strict.review).toEqual([]);
  });
});
