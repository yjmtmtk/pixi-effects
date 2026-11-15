import { describe, it, expect } from 'vitest';
import { resolveMoments } from '../../src/core/moments';

// A layer's `at` may name a moment instead of a number of seconds: `host@in` (marker `in` of the composition `host`), `title@end`
// (where the layer `title` ends), `@drop` (marker `drop` of the composition the layer is in, or of one around it), each with `+ 0.2` / `- 0.5`.
// After Effects: composition markers, seen from outside the precomp. Resolved once, before anything is built: what is built has numbers.
type L = { name?: string; type?: string; at?: unknown; duration?: number; markers?: Record<string, number>; sequences?: L[]; speed?: number; loop?: unknown; frameRate?: number; initial?: Record<string, unknown>; keyframes?: unknown[] };
const run = (sequences: L[], extra: Record<string, unknown> = {}, duration = 10) =>
  resolveMoments({ duration, sequences, ...extra } as never, { duration, frameRate: 30 });
const ats = (r: { spec: unknown }) => (r.spec as { sequences: L[] }).sequences.map(l => l.at);

const lowerThird = (name: string, at: unknown, more: Partial<L> = {}): L => ({ type: 'composition', name, at, duration: 3, markers: { in: 0.6, out: 2.4 }, sequences: [{ type: 'text', name: 'title' }], ...more });

