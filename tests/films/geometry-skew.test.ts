// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Skew about the anchor. A white 160 x 80 rect at (320, 180) on black, skewed, its anchor in the middle or at its top-left corner.
//
// Where the answers come from (written before the film was run):
// - docs/dsl.md "PIXI shorthands" (`skew, skewX, skewY` is one of the shorthands the timeline understands; the value is PixiJS's own skew)
//   and docs/dsl.md "Anchors and origins" / skills/pixi-effects/reference/cheatsheet.md line 10: skew is in DEGREES.
// - docs/dsl.md "Anchors and origins": for a rect, `anchorX` / `anchorY` (0–1) choose the point of the box that sits at x, y;
//   src/sequences/Shape.ts: "The local origin sits at (anchorX * w, anchorY * h) of the rect".
// - node_modules/pixi.js/lib/scene/container/Container.d.ts, the transform table: the pivot (the local origin) is "the center of rotation,
//   scaling, and skewing", and "In PixiJS, skew has a slightly different behaviour than the conventional meaning. It can be thought of the
//   net rotation applied to the coordinate axes (separately)": skew.x = α turns the local y axis by α, skew.y = β turns the local x axis by β.
//   With no rotation and scale 1 a local point (x, y) lands at  X = x0 + x·cos β + y·sin α,  Y = y0 + x·sin β + y·cos α
//   (NOT the CSS / After Effects shear X = x + y·tan α, Y = y: the height under skewX shrinks by cos α, the width under skewY by cos β).
// The numbers below are those formulas worked by hand: sin 40° = 0.6427876, cos 40° = 0.7660444, sin 20° = 0.3420201, cos 20° = 0.9396926.

type P = [number, number];
interface Case { name: string; query: string; corners: [P, P, P, P]; /** a column (axis 'y', at x) or a row (axis 'x', at y), and the white run the formula gives along it */ run: { axis: 'x' | 'y'; at: number; from: number; to: number } }

const cases: Case[] = [
  // control: no skew, anchor in the middle: the box is (240..400) x (140..220)
  { name: 'skew 0, anchor middle (control)', query: 'skewX=0&skewY=0&anchorX=0.5&anchorY=0.5',
    corners: [[240, 140], [400, 140], [400, 220], [240, 220]], run: { axis: 'y', at: 320, from: 140, to: 220 } },
  // skewX 40°, anchor middle: local corners (±80, ±40); y·sin 40° = ±25.7115, y·cos 40° = ±30.6418
  { name: 'skewX 40, anchor middle', query: 'skewX=40&skewY=0&anchorX=0.5&anchorY=0.5',
    corners: [[214.2885, 149.3582], [374.2885, 149.3582], [425.7115, 210.6418], [265.7115, 210.6418]],
    // column x = 320: from the top edge (y 149.36) to the bottom edge (y 210.64): 61.28 px high, 80·cos 40° (a tan shear would keep 80: 140..220)
    run: { axis: 'y', at: 320, from: 149.3582, to: 210.6418 } },
  // skewY 20°, anchor middle: x·cos 20° = ±75.1754, x·sin 20° = ±27.3616
  { name: 'skewY 20, anchor middle', query: 'skewX=0&skewY=20&anchorX=0.5&anchorY=0.5',
    corners: [[244.8246, 112.6384], [395.1754, 167.3616], [395.1754, 247.3616], [244.8246, 192.6384]],
    // row y = 180: from the left edge (x 244.82) to the right edge (x 395.18): 150.35 px wide, 160·cos 20° (a tan shear would keep 160: 240..400)
    run: { axis: 'x', at: 180, from: 244.8246, to: 395.1754 } },
  // skewX 40°, anchor top-left: local corners (0..160, 0..80); the top-left corner stays at (320, 180); 80·sin 40° = 51.4230, 80·cos 40° = 61.2836
  { name: 'skewX 40, anchor top-left', query: 'skewX=40&skewY=0&anchorX=0&anchorY=0',
    corners: [[320, 180], [480, 180], [531.4230, 241.2836], [371.4230, 241.2836]],
    // column x = 400 (between the bottom-left corner's x 371.4 and the top-right's 480): from the top edge 180 to the bottom edge 241.28
    run: { axis: 'y', at: 400, from: 180, to: 241.2836 } },
  // skewY 20°, anchor top-left: the top-left corner stays at (320, 180); 160·cos 20° = 150.3508, 160·sin 20° = 54.7232
  { name: 'skewY 20, anchor top-left', query: 'skewX=0&skewY=20&anchorX=0&anchorY=0',
    corners: [[320, 180], [470.3508, 234.7232], [470.3508, 314.7232], [320, 260]],
    // row y = 250 (below the top edge's lowest point 234.7, above the bottom edge's highest 260): from the left edge 320 to the right edge 470.35
    run: { axis: 'x', at: 250, from: 320, to: 470.3508 } },
];

