// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Time, two gaps of group 2: two keyframes with the SAME `at`, and the edges of a lifespan inside a composition with `speed`.
// The answers come from the documents, written here before the film was run.
//
// (1) 'tie', a red 20 x 20 rect in the root, initial x 40, two `to` keyframes on x, both at 0.5, ease 'none':
//     A { at: 0.5, to: { x: 160 }, duration: 1 } and B { at: 0.5, to: { x: 280 }, duration: 1 }; listed [A, B], or [B, A] with ?tie=reverse.
//   - docs/dsl.md "Keyframes" (`to`): "tween from whatever the property is at `at` … Keyframes on one property run in the order of their `at`, not of the list
//     (written backwards they play the same). A `to` starts from where the keyframe before it ENDED … the later one takes over at its `at`".
//     With one `at` there is no "order of their at" and no "later one": the public documents do not say which of the two writes x, nor from where.
//     What they do promise, read either way: before 0.5 s neither has started, so x is 40 (the `to` starts "from whatever the property is at `at`": 40);
//     and a frame is a function of the time (docs/philosophy.md: time is deterministic), so seeking in any order gives the same x.
//   - The only precise text is the source's: src/core/pure/PureTimeline.ts, the header: "the value at `t` is the value of the last segment that has started";
//     the comment of Channel.segs: "sorted by (start, creation order)"; the comment of `prepare`: "a `to` (and a `set`) starts where the segment before it ended";
//     docs/superpowers/specs/2026-10-10-pure-timeline-design.md: "ordered by start time (creation order breaks a tie)". Keyframes are created in the order of
//     the list (src/core/Timeline.ts applyKeyframes walks the list; code, no comment says it). So, at equal `at`, the one listed LATER writes x from 0.5 s,
//     starting from the end value of the one listed before it:
//       [A, B]: x 40 until 0.5 s, then 160 + 120 (t − 0.5) to 1.5 s (a jump 40 → 160 at frame 15), 280 after.
//       [B, A]: x 40 until 0.5 s, then 280 − 120 (t − 0.5) to 1.5 s (a jump 40 → 280 at frame 15), 160 after.
//     Pinned as the source says, and reported as a doc-gap ("written backwards they play the same" is not true at equal `at`).
//
// (2) 'clock', a composition at COMP_AT (default 0, ?compAt=) for 2 s of OUTER time, with `speed` SPEED (default 2, ?speed=), holding 'life': a green
//     40 x 40 rect, at: 1, duration: 1 (composition seconds), initial x 60, y 130, and a keyframe { at: 0, to: { x: 260 }, duration: 1, ease: 'none' }.
//   - docs/dsl.md "Time: speed and time": "`speed` is a fixed multiplier on the layer (… `2` twice as fast …)"; "Inside a composition with its own time the
//     children are in that composition's local seconds (with `speed: 2` the content is twice as long as `duration` …)"; "The composition's own `at`,
//     `duration`, `x` / `alpha` keyframes are outer time". docs/dsl.md `composition`: "The layers inside then write `at`, `duration` and `keyframes` in the
//     composition's own seconds". So the composition's clock at movie time t is u = SPEED × (t − COMP_AT).
//   - docs/dsl.md: a layer is alive in [at, at + duration) ("Outside the lifespan it is invisible"); cheatsheet.md "Time of a keyframe's at: seconds from the
//     start of its own layer"; with ease 'none' the keyframe is a straight line. So 'life' is seen iff 1 ≤ u < 2, at x = 60 + 200 (u − 1)
//     (the keyframe's 1 s is one composition second: half a movie second at speed 2).
//   - docs/api.md render(): frame f is the moment f / 30 s. Speed 2, at 0: u = f / 15. Frame 14 (u 0.933) before, 15 (u 1) the first inside at x 60,
//     22 (u 1.467) at x 153.33, 29 (u 1.933) the last inside at x 246.67, 30 (u 2) out. (At speed 1 the same child would live on frames 30..59.)
//   - docs/dsl.md shapes: a rect is centred on x, y; docs/api.md inspect(): visible = "alive at this frame, not hidden by an ancestor, alpha > 0", bounds in canvas px.

