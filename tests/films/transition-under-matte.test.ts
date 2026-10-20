// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Colour, filters, blend: a transition under a matte. A 320 x 180 black movie, 2 s at 30 fps (tests/films/transition-under-matte.html):
//   'bg'  a red 320 x 180 rect (centred on 160, 90) for the whole movie;
//   'blk' a white 40 x 180 rect, the matte: x 80 → 240 over 0..2 s, ease 'none' (its centre bx(t) = 80 + 80 t);
//   'A'   a green 320 x 60 bar (y 60..120) with `mask: 'blk'`, 0..2 s;
//   'B'   a blue 320 x 180 rect, 0.5..2 s;
//   one transition A → B at 0.5 for DUR = 1 s (?dur= changes it), ease 'none': ?kind=crossfade (default) | wipe (direction 'left', smoothing 0.004) | dissolve.
//   ?scene=comp puts 'bg', 'blk' and the bar inside a 320 x 180 composition 'A' (the matte is then inside the scene, not carried by the transition).
//
// Where the answers come from (written before the film was run):
// - docs/dsl.md "Named mattes and luma": `mask: 'name'` cuts the layer by the matte's alpha; "A layer that is used as a matte is not drawn";
//   rule 1 "Outside the matte layer's own shape the matte is 0"; rule 2 "A layer that a transition wraps keeps its matte: the transition carries
//   the `mask` to the wrapper" (cheatsheet: "Wipe/iris/dissolve/zoom wrap the layers for you"); tests/films/mattes.html: backdrop × (1 − m) + layer × m.
// - docs/dsl.md "Transitions": `at` is parent-composition time, ease default 'none' (linear); "### crossfade: Alpha cross-dissolve. `from` fades
//   to alpha 0, `to` starts at alpha 0 and fades to 1, both over [at, at + duration]". So p(t) = clamp((t − 0.5) / DUR), A at alpha 1 − p, B at p,
//   B drawn over A (listed after it), each laid over what is below with the usual "over": out = src · a + below · (1 − a).
//   NOTE: the library's `dissolve` is NOT a linear mix: dsl.md "### dissolve: A noise reveal driven by deterministic 2D Perlin noise" (a pixel
//   reveals when its noise value is passed). The linear mix the brief calls a dissolve is `crossfade`.
// - wipe: dsl.md "'left' means the edge moves leftward across the canvas, exposing B starting from the right side"; the place of the edge comes from
//   the source comments of src/filters/TransitionMask.ts: "at uProgress=0.25 the wipe edge is at canvas x = 0.75 * canvasW" and "Remap p so the
//   smoothstep edge lies fully outside [0,1] at p=0 / p=1" (ep = p (1 + 2 s) − s, edge at x = W (1 − ep), soft over ±s W = ±1.3 px), and
//   src/core/Transitions.ts: the outgoing scene has "a HARD binary cutoff … A stays at alpha=1 across B's smoothstep zone". dsl.md "### luma":
//   "`from` holds until `to` has covered it (a hard cutoff, as `wipe` and `iris` do)".
// - dissolve: src/core/Transitions.ts "Same noise pattern (same seed) so the pixel reveal pattern is consistent — pixels A loses are the pixels B
//   reveals"; the out-mask is the same hard cutoff. So under a dissolve every pixel is B · r + (A's picture or, once A is cut, what is below) · (1 − r).
// - docs/dsl.md shapes: a rect is centred on x, y; docs/api.md snapshot(): frame f is the moment f / 30 s.
//
// So, with M = a pixel where the matte meets the bar (x = bx, y = 90), O = a pixel of the bar outside the matte, C = the matte's column off the bar (y = 30):
//   crossfade, scene=layer:  M = (255 p (1 − p), 255 (1 − p)², 255 p)    [green at 1 − p over red, then blue at p]
//                            O = C = (255 (1 − p), 0, 255 p)              [red, then blue at p]
//   crossfade, scene=comp:   O = C = (255 (1 − p)², 0, 255 p)            [the red is inside A now: it fades too]
//                            M: G = 255 (1 − p)², B = 255 p; R is 0 if a composition's alpha is one group opacity, 255 p (1 − p)² if it is
//                            multiplied into each child: the documents do not say which (dsl.md says "Whole-layer opacity (pixi.js)" only of the
//                            `alpha` FILTER, not of the `alpha` property of a composition): a doc-gap, so the test takes either reading.
//   wipe:     left of the edge A's picture (M green (0, 255, 0), O red), right of it blue; the matte cuts A on its side of the edge.
//   dissolve: no number per pixel, but M stays a mix of green and blue (R ≈ 0, G + B ≈ 255) and O a mix of red and blue (G = 0, R + B ≈ 255).
//   Every kind: up to the transition's start (frame 15) the picture is A's: green in the matte, red elsewhere; from its end (frame 45) all blue;
//   and on every frame no pixel of the bar outside the matte has any green (the matte still cuts the bar during the transition).

