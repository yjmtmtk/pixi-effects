// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Group 4 (Geometry), "nested compositions two deep": a parent moves its children, and a composition does not clip.
// The film: outer (at outerX, outerY) > middle (at 20, 10, scale midScale) > inner (at 50, 30, rotation innerRot about pivot innerPivotX, innerPivotY),
// and in inner: a blue rect over inner's own 60 x 40 (anchor top-left at 0, 0), a white 8 x 4 markerA centred at (50, 10), a green 6 x 6 markerB centred at (90, 20).
//
// Where the answers come from (written before the film was run):
// - docs/dsl.md 29: "Children of a nested composition use that composition's local coordinate system"; docs/dsl.md 304: "the composition itself can be
//   positioned, scaled, and rotated as a unit"; cheatsheet.md 80: "Children use the composition's local coordinates … Position/rotate/scale it as a unit".
// - docs/dsl.md 64 (Anchors and origins): a `composition`'s x, y is "its top-left corner"; "`pivotX` / `pivotY` = the point that sits at `x, y` and that
//   rotation / scale turn about". So the default pivot is (0, 0) and a local point p of a composition at (x, y) with pivot P lands in its parent at
//   (x, y) + R(rotation) · scale · (p − P).
// - docs/dsl.md 62 / cheatsheet.md 10: rotation is in DEGREES. cheatsheet.md 7: the canvas has +x right, +y down. The DIRECTION of a positive `rotation`
//   is not stated for layers (docs/dsl.md 357 says "positive is clockwise" only for an arc's angles); PixiJS's own Container (node_modules/pixi.js,
//   the transform matrix a = cos, b = sin, c = −sin, d = cos) turns +x toward +y, i.e. clockwise on screen: R(θ)(dx, dy) = (dx cos θ − dy sin θ, dx sin θ + dy cos θ),
//   so R(90)(dx, dy) = (−dy, dx). Reported as a doc gap.
// - docs/dsl.md 62 / 476: a rect's x, y is its centre unless anchorX / anchorY say otherwise (frame: anchor 0, 0 → its top-left corner at x, y).
// - docs/dsl.md 306: "a 2D composition does **not** clip its children — a child far outside `width × height` is still drawn" (markerB is outside inner's
//   60 x 40 AND outside middle's 100 x 60, while every composition's own rectangle stays on the canvas, so the culling rule of the same paragraph does not apply).
// - docs/api.md 164: inspect()'s `bounds` are "canvas pixels".
//
// The numbers worked by hand (default: outer (100, 40), middle scale 2, inner rotation 90 about (30, 20)):
//   markerA centre (50, 10): − pivot = (20, −10); R(90) → (10, 20); + inner (50, 30) = (60, 50) in middle; × 2 + (20, 10) = (140, 110) in outer; + (100, 40) = (240, 150).
//     Its 8 (along inner x) × 4 turns to 4 × 8, then × 2: 8 wide × 16 high → x 236..244, y 142..158.
//   markerB centre (90, 20): − pivot = (60, 0); R(90) → (0, 60); + (50, 30) = (50, 90) in middle (below middle's 60); × 2 + (20, 10) = (120, 190); + (100, 40) = (220, 230).
//     6 × 6 × 2 = 12 × 12 → x 214..226, y 224..236: below inner's own rectangle on the canvas (which ends at y 170), and still drawn.
//   frame (inner's 0..60 × 0..40): corner (0, 0) − pivot = (−30, −20) → R(90) (20, −30) → (70, 0) → (160, 10) → (260, 50); corner (60, 40) → (30, 20) → (−20, 30) → (30, 60)
//     → (80, 130) → (180, 170): x 180..260, y 50..170.
// A counter-clockwise turn would put markerA at (200, 70) instead; a scale about middle's centre or a pivot ignored would move it too.

type Box = [number, number, number, number];   // x0, y0, x1, y1 (canvas px; x1 / y1 exclusive)
interface Case { name: string; query: string; frame: Box; a: Box; b: Box }