const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLACK = [0, 0, 0];
const FRAMES = Array.from({ length: 90 }, (_, f) => f);
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));

/** 'tie' at time t, from the source's rule: the later-listed keyframe wins from 0.5 s, starting from the earlier-listed one's end. */
function tieX(t: number, order: 'list' | 'reverse'): number {
  if (t < 0.5) return 40;
  const p = clamp01((t - 0.5) / 1);
  return order === 'list' ? 160 + 120 * p : 280 - 120 * p;
}

/** 'life' at frame f: its centre x, or null when it is not alive (docs/dsl.md: composition seconds, u = speed × (t − compAt)). */
function lifeX(f: number, speed: number, compAt: number): number | null {
  const t = f / 30;
  if (t < compAt || t >= compAt + 2) return null;           // the composition's own lifespan is outer time
  const u = speed * (t - compAt);
  if (u < 1 || u >= 2) return null;
  return 60 + 200 * (u - 1);
}

interface Seen { visible: boolean; cx: number | null }
const read = (film: Film, name: string, frames = FRAMES) => film.eval<Seen[]>(`seenAt(${JSON.stringify(name)}, ${JSON.stringify(frames)})`);
const px = (film: Film, f: number, x: number, y: number) => film.eval<number[]>(`pixelAt(${f}, ${x}, ${y})`);

runFilms('Time: two keyframes on one property with the same `at`', () => {
  for (const order of ['list', 'reverse'] as const) {
    it(`listed ${order === 'list' ? '[A, B]' : '[B, A]'}: x is 40 before the shared at, in both readings of the documents (frames 0..14)`, async () => {
      await withFilm('time-same-at-and-speed-edges', async (film) => {
        const got = await read(film, 'tie', FRAMES.filter((f) => f < 15));
        got.forEach((s, f) => expect(s.cx, `order ${order}, frame ${f}: neither keyframe has started`).toBeCloseTo(40, 2));
        expect(await px(film, 14, 40, 40), 'frame 14: the rect at its initial x').toEqual(RED);
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      }, { query: order === 'reverse' ? 'tie=reverse' : '' });
    }, 120_000);

    it(`listed ${order === 'list' ? '[A, B]' : '[B, A]'}: from the shared at the LATER-listed keyframe writes x, from the earlier-listed one's end (the source comment's rule)`, async () => {
      await withFilm('time-same-at-and-speed-edges', async (film) => {
        const got = await read(film, 'tie');
        for (const f of FRAMES) expect(got[f]!.cx, `order ${order}, frame ${f} (${(f / 30).toFixed(3)} s): x ${tieX(f / 30, order).toFixed(2)}`).toBeCloseTo(tieX(f / 30, order), 2);
        const jump = order === 'list' ? 160 : 280, end = order === 'list' ? 280 : 160;
        expect(await px(film, 15, jump, 40), `frame 15 (0.5 s): a jump to the earlier-listed one's end, ${jump}`).toEqual(RED);
        expect(await px(film, 15, 40, 40), 'frame 15: not where both start "from whatever the property is at at" (40)').toEqual(BLACK);
        expect(await px(film, 30, (jump + end) / 2, 40), `frame 30 (1 s): half way from ${jump} to ${end}`).toEqual(RED);
        expect(await px(film, 89, end, 40), `frame 89: the later-listed one's end, ${end}`).toEqual(RED);
      }, { query: order === 'reverse' ? 'tie=reverse' : '' });
    }, 120_000);
  }

  it('the same frame is the same x whatever order it is seeked in (forward, then backward)', async () => {
    await withFilm('time-same-at-and-speed-edges', async (film) => {
      const fwd = await read(film, 'tie');
      const back = (await read(film, 'tie', [...FRAMES].reverse())).reverse();
      expect(back.map((s) => s.cx)).toEqual(fwd.map((s) => s.cx));
    }, { query: 'tie=reverse' });
  }, 120_000);
});