const W = 320, FPS = 30, AT = 0.5, TOL = 3;
const clamp01 = (u: number) => Math.min(1, Math.max(0, u));
const bx = (f: number) => 80 + 80 * (f / FPS);
const progress = (f: number, dur: number) => clamp01((f / FPS - AT) / dur);
type RGB = [number, number, number];

/** The documented crossfade colours at progress p. */
function crossfade(p: number, scene: 'layer' | 'comp'): { M: RGB; O: RGB; Mr?: [number, number] } {
  if (scene === 'layer') return { M: [255 * p * (1 - p), 255 * (1 - p) ** 2, 255 * p], O: [255 * (1 - p), 0, 255 * p] };
  return { M: [NaN, 255 * (1 - p) ** 2, 255 * p], O: [255 * (1 - p) ** 2, 0, 255 * p], Mr: [0, 255 * p * (1 - p) ** 2] };
}

const rows = (film: Film, frames: number[], y: number) => film.eval<number[][]>(`rowsAt(${JSON.stringify(frames)}, ${y})`);
const at = (row: number[], x: number): RGB => [row[x * 3], row[x * 3 + 1], row[x * 3 + 2]];
const near = (got: RGB, want: RGB, label: string, tol = TOL) => {
  for (let c = 0; c < 3; c++) if (!Number.isNaN(want[c])) expect(Math.abs(got[c] - want[c]), `${label}: got [${got}] want [${want.map((v) => v.toFixed(1))}] (channel ${'RGB'[c]})`).toBeLessThanOrEqual(tol);
};
/** x of a pixel of the bar well outside the matte (60 px from its centre, inside the canvas). */
const outside = (f: number) => Math.round(bx(f) + 60 <= W - 10 ? bx(f) + 60 : bx(f) - 60);
const FRAMES = Array.from({ length: 60 }, (_, f) => f);
const inMatte = (f: number, x: number) => Math.abs(x + 0.5 - bx(f)) < 17;       // the block is 40 wide: keep 3 px off its soft edge
const offMatte = (f: number, x: number) => Math.abs(x + 0.5 - bx(f)) > 23;

/** Start on A and end on B, and no green outside the matte on any frame: true for every kind of transition. */
async function common(film: Film, label: string, dur = 1): Promise<{ bar: number[][]; top: number[][] }> {
  const bar = await rows(film, FRAMES, 90), top = await rows(film, FRAMES, 30);
  const end = Math.ceil((AT + dur) * FPS);
  for (const f of FRAMES) {
    for (let x = 0; x < W; x++) {
      if (offMatte(f, x)) expect(at(bar[f], x)[1], `${label}, frame ${f}, x ${x}: the bar outside the matte has no green`).toBeLessThanOrEqual(2);
      // the matte layer itself is not drawn: off the bar there is never any green (nor white)
      expect(at(top[f], x)[1], `${label}, frame ${f}, x ${x}, y 30: no green off the bar`).toBeLessThanOrEqual(2);
    }
    if (f <= AT * FPS) {
      // before and at the start of the transition: A's picture
      for (let x = 0; x < W; x++) {
        if (inMatte(f, x)) near(at(bar[f], x), [0, 255, 0], `${label}, frame ${f} (A), x ${x} in the matte`);
        else if (offMatte(f, x)) near(at(bar[f], x), [255, 0, 0], `${label}, frame ${f} (A), x ${x} outside the matte`);
        near(at(top[f], x), [255, 0, 0], `${label}, frame ${f} (A), x ${x}, y 30`);
      }
    }
    if (f >= end) {
      // from the end of the transition: B alone, everywhere
      for (let x = 0; x < W; x++) { near(at(bar[f], x), [0, 0, 255], `${label}, frame ${f} (B), x ${x}`); near(at(top[f], x), [0, 0, 255], `${label}, frame ${f} (B), x ${x}, y 30`); }
    }
  }
  return { bar, top };
}