/** For each corner: a point 7 px inside it along the bisector of its two edges, and 7 px outside (the far side of the corner). */
function probes(c: [P, P, P, P]) {
  const unit = (v: P): P => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
  return c.map((p, i) => {
    const a = unit([c[(i + 3) % 4]![0] - p[0], c[(i + 3) % 4]![1] - p[1]]), b = unit([c[(i + 1) % 4]![0] - p[0], c[(i + 1) % 4]![1] - p[1]]);
    const bis = unit([a[0] + b[0], a[1] + b[1]]);
    return { corner: p, inside: [p[0] + 7 * bis[0], p[1] + 7 * bis[1]] as P, outside: [p[0] - 7 * bis[0], p[1] - 7 * bis[1]] as P };
  });
}

async function read(film: Film, c: Case) {
  const pts = probes(c.corners);
  return film.eval<any>(`(() => ({
    logs: window.__logs, size: window.__size,
    probes: ${JSON.stringify(pts)}.map(p => ({ inside: pixel(...p.inside), outside: pixel(...p.outside) })),
    runs: runs(${JSON.stringify(c.run.axis)}, ${c.run.at}),
  }))()`);
}

runFilms('Geometry: skew is in degrees, turns the axes the PixiJS way, about the anchor', () => {
  for (const c of cases) {
    it(`${c.name}: the corners land where the documents put them, and the white run along one line has the documented length`, async () => {
      await withFilm('geometry-skew', async (film) => {
        const r = await read(film, c);
        expect(r.logs).toEqual([]);
        expect(r.size).toEqual([640, 360]);
        probes(c.corners).forEach((p, i) => {
          expect(r.probes[i].inside, `${c.name}, corner ${i} (${p.corner.map((v) => v.toFixed(1))}): 7 px inside it, at (${p.inside.map((v) => v.toFixed(1))}), is the white rect`).toBeGreaterThan(220);
          expect(r.probes[i].outside, `${c.name}, corner ${i} (${p.corner.map((v) => v.toFixed(1))}): 7 px outside it, at (${p.outside.map((v) => v.toFixed(1))}), is the black background`).toBeLessThan(35);
        });
        // one white run along the line, its ends within 1 px of the edges the formula gives
        expect(r.runs.length, `${c.name}: one white run along ${c.run.axis === 'y' ? 'column x' : 'row y'} = ${c.run.at}: ${JSON.stringify(r.runs)}`).toBe(1);
        const [from, to] = r.runs[0];
        expect(Math.abs(from - c.run.from), `${c.name}: the run starts at ${from}, the edge is at ${c.run.from}`).toBeLessThanOrEqual(1);
        expect(Math.abs(to - c.run.to), `${c.name}: the run ends at ${to} (exclusive), the edge is at ${c.run.to}`).toBeLessThanOrEqual(1);
      }, { query: c.query });
    }, 120_000);
  }
});