runFilms('Time: the lifespan edges of a child inside a composition with `speed`, in movie frames', () => {
  const cases: { query: string; speed: number; compAt: number; first: number; last: number }[] = [
    { query: '', speed: 2, compAt: 0, first: 15, last: 29 },               // composition seconds 1..2 = movie 0.5..1
    { query: 'speed=1', speed: 1, compAt: 0, first: 30, last: 59 },         // no remap: movie 1..2
    { query: 'compAt=0.5', speed: 2, compAt: 0.5, first: 30, last: 44 },    // the composition's own at is outer time: movie 1..1.5
    { query: 'speed=4', speed: 4, compAt: 0, first: 8, last: 14 },          // movie 0.25..0.5: the start falls between frames 7 and 8
  ];
  for (const c of cases) {
    it(`speed ${c.speed}, composition at ${c.compAt}: 'life' is seen on movie frames ${c.first}..${c.last} only, at the x of its own keyframe in composition seconds`, async () => {
      await withFilm('time-same-at-and-speed-edges', async (film) => {
        // the documented frames, written out (and checked against the formula, so a typo in either shows)
        for (const f of FRAMES) expect(lifeX(f, c.speed, c.compAt) !== null, `formula, frame ${f}`).toBe(f >= c.first && f <= c.last);

        const got = await read(film, 'life');
        for (const f of FRAMES) {
          const want = lifeX(f, c.speed, c.compAt);
          expect(got[f]!.visible, `frame ${f} (${(f / 30).toFixed(3)} s, composition ${(c.speed * (f / 30 - c.compAt)).toFixed(3)} s): ${want === null ? 'out' : 'in'}`).toBe(want !== null);
          if (want !== null) expect(got[f]!.cx, `frame ${f}: centre x ${want.toFixed(2)}`).toBeCloseTo(want, 1);
        }

        // the picture at the four edges: before, on the start, the last inside, the end
        const x0 = lifeX(c.first, c.speed, c.compAt)!, x1 = lifeX(c.last, c.speed, c.compAt)!;
        expect(await px(film, c.first - 1, x0, 130), `frame ${c.first - 1}: before, nothing where it will appear`).toEqual(BLACK);
        expect(await px(film, c.first, x0, 130), `frame ${c.first}: on the start, at x ${x0.toFixed(2)}`).toEqual(GREEN);
        expect(await px(film, c.last, x1, 130), `frame ${c.last}: the last frame inside, at x ${x1.toFixed(2)}`).toEqual(GREEN);
        expect(await px(film, c.last + 1, x1, 130), `frame ${c.last + 1}: the end is not inside`).toEqual(BLACK);
        expect(await px(film, c.last + 1, 260, 130), `frame ${c.last + 1}: not left at its last value either`).toEqual(BLACK);
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      }, { query: c.query });
    }, 120_000);
  }

  it('speed 2: the keyframe local to the child lands in composition seconds: half way at movie 0.75 s is impossible on a frame, so frames 21 / 24 are x 140 / 180', async () => {
    await withFilm('time-same-at-and-speed-edges', async (film) => {
      expect(await px(film, 21, 140, 130), 'frame 21 (0.7 s, composition 1.4 s): x 60 + 200 × 0.4').toEqual(GREEN);
      expect(await px(film, 24, 180, 130), 'frame 24 (0.8 s, composition 1.6 s): x 60 + 200 × 0.6').toEqual(GREEN);
      // were the keyframe in movie seconds (1 s long from movie 0.5 s) the centre would be at x 100 on frame 21: 40 px behind
      expect(await px(film, 21, 95, 130), 'frame 21: x 95 (inside the rect a movie-second keyframe would put at 100; outside the documented 120..160) is empty').toEqual(BLACK);
    });
  }, 120_000);
});
