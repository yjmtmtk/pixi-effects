// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Shapes and paths: morph. A white path on black: an 80 x 80 square (d) morphing into a 200 x 200 square (?to=square, the default) or a
// 320 x 80 rectangle (?to=wide), the second outline written from another corner and in the other direction (see the film's comment).
//
// Where the answers come from (written before the film was run):
// - skills/pixi-effects/reference/cheatsheet.md, the path row of the shape table: "leave x / y out and it sits where d says"; "Morph: morphTo: 'M…Z'
//   + animate morph 0 → 1 (points half way between, closed outlines lined up so they do not twist; … two outlines with the same number of corners are
//   paired corner to corner, so a quad stays a sharp quad)".
// - docs/dsl.md "Morph (morphTo / morph)": "Two outlines with the same number of corners, such as two quads, are paired corner to corner, so every
//   in-between picture is a straight-edged quad and no corner is rounded; morphPoints only matters when the corner counts differ"; "animate morph from
//   0 (the d outline) to 1 (the morphTo outline). In between it is drawn as a polygon of points half way from one to the other"; "Closed outlines are
//   lined up (start point and direction) so they do not twist"; "morphTo (SVG path data in the same canvas coordinates as d)".
// - So: frame 0 is the first square; frame 30 (1 s, the keyframe's end with ease 'none') is the second outline and it holds there (frame 45);
//   frame 15 is morph 0.5, a quad whose corners are the midpoints of the paired corners, top-left with top-left (lined up: no twist), whatever corner
//   and direction morphTo was written from.
//   square: (60,40)+(400,140) → (230,90); (140,40)+(600,140) → (370,90); (140,120)+(600,340) → (370,230); (60,120)+(400,340) → (230,230): a 140 x 140 square.
//   wide:   (60,40)+(300,240) → (180,140); (140,40)+(620,240) → (380,140); (140,120)+(620,320) → (380,220); (60,120)+(300,320) → (180,220): a 200 x 80 rect.
//   In the wide case resampling by length would NOT give this (the first square's corners lie at 0, 1/4, 1/2, 3/4 of its outline, the rectangle's at
//   0, 0.4, 0.5, 0.9): the corner (380, 140) would be cut off by a line from (320, 140) to (380, 164), so the probe just inside it would be black.
// - docs/api.md inspect(): bounds are in canvas pixels; for an axis-aligned quad they are the box of its four corners.

type P = [number, number];
interface Shot { frame: number; what: string; corners: [P, P, P, P]; /** points that must be black at this frame (where the other outlines are) */ empty: P[] }

const A: [P, P, P, P] = [[60, 40], [140, 40], [140, 120], [60, 120]];
const cases: Record<string, Shot[]> = {
  square: [
    { frame: 0, what: 'morph 0: the d square', corners: A, empty: [[500, 240], [300, 160]] },
    { frame: 15, what: 'morph 0.5: corners half way between the paired corners', corners: [[230, 90], [370, 90], [370, 230], [230, 230]], empty: [[100, 80], [500, 300], [580, 320]] },
    { frame: 30, what: 'morph 1: the morphTo square', corners: [[400, 140], [600, 140], [600, 340], [400, 340]], empty: [[100, 80], [300, 160]] },
    { frame: 45, what: 'after the keyframe: morph holds at 1', corners: [[400, 140], [600, 140], [600, 340], [400, 340]], empty: [[100, 80], [300, 160]] },
  ],
  wide: [
    { frame: 0, what: 'morph 0: the d square', corners: A, empty: [[460, 280], [280, 180]] },
    { frame: 15, what: 'morph 0.5: corners half way between the paired corners', corners: [[180, 140], [380, 140], [380, 220], [180, 220]], empty: [[100, 80], [460, 280]] },
    { frame: 30, what: 'morph 1: the morphTo rectangle', corners: [[300, 240], [620, 240], [620, 320], [300, 320]], empty: [[100, 80], [280, 180]] },
    { frame: 45, what: 'after the keyframe: morph holds at 1', corners: [[300, 240], [620, 240], [620, 320], [300, 320]], empty: [[100, 80], [280, 180]] },
  ],
};

/** For each corner of an axis-aligned quad: 4 px inside it along the bisector of its two edges, and 4 px outside (beyond the corner). */
function probes(c: [P, P, P, P]) {
  const unit = (v: P): P => { const l = Math.hypot(v[0], v[1]); return [v[0] / l, v[1] / l]; };
  return c.map((p, i) => {
    const a = unit([c[(i + 3) % 4]![0] - p[0], c[(i + 3) % 4]![1] - p[1]]), b = unit([c[(i + 1) % 4]![0] - p[0], c[(i + 1) % 4]![1] - p[1]]);
    const bis = unit([a[0] + b[0], a[1] + b[1]]);
    return { corner: p, inside: [p[0] + 4 * bis[0], p[1] + 4 * bis[1]] as P, outside: [p[0] - 4 * bis[0], p[1] - 4 * bis[1]] as P };
  });
}
const box = (c: [P, P, P, P]) => { const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };

async function read(film: Film, s: Shot) {
  const b = box(s.corners), midX = b.x + b.w / 2, midY = b.y + b.h / 2;
  return film.eval<any>(`(async () => ({
    size: await size(${s.frame}),
    probes: await Promise.all(${JSON.stringify(probes(s.corners))}.map(async p => ({ inside: await pixel(${s.frame}, ...p.inside), outside: await pixel(${s.frame}, ...p.outside) }))),
    empty: await Promise.all(${JSON.stringify(s.empty)}.map(p => pixel(${s.frame}, ...p))),
    row: await runs(${s.frame}, 'x', ${midY}), col: await runs(${s.frame}, 'y', ${midX}),
    bounds: await bounds(${s.frame}),
    logs: window.__logs,
  }))()`);
}

/** Every shot of one case: the corner probes, the empty places, the straight white runs through the middle, and inspect()'s bounds. */
async function checkShots(film: Film, label: string, shots: Shot[]) {
  for (const s of shots) {
    const r = await read(film, s);
    const b = box(s.corners);
    const tag = `${label}, frame ${s.frame} (${s.what})`;
    expect(r.logs).toEqual([]);
    expect(r.size).toEqual([640, 360]);
    probes(s.corners).forEach((p, i) => {
      expect(r.probes[i].inside, `${tag}, corner ${i} (${p.corner}): 4 px inside it, at (${p.inside.map((v) => v.toFixed(1))}), is white (the corner is sharp, not cut)`).toBeGreaterThan(220);
      expect(r.probes[i].outside, `${tag}, corner ${i} (${p.corner}): 4 px outside it, at (${p.outside.map((v) => v.toFixed(1))}), is black (the edges are straight up to the corner)`).toBeLessThan(35);
    });
    s.empty.forEach((p, i) => expect(r.empty[i], `${tag}: (${p}) is black, no outline there`).toBeLessThan(35));
    // straight edges: one white run along the middle row and the middle column, its ends on the quad's edges (within 1 px)
    expect(r.row, `${tag}: row y = ${b.y + b.h / 2}`).toHaveLength(1);
    expect(Math.abs(r.row[0][0] - b.x), `${tag}: row starts at ${r.row[0][0]}, left edge ${b.x}`).toBeLessThanOrEqual(1);
    expect(Math.abs(r.row[0][1] - (b.x + b.w)), `${tag}: row ends at ${r.row[0][1]}, right edge ${b.x + b.w}`).toBeLessThanOrEqual(1);
    expect(r.col, `${tag}: column x = ${b.x + b.w / 2}`).toHaveLength(1);
    expect(Math.abs(r.col[0][0] - b.y), `${tag}: column starts at ${r.col[0][0]}, top edge ${b.y}`).toBeLessThanOrEqual(1);
    expect(Math.abs(r.col[0][1] - (b.y + b.h)), `${tag}: column ends at ${r.col[0][1]}, bottom edge ${b.y + b.h}`).toBeLessThanOrEqual(1);
    // what inspect() says: the box of the four corners
    expect(r.bounds, `${tag}: inspect() bounds`).not.toBeNull();
    expect(Math.abs(r.bounds.x - b.x), `${tag}: bounds.x ${r.bounds.x} vs ${b.x}`).toBeLessThanOrEqual(1);
    expect(Math.abs(r.bounds.y - b.y), `${tag}: bounds.y ${r.bounds.y} vs ${b.y}`).toBeLessThanOrEqual(1);
    expect(Math.abs(r.bounds.width - b.w), `${tag}: bounds.width ${r.bounds.width} vs ${b.w}`).toBeLessThanOrEqual(1);
    expect(Math.abs(r.bounds.height - b.h), `${tag}: bounds.height ${r.bounds.height} vs ${b.h}`).toBeLessThanOrEqual(1);
  }
}

runFilms('Shapes: a path morph goes from d (0) to morphTo (1), corner to corner, half way between the paired corners', () => {
  for (const [to, shots] of Object.entries(cases)) {
    it(`?to=${to}: frames 0 / 15 / 30 / 45 are the first outline, the half-way quad (sharp corners, lined up), the second outline, and it holds`, async () => {
      await withFilm('shape-morph', (film) => checkShots(film, `?to=${to}`, shots), { query: `to=${to}` });
    }, 120_000);
  }

  // (found by this film, fixed in 0.47.4) The same square written 'M 60 40 … L 60 120 L 60 40 Z' (a line back to the start
  // before Z) still has four corners, so by docs/dsl.md ("Two outlines with the same number of corners, such as two quads, are paired corner to corner …
  // no corner is rounded") the half-way picture is the same sharp 200 x 80 rect. The library counts the repeated start point as a fifth corner
  // (src/sequences/morphPath.ts buildMorph compares fa.pts.length with fb.pts.length), falls back to resampling by length and cuts the corners:
  // 4 px inside the corner (180, 140) of frame 15 is black. (With ?to=square the edges are in proportion, so resampling happens to give the same picture.)
  it('?to=wide&close=line: a quad that ends with a line back to its start is still paired corner to corner (sharp half way)', async () => {
    await withFilm('shape-morph', (film) => checkShots(film, '?to=wide&close=line', cases.wide!), { query: 'to=wide&close=line' });
  }, 120_000);
});