const cases: Case[] = [
  { name: 'outer at (100, 40), middle scale 2, inner rotation 90 about its middle (the default)', query: '',
    frame: [180, 50, 260, 170], a: [236, 142, 244, 158], b: [214, 224, 226, 236] },
  // innerRot=0: markerA (20, −10) + (50, 30) = (70, 20) → ×2 + (20, 10) = (160, 50) → (260, 90); 16 × 8 → 252..268 × 86..94.
  //   markerB (60, 0) → (110, 30) → (240, 70) → (340, 110); 12 × 12 → 334..346 × 104..116 (right of inner's 60 and of middle's 100: middle x 110).
  //   frame (−30, −20) → (20, 10) → (60, 30) → (160, 70); (30, 20) → (80, 50) → (180, 110) → (280, 150).
  { name: 'inner rotation 0', query: 'innerRot=0',
    frame: [160, 70, 280, 150], a: [252, 86, 268, 94], b: [334, 104, 346, 116] },
  // innerRot=180, R(180)(dx, dy) = (−dx, −dy): markerA (−20, 10) → (30, 40) → (80, 90) → (180, 130); 16 × 8 → 172..188 × 126..134.
  //   markerB (−60, 0) → (−10, 30) (left of middle's 0) → (0, 70) → (100, 110); 94..106 × 104..116. frame: the same rectangle as rotation 0 (the pivot is its middle).
  { name: 'inner rotation 180', query: 'innerRot=180',
    frame: [160, 70, 280, 150], a: [172, 126, 188, 134], b: [94, 104, 106, 116] },
  // outer at (60, 20), middle scale 3, inner rotation 90: markerA R(90) (10, 20) → (60, 50) → ×3 + (20, 10) = (200, 160) → (260, 180); 4 × 8 × 3 = 12 × 24 → 254..266 × 168..192.
  //   markerB (0, 60) → (50, 90) → (170, 280) → (230, 300); 18 × 18 → 221..239 × 291..309.
  //   frame (20, −30) → (70, 0) → (230, 10) → (290, 30); (−20, 30) → (30, 60) → (110, 190) → (170, 210).
  { name: 'outer at (60, 20), middle scale 3', query: 'outerX=60&outerY=20&midScale=3',
    frame: [170, 30, 290, 210], a: [254, 168, 266, 192], b: [221, 291, 239, 309] },
  // inner pivot (0, 0) (its top-left corner sits at (50, 30) and it turns about it), rotation 90: markerA (50, 10) → R(90) (−10, 50) → (40, 80) → (100, 170) → (200, 210);
  //   8 × 16 → 196..204 × 202..218. markerB (90, 20) → (−20, 90) → (30, 120) → (80, 250) → (180, 290); 174..186 × 284..296.
  //   frame (0, 0) → (50, 30) → (120, 70) → (220, 110); (60, 40) → (−40, 60) → (10, 90) → (40, 190) → (140, 230).
  { name: 'inner pivot (0, 0)', query: 'innerPivotX=0&innerPivotY=0',
    frame: [140, 110, 220, 230], a: [196, 202, 204, 218], b: [174, 284, 186, 296] },
];