describe('resolveMoments: a moment by name', () => {
  it('a marker of a composition, from outside: its start plus the marker', () => {
    const r = run([lowerThird('host', 2), { type: 'audio', name: 'whoosh', at: 'host@in' }, { type: 'text', name: 'next', at: 'host@out + 0.2' }]);
    expect(r.warnings).toEqual([]);
    expect(ats(r)).toEqual([2, 2.6, expect.closeTo(4.6, 9)]);
  });

  it('start, mid and end of any layer (a layer with no duration lasts to the end of its composition)', () => {
    const r = run([{ type: 'text', name: 'title', at: 1, duration: 2 }, { type: 'text', name: 'a', at: 'title@end' }, { type: 'text', name: 'b', at: 'title@mid - 0.5' }, { type: 'text', name: 'c', at: 'title@start+0.25' },
      { type: 'text', name: 'bg', at: 4 }, { type: 'text', name: 'd', at: 'bg@end - 1' }]);
    expect(r.warnings).toEqual([]);
    expect(ats(r)).toEqual([1, 3, 1.5, 1.25, 4, 9]);
  });

  it('@name: a marker of the composition the layer is in, or of one around it (the root too); @end is the end of its own composition', () => {
    const r = run([{ type: 'composition', name: 'scene', at: 1, duration: 6, markers: { hit: 2 }, sequences: [{ type: 'text', name: 'a', at: '@hit' }, { type: 'text', name: 'b', at: '@drop' }, { type: 'text', name: 'c', at: '@end - 1' }] }], { markers: { drop: 5 } });
    expect(r.warnings).toEqual([]);
    const inner = (r.spec as { sequences: L[] }).sequences[0]!.sequences!.map(l => l.at);
    expect(inner).toEqual([2, 4, 5]);                        // @drop is 5 s on the root's clock, the scene starts at 1: 4 s on the scene's
  });

  it('a moment inside another composition is brought onto the clock of the layer that names it (also through speed)', () => {
    const r = run([
      { type: 'composition', name: 'scene', at: 2, duration: 4, sequences: [lowerThird('host', 1)] },
      { type: 'composition', name: 'slow', at: 1, duration: 8, speed: 0.5, markers: { hit: 2 }, sequences: [{ type: 'text', name: 't' }] },
      { type: 'audio', name: 'a', at: 'host@in' },          // 2 + 1 + 0.6
      { type: 'audio', name: 'b', at: 'slow@hit' },          // the slow clock reaches 2 after 4 s: 1 + 4
    ]);
    expect(r.warnings).toEqual([]);
    expect(ats(r).slice(2)).toEqual([expect.closeTo(3.6, 9), expect.closeTo(5, 9)]);
  });

  it('a layer inside a composition names a layer outside it: the moment comes down onto its clock', () => {
    const r = run([{ type: 'text', name: 'logo', at: 3, duration: 1 }, { type: 'composition', name: 'scene', at: 2, duration: 5, sequences: [{ type: 'text', name: 'x', at: 'logo@end' }] }]);
    expect(r.warnings).toEqual([]);
    expect((r.spec as { sequences: L[] }).sequences[1]!.sequences![0]!.at).toBe(2);   // 4 s on the root = 2 s into the scene
  });

  it('moments may name moments (in any order); a name is looked for nearest first (a sibling before a layer elsewhere)', () => {
    const r = run([{ type: 'text', name: 'b', at: 'a@end' }, { type: 'text', name: 'a', at: 1, duration: 1 }, { type: 'text', name: 'c', at: 'b@start + 1' },
      { type: 'composition', name: 'scene', at: 5, duration: 4, sequences: [{ type: 'text', name: 'a', at: 0.5, duration: 1 }, { type: 'text', name: 'x', at: 'a@end' }] }]);
    expect(r.warnings).toEqual([]);
    expect(ats(r).slice(0, 3)).toEqual([2, 1, 3]);
    expect((r.spec as { sequences: L[] }).sequences[3]!.sequences![1]!.at).toBe(1.5);   // the `a` beside it, not the one outside
  });

  it('a marker counted from the end (negative), a component\'s markers come with it, a number written as text is a number', () => {
    const r = run([lowerThird('host', 1, { markers: { out: -0.5 } }), { type: 'text', name: 'x', at: 'host@out' }, { type: 'text', name: 'y', at: '2.5' }]);
    expect(r.warnings).toEqual([]);
    expect(ats(r)).toEqual([1, 3.5, 2.5]);
  });

  it('lists every marker on the movie\'s clock (for check --at host@in), the root\'s with no layer name', () => {
    const r = run([lowerThird('host', 2), { type: 'composition', name: 'scene', at: 1, duration: 5, sequences: [lowerThird('inner', 1)] }], { markers: { drop: 5 } });
    expect(r.markers).toEqual(expect.arrayContaining([
      { layer: null, name: 'drop', time: 5 },
      { layer: 'host', name: 'in', time: expect.closeTo(2.6, 9) },
      { layer: 'inner', name: 'out', time: expect.closeTo(4.4, 9) },
    ]));
  });

  it('a keyframe\'s at may name a moment too: it becomes seconds from the start of its layer (a moment before the layer starts is said)', () => {
    const r = run([lowerThird('host', 2), { type: 'text', name: 't', at: 1, keyframes: [{ at: 'host@out', to: { alpha: 0 }, duration: 0.3 }, { at: 0.5, to: { x: 1 }, duration: 1 }] }]);
    expect(r.warnings).toEqual([]);
    const kfs = (r.spec as { sequences: L[] }).sequences[1]!.keyframes as Array<{ at: number }>;
    expect(kfs.map(k => k.at)).toEqual([expect.closeTo(3.4, 9), 0.5]);
    const early = run([lowerThird('host', 2), { type: 'text', name: 't', at: 3, keyframes: [{ at: 'host@in', to: { alpha: 0 }, duration: 0.3 }] }]);
    expect(early.warnings[0]).toMatch(/layer "t": keyframe at: "host@in" is 0\.4 s before the layer starts \(at 3\); at 0 instead/);
  });

  it('a spec with no markers and no named moments comes back as it is', () => {
    const plain = { duration: 10, sequences: [{ type: 'text', at: 1 }] };
    expect(resolveMoments(plain, { duration: 10, frameRate: 30 }).spec).toBe(plain);
  });
});

