// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Holes in a path, read as pixels. The expected answers come from the documents, not from a run:
//  - docs/dsl.md, "Holes (fillRule: 'evenodd') on a path": "Several sub-paths in one d are each filled on their own: a donut written as two circles is a solid disc.
//    With fillRule: 'evenodd' the biggest sub-path is the shape and every other one is a hole cut out of it."
//  - skills/pixi-effects/reference/cheatsheet.md, the path row of the shape table: "several sub-paths are each filled alone (a donut written as two circles is a disc)
//    unless fillRule: 'evenodd': the biggest is the shape, the others are holes"; "leave x / y out and it sits where d says".
// The film: black background (#000000), yellow fill (#ffcc00), no stroke; donuts of r 70 / 35, a star (r 55 / 25) written BEFORE the 140 x 140 square around it
// (so "the biggest is the shape" is pinned, not "the first"). The left column has no fillRule, the right column 'evenodd'; ?flip=1 swaps them.
const FILL = [255, 204, 0], BG = [0, 0, 0];
type Where = 'hole' | 'ring' | 'outside';
// probes, relative to a shape's centre, each well inside its region (10 px or more from every edge but the star arm, 6 px)
const DONUT: Array<[Where, number, number]> = [['hole', 0, 0], ['hole', 15, -15], ['ring', 52, 0], ['ring', 0, -52], ['outside', 85, 0], ['outside', -85, 0]];
// 'hole' here is inside the star: its middle and its top arm (6 px from the arm's edges at y = -40); 'ring' is the square outside the star (corners, 85 px from the middle > 55)
const STAR: Array<[Where, number, number]> = [['hole', 0, 0], ['hole', 0, -40], ['ring', -60, -60], ['ring', 60, 60], ['outside', 85, 0], ['outside', -85, 0]];
// what the documents say each point is: without fillRule every sub-path is filled (the hole is the fill colour too); with 'evenodd' the smaller one is cut out
const expected = (where: Where, evenodd: boolean) => (where === 'outside' ? BG : where === 'ring' ? FILL : evenodd ? BG : FILL);

async function probe(film: Film, evenoddOn: { left: boolean; right: boolean }) {
  const centres = await film.eval<Record<string, [number, number]>>('window.centres');
  const rows: Array<{ label: string; at: [number, number]; want: number[] }> = [];
  for (const [name, [cx, cy]] of Object.entries(centres)) {
    const evenodd = name.endsWith('Left') ? evenoddOn.left : evenoddOn.right;
    for (const [where, dx, dy] of name.startsWith('donut') ? DONUT : STAR) rows.push({ label: `${name} (${evenodd ? "fillRule: 'evenodd'" : 'no fillRule'}) ${where} at (${cx + dx}, ${cy + dy})`, at: [cx + dx, cy + dy], want: expected(where, evenodd) });
  }
  const got = await film.eval<{ size: [number, number]; px: number[][] }>(`pixelsAt(${JSON.stringify(rows.map((r) => r.at))})`);
  expect(got.size, 'the snapshot is the canvas at its own size').toEqual([640, 360]);
  rows.forEach((r, i) => {
    const px = got.px[i]!;
    expect(Math.max(...px.map((v, c) => Math.abs(v - r.want[c]!))), `${r.label}: got rgb(${px.join(', ')}), want rgb(${r.want.join(', ')})`).toBeLessThanOrEqual(2);
  });
  expect(await film.eval<string[]>('window.__logs'), 'no warning: fillRule is a known option of a path').toEqual([]);
}

runFilms("Shapes: a path's sub-paths are filled one by one, unless fillRule: 'evenodd' cuts the smaller ones out of the biggest", () => {
  it("a donut of two circles is a full disc without fillRule and a ring with 'evenodd'; a star written before its square is filled without it and a hole with it", async () => {
    await withFilm('shape-evenodd', (film) => probe(film, { left: false, right: true }));
  }, 120_000);

  it("?flip=1 gives the left column 'evenodd' and takes it from the right: the holes move with the option", async () => {
    await withFilm('shape-evenodd', (film) => probe(film, { left: true, right: false }), { query: 'flip=1' });
  }, 120_000);
});
