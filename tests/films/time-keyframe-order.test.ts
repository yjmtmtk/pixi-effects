// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Time: the order of two keyframes on one property. A red 20 x 20 rect 'box', initial x 40, and two `to` keyframes on x, ease 'none':
//   A { at: 0.5, to: { x: 160 }, duration: 1 } and B { at: 2, to: { x: 280 }, duration: 0.5 }; ?order=reverse lists them [B, A];
//   ?overlap=1 makes B { at: 1, to: { x: 280 }, duration: 1 }, so it starts while A still runs (A ends at 1.5).
//
// Where the answers come from (written before the film was run):
// - docs/dsl.md "Keyframes": a keyframe's `at` is "start, in seconds from the start of THIS sequence"; "`to` — tween from whatever the property is
//   at `at` to the given values, over `duration`"; skills/pixi-effects/reference/cheatsheet.md "Keyframe kinds": "Default ease is linear".
//   What a `to` starts from is "the property at `at`", a moment of time, not a place in the list; nothing in the public documents gives the list a meaning.
// - src/core/pure/PureTimeline.ts, the header: "For every (target, property) it keeps the segments that write it, ordered by start time. The value at `t`
//   is the value of the last segment that has started"; the comment of `prepare`: "a `to` (and a `set`) starts where the segment before it ended" and
//   "before the first segment the property shows that segment's start"; the comment of Channel.segs: "sorted by (start, creation order)".
// - docs/api.md render(): frame f is the moment f / 30 s; docs/dsl.md shapes: a rect is centred on x, y; docs/api.md inspect(): bounds in canvas pixels.
//
// So, in time order and in reverse order alike (two different `at`s: the list order never decides):
//   x = 40 up to 0.5 s; 40 + 120 (t − 0.5) to 1.5 s; 160 until 2 s; 160 + 240 (t − 2) to 2.5 s; 280 after.
//   (Were the list order the order of play, [B, A] would run B first from 40 and A from 280: x 220 at frame 30, not 100.)
//
// Overlapping (?overlap=1). The public documents promise nothing precise: dsl.md's "from whatever the property is at `at`" would start B at 100
// (A half way at 1 s), with no word on which of the two writes x while both run. The source comment is the only precise text:
// from 1 s on B alone writes x ("the last segment that has started"), starting "where the segment before it ended", A's end value 160:
//   x = A's line until 1 s (96 at frame 29), then 160 + 120 (t − 1) to 2 s (a jump from 96 to 160 at frame 30), 280 after.
// Both readings agree before 1 s and from 2 s on; that part is pinned as promised by both, the middle as the source comment says (and reported as a doc-gap).

const FRAMES = Array.from({ length: 90 }, (_, f) => f);
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

/** The centre x at time t, two keyframes apart in time (any list order). */
function apart(t: number): number {
  if (t < 2) return 40 + 120 * clamp01((t - 0.5) / 1);
  return 160 + 120 * clamp01((t - 2) / 0.5);
}
/** The centre x at time t with B starting at 1 s inside A: B alone from 1 s, from A's end (160). */
function overlapping(t: number): number {
  if (t < 1) return 40 + 120 * clamp01((t - 0.5) / 1);
  return 160 + 120 * clamp01((t - 1) / 1);
}

const RED = [255, 0, 0];
const BLACK = [0, 0, 0];
const read = (film: Film) => film.eval<(number | null)[]>(`centreAt(${JSON.stringify(FRAMES)})`);
const px = (film: Film, f: number, x: number) => film.eval<number[]>(`pixelAt(${f}, ${x}, 90)`);

function expectCentres(got: (number | null)[], want: (t: number) => number, label: string, frames = FRAMES): void {
  for (const f of frames) expect(got[f], `${label}, frame ${f} (${(f / 30).toFixed(3)} s): centre x ${want(f / 30).toFixed(2)}`).toBeCloseTo(want(f / 30), 2);
}

runFilms('Time: two keyframes on one property play in the order of their times, not of the list', () => {
  for (const order of ['time', 'reverse'] as const) {
    it(`listed in ${order === 'time' ? 'time order [A, B]' : 'reverse order [B, A]'}: the rect is at the documented x on every frame`, async () => {
      await withFilm('time-keyframe-order', async (film) => {
        expectCentres(await read(film), apart, `order=${order}`);
        // the picture agrees at the moments that tell the orders apart
        expect(await px(film, 15, 40), 'frame 15 (0.5 s): A has not moved it yet, x 40').toEqual(RED);
        expect(await px(film, 30, 100), 'frame 30 (1 s): A half way, x 100').toEqual(RED);
        expect(await px(film, 30, 220), 'frame 30: x 220 (B played first from 40, then A from 280) is empty').toEqual(BLACK);
        expect(await px(film, 54, 160), 'frame 54 (1.8 s): held at A\'s end, 160').toEqual(RED);
        expect(await px(film, 66, 208), 'frame 66 (2.2 s): B from 160, x 208').toEqual(RED);
        expect(await px(film, 89, 280), 'frame 89: B\'s end, 280').toEqual(RED);
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      }, { query: `order=${order}` });
    }, 120_000);
  }

  it('the two list orders give the same centre on every frame (seeking back and forth)', async () => {
    const a = await withFilm('time-keyframe-order', read, { query: 'order=time' });
    const b = await withFilm('time-keyframe-order', async (film) => {
      // seek in a scrambled order: a frame is a function of the time, whatever came before
      const back = await film.eval<(number | null)[]>(`centreAt(${JSON.stringify([...FRAMES].reverse())})`);
      return back.reverse();
    }, { query: 'order=reverse' });
    expect(b).toEqual(a);
  }, 120_000);
});

runFilms('Time: two keyframes on one property that overlap (the second starts while the first runs)', () => {
  for (const order of ['time', 'reverse'] as const) {
    it(`listed in ${order} order: A alone before B starts, B's end after it ends (both documents agree)`, async () => {
      await withFilm('time-keyframe-order', async (film) => {
        const got = await read(film);
        expectCentres(got, overlapping, `overlap, order=${order}, before B`, FRAMES.filter((f) => f < 30));
        expectCentres(got, overlapping, `overlap, order=${order}, after B`, FRAMES.filter((f) => f >= 60));
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      }, { query: `overlap=1&order=${order}` });
    }, 120_000);

    it(`listed in ${order} order: from B's start the later-starting keyframe alone writes x, from A's END value (the source comment's rule)`, async () => {
      await withFilm('time-keyframe-order', async (film) => {
        const got = await read(film);
        expectCentres(got, overlapping, `overlap, order=${order}, while both run and after A`, FRAMES.filter((f) => f >= 30 && f < 60));
        expect(await px(film, 29, 96), 'frame 29 (0.967 s): A at 96').toEqual(RED);
        expect(await px(film, 30, 160), 'frame 30 (1 s): B starts from A\'s end, 160').toEqual(RED);
        expect(await px(film, 30, 100), 'frame 30: not from where A stood at 1 s (100)').toEqual(BLACK);
        expect(await px(film, 45, 220), 'frame 45 (1.5 s): B half way from 160 to 280').toEqual(RED);
      }, { query: `overlap=1&order=${order}` });
    }, 120_000);
  }
});