describe('resolveMoments: what is wrong is said, with what to write', () => {
  const say = (sequences: L[], extra: Record<string, unknown> = {}) => run(sequences, extra).warnings;
  it('an unknown layer or marker (did you mean), the markers a composition has', () => {
    expect(say([lowerThird('host', 1), { type: 'text', name: 'x', at: 'hots@in' }])[0]).toMatch(/layer "x": at: "hots@in": no layer named "hots" — did you mean "host"\?; at 0 instead/);
    expect(say([lowerThird('host', 1), { type: 'text', name: 'x', at: 'host@inn' }])[0]).toMatch(/at: "host@inn": composition "host" has no marker "inn" — did you mean "in"\? \(its markers: in, out; any layer also has start, mid, end\)/);
    expect(say([{ type: 'text', name: 't', duration: 1 }, { type: 'text', name: 'x', at: 't@in' }])[0]).toMatch(/at: "t@in": "t" is a text layer: it has start, mid and end; markers are on a composition \(markers: \{ in: 0\.5 \}\)/);
    expect(say([{ type: 'text', name: 'x', at: '@drop' }])[0]).toMatch(/at: "@drop": no marker "drop" on the composition it is in or on one around it \(add markers: \{ drop: 2 \} to one\)/);
  });

  it('a string that is no moment, a cycle, two layers of the same name', () => {
    expect(say([{ type: 'text', name: 'x', at: 'soon' }])[0]).toMatch(/at: "soon" is not a time: give seconds \(2\.5\) or a moment: "host@in", "title@end \+ 0\.2", "@drop"/);
    expect(say([{ type: 'text', name: 'a', at: 'b@end' }, { type: 'text', name: 'b', at: 'a@end' }]).some(w => /at: "b@end": the moments name each other \(a → b → a\)/.test(w))).toBe(true);
    expect(say([{ type: 'text', name: 'a', at: 1 }, { type: 'text', name: 'a', at: 3 }, { type: 'text', name: 'x', at: 'a@start' }])[0]).toMatch(/at: "a@start": 2 layers are named "a" beside each other; the first is used \(give them different names\)/);
  });

  it('markers that are wrong: not a number, a reserved name, past the end, on a layer that is no composition', () => {
    expect(say([lowerThird('c', 0, { markers: { in: 'soon' as never } })])[0]).toMatch(/composition "c": marker "in" must be a number of seconds of the composition \(markers: \{ in: 0\.6 \}\); ignored/);
    expect(say([lowerThird('c', 0, { markers: { end: 1 } })])[0]).toMatch(/composition "c": marker "end" is a word every layer already has \(start, mid, end\); give it another name/);
    expect(say([lowerThird('c', 0, { markers: { late: 5 } })])[0]).toMatch(/composition "c": marker "late" at 5 s is past its end \(3 s\)/);
  });

  it('an end that cannot be known before the sound or the video is loaded', () => {
    expect(say([{ type: 'audio', name: 'song', src: 'a.mp3' } as L, { type: 'text', name: 'x', at: 'song@end' }])[0]).toMatch(/at: "song@end": audio layer "song" has no duration \(it lasts as long as its file\), so its end is not known here; give it a duration/);
  });

  it('a moment behind a keyframed `time` clock is said (its seconds are not on the outer clock)', () => {
    const remapped = { type: 'composition', name: 'r', at: 0, duration: 4, keyframes: [{ at: 0, to: { time: 8 }, duration: 4 }], markers: { hit: 2 }, sequences: [{ type: 'text', name: 't' }] };
    const r = run([remapped, { type: 'text', name: 'x', at: 'r@hit' }]);
    expect(r.warnings).toEqual([]);
    expect(ats(r)[1]).toBeCloseTo(1, 2);                     // time runs 0 → 8 over 4 s: it reaches 2 after 1 s
    expect(run([{ ...remapped, keyframes: [{ at: 0, to: { time: 1 }, duration: 4 }] }, { type: 'text', name: 'x', at: 'r@hit' }]).warnings[0])
      .toMatch(/at: "r@hit": the clock of composition "r" never reaches its marker "hit" \(2 s\)/);
  });
});