runFilms('Colour, filters, blend: a matte under a crossfade (the alpha cross-dissolve)', () => {
  for (const [scene, dur] of [['layer', 1], ['layer', 0.5], ['comp', 1]] as const) {
    it(`scene=${scene}, ${dur} s: the matte cuts the bar on every frame, and the colours are the documented "over" of A at 1 − p and B at p`, async () => {
      await withFilm('transition-under-matte', async (film) => {
        const label = `crossfade, scene=${scene}, dur ${dur}`;
        const { bar, top } = await common(film, label, dur);
        for (const f of FRAMES) {
          const p = progress(f, dur), want = crossfade(p, scene);
          for (let x = 0; x < W; x++) {
            if (inMatte(f, x)) {
              const got = at(bar[f], x);
              near(got, want.M, `${label}, frame ${f} (p ${p.toFixed(3)}), x ${x} in the matte`);
              if (want.Mr) expect(Math.min(...want.Mr.map((r) => Math.abs(got[0] - r))), `${label}, frame ${f}, x ${x}: red ${got[0]} is one of the two readings [${want.Mr.map((r) => r.toFixed(1))}]`).toBeLessThanOrEqual(TOL);
            } else if (offMatte(f, x)) near(at(bar[f], x), want.O, `${label}, frame ${f} (p ${p.toFixed(3)}), x ${x} outside the matte`);
            near(at(top[f], x), want.O, `${label}, frame ${f} (p ${p.toFixed(3)}), x ${x}, y 30 (the matte is not drawn)`);
          }
        }
        // the middle, said in numbers (dur 1: frame 30 is p = 0.5; dur 0.5: frame 22 is p = 0.4667)
        const mid = dur === 1 ? 30 : 22, p = progress(mid, dur);
        near(at(bar[mid], Math.round(bx(mid))), crossfade(p, scene).M, `${label}, frame ${mid}: the matte's centre`);
        near(at(bar[mid], outside(mid)), crossfade(p, scene).O, `${label}, frame ${mid}: the bar outside the matte`);
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      }, { query: `kind=crossfade&scene=${scene}${dur !== 1 ? `&dur=${dur}` : ''}` });
    }, 180_000);
  }
});

runFilms('Colour, filters, blend: a matte under a wipe (a transition that wraps the layers)', () => {
  const s = 0.004;
  const edge = (p: number) => W * (1 - (p * (1 + 2 * s) - s));   // where B's reveal is one half (TransitionMask.ts)
  for (const scene of ['layer', 'comp'] as const) {
    it(`scene=${scene}: left of the travelling edge A's matte still cuts the bar, right of it B`, async () => {
      await withFilm('transition-under-matte', async (film) => {
        const label = `wipe, scene=${scene}`;
        const { bar, top } = await common(film, label);
        for (const f of FRAMES) {
          const p = progress(f, 1), e = edge(p);
          if (p <= 0 || p >= 1) continue;
          for (let x = 0; x < W; x++) {
            const cx = x + 0.5;
            if (cx < e - 3) {
              if (inMatte(f, x)) near(at(bar[f], x), [0, 255, 0], `${label}, frame ${f} (edge ${e.toFixed(1)}), x ${x}: A, in the matte`);
              else if (offMatte(f, x)) near(at(bar[f], x), [255, 0, 0], `${label}, frame ${f} (edge ${e.toFixed(1)}), x ${x}: A, outside the matte`);
              near(at(top[f], x), [255, 0, 0], `${label}, frame ${f}, x ${x}, y 30: A`);
            } else if (cx > e + 3) {
              near(at(bar[f], x), [0, 0, 255], `${label}, frame ${f} (edge ${e.toFixed(1)}), x ${x}: B`);
              near(at(top[f], x), [0, 0, 255], `${label}, frame ${f}, x ${x}, y 30: B`);
            }
          }
        }
        // frame 30: the edge (160) cuts through the matte (140..180): green just left of it, blue just right of it
        near(at(bar[30], 150), [0, 255, 0], `${label}, frame 30, x 150: the matte, still A`);
        near(at(bar[30], 170), [0, 0, 255], `${label}, frame 30, x 170: the matte's place, already B`);
        near(at(bar[30], 100), [255, 0, 0], `${label}, frame 30, x 100: the bar outside the matte, A: red`);
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      }, { query: `kind=wipe&scene=${scene}` });
    }, 180_000);
  }
});

runFilms('Colour, filters, blend: a matte under a dissolve (the noise reveal)', () => {
  it('scene=layer: in the matte a pixel is green, blue or between them; outside it red, blue or between them; never green outside', async () => {
    await withFilm('transition-under-matte', async (film) => {
      const label = 'dissolve, scene=layer';
      const { bar } = await common(film, label);
      let mixed = 0;
      for (const f of FRAMES) {
        if (progress(f, 1) <= 0 || progress(f, 1) >= 1) continue;
        for (let x = 0; x < W; x++) {
          const [r, g, b] = at(bar[f], x);
          if (inMatte(f, x)) {
            expect(r, `${label}, frame ${f}, x ${x} in the matte: no red (A covers the backdrop until B has covered A)`).toBeLessThanOrEqual(TOL);
            expect(Math.abs(g + b - 255), `${label}, frame ${f}, x ${x} in the matte: green and blue add to 255 (got [${r}, ${g}, ${b}])`).toBeLessThanOrEqual(TOL);
            if (g > 20 && b > 20) mixed++;
          } else if (offMatte(f, x)) {
            expect(Math.abs(r + b - 255), `${label}, frame ${f}, x ${x} outside the matte: red and blue add to 255 (got [${r}, ${g}, ${b}])`).toBeLessThanOrEqual(TOL);
          }
        }
      }
      // the noise does reveal B inside the matte while the matte still cuts the bar (some pixels are between green and blue)
      expect(mixed, `${label}: pixels in the matte that are part green, part blue`).toBeGreaterThan(0);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    }, { query: 'kind=dissolve' });
  }, 180_000);
});