const mid = (b: Box): [number, number] => [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
const disjoint = (p: Box, q: Box) => p[2] <= q[0] || q[2] <= p[0] || p[3] <= q[1] || q[3] <= p[1];

async function read(film: Film, c: Case) {
  const [ax, ay] = mid(c.a), [bx, by] = mid(c.b);
  // a row and a column through the frame 4 px inside its top-left corner (the cases keep markerA off these lines)
  const fRow = c.frame[1] + 4, fCol = c.frame[0] + 4;
  return film.eval<any>(`(() => ({
    logs: window.__logs, size: window.__size,
    centres: { a: pixel(${ax}, ${ay}), b: pixel(${bx}, ${by}), frame: pixel(${c.frame[0] + 2}, ${c.frame[1] + 2}) },
    aRow: runs('x', ${ay}, 'white'), aCol: runs('y', ${ax}, 'white'),
    bRow: runs('x', ${by}, 'green'), bCol: runs('y', ${bx}, 'green'),
    fRow: runs('x', ${fRow}, 'blue'), fCol: runs('y', ${fCol}, 'blue'),
    bounds: { a: bounds('markerA'), b: bounds('markerB'), frame: bounds('frame') },
  }))()`);
}

function expectRun(runs: [number, number][], from: number, to: number, what: string) {
  expect(runs.length, `${what}: one run: ${JSON.stringify(runs)}`).toBe(1);
  expect(Math.abs(runs[0]![0] - from), `${what}: starts at ${runs[0]![0]}, the documents put the edge at ${from}`).toBeLessThanOrEqual(1);
  expect(Math.abs(runs[0]![1] - to), `${what}: ends at ${runs[0]![1]} (exclusive), the documents put the edge at ${to}`).toBeLessThanOrEqual(1);
}

function expectBounds(b: { x: number; y: number; width: number; height: number } | null, box: Box, what: string) {
  expect(b, `${what}: inspect(0) reports it`).not.toBeNull();
  const got = [b!.x, b!.y, b!.x + b!.width, b!.y + b!.height];
  got.forEach((v, i) => expect(Math.abs(v - box[i]!), `${what}: inspect bounds ${JSON.stringify(got)}, the documents give ${JSON.stringify(box)}`).toBeLessThanOrEqual(1));
}

runFilms('Geometry: nested compositions two deep (a parent moves its children; a composition does not clip)', () => {
  for (const c of cases) {
    it(`${c.name}: the markers and inner's rectangle land where the composition rules put them, and markerB outside inner is drawn`, async () => {
      // the design itself: markerB lies outside inner's own rectangle on the canvas (it is the "not clipped" marker), markerA inside it
      expect(disjoint(c.b, c.frame), `${c.name}: markerB ${JSON.stringify(c.b)} is outside the frame ${JSON.stringify(c.frame)}`).toBe(true);
      expect(c.a[0] >= c.frame[0] && c.a[1] >= c.frame[1] && c.a[2] <= c.frame[2] && c.a[3] <= c.frame[3]).toBe(true);
      await withFilm('geometry-nested-compositions', async (film) => {
        const r = await read(film, c);
        expect(r.logs).toEqual([]);
        expect(r.size).toEqual([640, 360]);
        expect(r.centres, `${c.name}: the colour at markerA's, markerB's and the frame's documented places`).toEqual({ a: 'white', b: 'green', frame: 'blue' });
        expectRun(r.aRow, c.a[0], c.a[2], `${c.name}, markerA along row y = ${mid(c.a)[1]}`);
        expectRun(r.aCol, c.a[1], c.a[3], `${c.name}, markerA along column x = ${mid(c.a)[0]}`);
        expectRun(r.bRow, c.b[0], c.b[2], `${c.name}, markerB along row y = ${mid(c.b)[1]}`);
        expectRun(r.bCol, c.b[1], c.b[3], `${c.name}, markerB along column x = ${mid(c.b)[0]}`);
        expectRun(r.fRow, c.frame[0], c.frame[2], `${c.name}, inner's rectangle along row y = ${c.frame[1] + 4}`);
        expectRun(r.fCol, c.frame[1], c.frame[3], `${c.name}, inner's rectangle along column x = ${c.frame[0] + 4}`);
        expectBounds(r.bounds.a, c.a, `${c.name}, markerA`);
        expectBounds(r.bounds.b, c.b, `${c.name}, markerB`);
        expectBounds(r.bounds.frame, c.frame, `${c.name}, frame`);
      }, c.query ? { query: c.query } : {});
    }, 120_000);
  }
});
