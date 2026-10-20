// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// fillRule: 'evenodd' with a stroke, and an island inside a hole, read as pixels along the middle row and column and counted in boxes.
// The film: three nested squares round (320, 180) in one path: outer half-size 150, hole 100, island 50; fill #ffcc00, stroke #0066ff, black background.
//
// Where the answers come from (written before the film was run):
// - docs/dsl.md, "Holes (fillRule: 'evenodd') on a path": "With fillRule: 'evenodd' the biggest sub-path is the shape and every other one is a hole cut out of it
//   (the stroke goes round the shape and each hole)" and "an island inside a hole is not drawn".
//   skills/pixi-effects/reference/cheatsheet.md, the path row: "unless fillRule: 'evenodd': the biggest is the shape, the others are holes".
//   So: the ring between the outer outline and the hole is the fill; the hole is empty; the island adds nothing (no fill anywhere inside the hole).
// - docs/dsl.md, the Style table: "strokeWidth | Pixels. Default 0 (no stroke)"; "strokeColor ... Requires strokeWidth > 0 to render".
// - docs/dsl.md, "Draw-on": trimStart / trimEnd (default 0 and 1) "are the part of the outline that is stroked" and "a path's several sub-paths count as one
//   length": with no trim the stroke runs along every sub-path. Without fillRule "several sub-paths in one d are each filled on their own" (dsl.md, Holes).
// - The documents do NOT say where a shape's stroke sits on its outline (centred, inside or outside; only TEXT is said to be "centred on the glyph edge"),
//   nor whether the outline of an island that "is not drawn" is stroked. So a stroke run is pinned to be strokeWidth px wide (±1) and to touch the outline
//   (it starts at most 1 px after it and ends at most 1 px before it), whatever its alignment; the island's outline is not pinned. Both are reported as doc-gaps.
//
// Along a line through the centre c (320 on the row, 180 on the column), with W the strokeWidth, the outlines are at c ± 150 (outer), c ± 100 (hole), c ± 50 (island).
// Every probed region keeps W + 1 px from every outline, so it holds whatever the stroke's alignment.
//
// FOUND (library bug, pinned with it.fails below): with an island inside the hole, a wedge of the fill colour is drawn INSIDE the hole, between the hole's
// top-left and the island (on frame 0, row 180: x 245..264 yellow; column 320: y 105..124). With ?island=0 the same hole is clean (the control test).

const FILL = [255, 204, 0], STROKE = [0, 102, 255], BG = [0, 0, 0];
type Cls = 'bg' | 'fill' | 'stroke' | 'mix';
const near = (p: number[], c: number[]) => Math.max(...p.map((v, i) => Math.abs(v - c[i]!))) <= 2;
const cls = (p: number[]): Cls => (near(p, BG) ? 'bg' : near(p, FILL) ? 'fill' : near(p, STROKE) ? 'stroke' : 'mix');
const FILM = 'shape-evenodd-stroke-and-islands';
const CX = 320, CY = 180;

interface Case { name: string; query: string; W: number; evenodd: boolean; island: boolean }
const cases: Case[] = [
  { name: "fillRule 'evenodd', strokeWidth 10", query: '', W: 10, evenodd: true, island: true },
  { name: "fillRule 'evenodd', sub-paths written island, hole, outer (the biggest is still the shape)", query: 'order=reverse', W: 10, evenodd: true, island: true },
  { name: "fillRule 'evenodd', strokeWidth 4 (the stroke runs follow the width)", query: 'stroke=4', W: 4, evenodd: true, island: true },
  { name: "fillRule 'evenodd', strokeWidth 0 (no stroke at all)", query: 'stroke=0', W: 0, evenodd: true, island: true },
  { name: "fillRule 'evenodd', no island (a frame with a plain hole: the control)", query: 'island=0', W: 10, evenodd: true, island: false },
  { name: 'no fillRule, strokeWidth 10 (every sub-path filled and stroked)', query: 'rule=none', W: 10, evenodd: false, island: true },
];

interface Region { label: string; from: number; to: number; want: Cls }
/** What the documents say along one line through the centre c: [from, to) ranges and the class every pixel in them must have, and the outlines whose stroke is promised. */
function expectedLine(c: number, k: Case) {
  const m = k.W + 1;                                   // the margin from an outline that any stroke alignment leaves alone
  const outline: Region[] = [], hole: Region[] = [];
  const span = (a: number, b: number) => ({ from: Math.min(a, b), to: Math.max(a, b) });
  for (const s of [-1, 1] as const) {
    const side = s < 0 ? 'near side' : 'far side';
    const [o, h, i] = [c + s * 150, c + s * 100, c + s * 50];
    outline.push({ label: `outside the shape (${side})`, ...(s < 0 ? { from: 0, to: o - m } : { from: o + m, to: 2 * c }), want: 'bg' });
    outline.push({ label: `between the outer outline and the hole (${side})`, ...span(o - s * m, h + s * m), want: 'fill' });
    // with an island: from the hole's outline to the island's; without: the hole's outline to the middle (the island's region is checked below in both cases)
    const r = { label: `inside the hole, outside the island (${side})`, ...span(h - s * m, k.island ? i + s * m : c - s * m), want: (k.evenodd ? 'bg' : 'fill') as Cls };
    (k.evenodd ? hole : outline).push(r);
  }
  outline.push({ label: k.island ? 'inside the island' : 'the middle of the hole', from: c - 50 + m, to: c + 50 - m, want: k.evenodd ? 'bg' : 'fill' });
  // the stroke is promised round the shape and each hole; without fillRule the trim text says every sub-path is stroked, the island too
  const stroked = [c - 150, c + 150, c - 100, c + 100, ...(!k.evenodd && k.island ? [c - 50, c + 50] : [])];
  return { outline, hole, stroked };
}

/** The runs of stroke-coloured pixels on [from, to): [[start, endExclusive], ...]. */
function strokeRuns(line: Cls[], from: number, to: number): Array<[number, number]> {
  const out: Array<[number, number]> = []; let s = -1;
  for (let i = from; i <= to; i++) { const on = i < to && line[i] === 'stroke'; if (on && s < 0) s = i; if (!on && s >= 0) { out.push([s, i]); s = -1; } }
  return out;
}

const LINES = [['x', CY, CX, 'row y = 180'], ['y', CX, CY, 'column x = 320']] as const;
const readLine = async (film: Film, axis: 'x' | 'y', at: number) => (await film.eval<number[][]>(`line(${JSON.stringify(axis)}, ${at})`)).map(cls);

function checkRegions(line: Cls[], regions: Region[], label: string): void {
  for (const r of regions) {
    const bad = [] as number[];
    for (let i = r.from; i < r.to; i++) if (line[i] !== r.want) bad.push(i);
    expect(bad.length, `${label}: ${r.label}, ${r.from}..${r.to - 1} is all ${r.want}; not at ${bad.slice(0, 6).join(', ')}${bad.length > 6 ? ' …' : ''} (${bad.slice(0, 3).map((i) => line[i]).join(', ')})`).toBe(0);
  }
}

/** The shape, its stroke round the outer outline and the hole, the ring of fill, and the island's own inside: everything the library gets right. */
async function probeOutline(film: Film, k: Case) {
  expect(await film.eval<string[]>('window.__logs'), 'no warning: fillRule and a stroke are known options of a path').toEqual([]);
  expect(await film.eval<number[]>('window.__size'), 'the snapshot is the canvas at its own size').toEqual([640, 360]);
  for (const [axis, at, c, where] of LINES) {
    const line = await readLine(film, axis, at);
    const { outline, stroked } = expectedLine(c, k);
    checkRegions(line, outline, `${k.name}, ${where}`);
    if (k.W === 0) {
      expect(strokeRuns(line, 0, line.length), `${k.name}, ${where}: strokeWidth 0 draws no stroke`).toEqual([]);
      continue;
    }
    for (const e of stroked) {
      const runs = strokeRuns(line, e - k.W - 1, e + k.W + 1);
      expect(runs.length, `${k.name}, ${where}: one stroke run at the outline ${e}: ${JSON.stringify(runs)}`).toBe(1);
      const [s, t] = runs[0]!;
      expect(Math.abs((t - s) - k.W), `${k.name}, ${where}: the stroke at ${e} is ${t - s} px wide (${s}..${t - 1}), strokeWidth is ${k.W}`).toBeLessThanOrEqual(1);
      expect(s <= e + 1 && t >= e - 1, `${k.name}, ${where}: the stroke run ${s}..${t - 1} touches the outline at ${e}`).toBe(true);
    }
  }
  // the island's inside, as a box: all background with evenodd ("an island inside a hole is not drawn"), all fill without
  const m = k.W + 1, box = [CX - 50 + m, CY - 50 + m, CX + 50 - m, CY + 50 - m];
  const area = (box[2]! - box[0]!) * (box[3]! - box[1]!);
  expect(await film.eval<number>(`countNear(${JSON.stringify(k.evenodd ? BG : FILL)}, ${box.join(', ')})`), `${k.name}: the ${area} px inside the island are all ${k.evenodd ? 'background' : 'fill'}`).toBe(area);
}

/** evenodd only: the hole is empty, the island adds nothing to it (no fill colour anywhere inside the hole's outline margin). */
async function probeHole(film: Film, k: Case) {
  for (const [axis, at, c, where] of LINES) checkRegions(await readLine(film, axis, at), expectedLine(c, k).hole, `${k.name}, ${where}`);
  const m = k.W + 1;
  const fillInHole = await film.eval<number>(`countNear(${JSON.stringify(FILL)}, ${CX - 100 + m}, ${CY - 100 + m}, ${CX + 100 - m}, ${CY + 100 - m})`);
  expect(fillInHole, `${k.name}: pixels of the fill colour inside the hole (x ${CX - 100 + m}..${CX + 100 - m - 1}, y ${CY - 100 + m}..${CY + 100 - m - 1})`).toBe(0);
}

runFilms("Shapes: fillRule 'evenodd' strokes the shape and every hole, and an island inside a hole is not drawn", () => {
  for (const k of cases) {
    it(`${k.name}: background, stroke, fill, stroke along the middle row and column; the ${k.island ? "island's inside" : "hole's middle"} as documented`, async () => {
      await withFilm(FILM, (film) => probeOutline(film, k), { query: k.query });
    }, 120_000);
  }

  for (const k of cases.filter((c) => c.evenodd)) {
    // A library bug (see FOUND above): the documented answer is kept; it.fails until the wedge is gone. The control (no island) passes as a plain it.
    const test = it;                                                       // (the island case was it.fails until 0.47.5: a wedge of fill inside the hole)
    test(`${k.name}: the hole is empty: no fill colour anywhere inside it${k.island ? ' (FAILS: an island leaks a wedge of fill into the hole)' : ''}`, async () => {
      await withFilm(FILM, (film) => probeHole(film, k), { query: k.query });
    }, 120_000);
  }
});
