// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Media: an image's size and ratio. A generated 200 x 100 picture (a data URI from a canvas: the left half white, the right half black)
// on a blue background (#0000ff), 640 x 360, frame 0. The query sets x, y, anchorX / anchorY, scale, width, height of the image layer.
//
// Where the answers come from (written before the film was run):
// - skills/pixi-effects/reference/cheatsheet.md line 56 (image): "Default anchor top-left; natural size = `w`,`h`", and line 30: `w`, `h` are
//   "image/video natural size"; docs/dsl.md "### `image`": "Intrinsic `w`/`h` come from the loaded texture". So at scale 1 the picture is
//   drawn 200 x 100, its top-left corner at x, y.
// - docs/dsl.md "Anchors and origins": `text`, `image`, `video` land at x, y by "the **top-left** corner", "`anchorX` / `anchorY: 0.5` to centre".
//   PixiJS (node_modules/pixi.js/lib/scene/container/Container.d.ts, the transform table) scales about the local origin, which the anchor puts at
//   (anchorX·w, anchorY·h): with anchor 0.5 and scale 2 at (320, 180) the box is (320 − 200 .. 320 + 200) x (180 − 100 .. 180 + 100).
// - `scale` (one number, docs/dsl.md "PIXI shorthands") sets both axes: the ratio 2 : 1 is kept (400 x 200 at scale 2, each half a square).
// - docs/dsl.md "### Examples" under Expressions: "// Center an image  initial: { x: 'GW/2 - w/2', y: 'GH/2 - h/2' }" → 220..420 x 130..230.
// - docs/dsl.md scope table: `contain` = "scale factor that makes the sequence fit inside the parent (preserve aspect, no crop)",
//   `cover` = "… cover the parent (preserve aspect, may crop)"; `scale: 'cover'` is shown for video, but the words are the scope's and w, h
//   are the image's natural size (cheatsheet line 30). For 200 x 100 in 640 x 360: contain = min(640/200, 360/100) = 3.2 → 640 x 320;
//   cover = max(3.2, 3.6) = 3.6 → 720 x 360 (the right 80 px off the canvas).
// - width / height without scale: docs/dsl.md "PIXI shorthands" lists `width`, `height` among "plain DisplayObject props", i.e. PixiJS's
//   Sprite.width / .height. node_modules/pixi.js/lib/scene/sprite/Sprite.d.ts: "The width of the sprite, setting this will actually modify
//   the scale to achieve the value set", and its own example of "Set width while preserving aspect ratio" sets the height by hand: width alone
//   changes scale.x only. So width 300 → 300 x 100 (the ratio is NOT kept); height 200 → 200 x 200; both → exactly that box.
//   (docs/dsl.md itself never says that width alone stretches an image: reported as a doc gap.)
// - docs/api.md inspect(): `bounds` is "canvas pixels"; `onCanvas`: 'full' | 'partial' | 'none'.

type Box = { x: number; y: number; width: number; height: number };
interface Case { name: string; query: string; box: Box; onCanvas: 'full' | 'partial' }

const cases: Case[] = [
  { name: 'scale 1, anchor top-left at (20, 30): the natural 200 x 100', query: 'x=20&y=30', box: { x: 20, y: 30, width: 200, height: 100 }, onCanvas: 'full' },
  { name: 'scale 2, anchor top-left at (20, 30): 400 x 200, the ratio kept', query: 'x=20&y=30&scale=2', box: { x: 20, y: 30, width: 400, height: 200 }, onCanvas: 'full' },
  { name: 'scale 1, anchor 0.5 at (320, 180): centred on the point', query: 'x=320&y=180&anchor=0.5', box: { x: 220, y: 130, width: 200, height: 100 }, onCanvas: 'full' },
  { name: 'scale 2, anchor 0.5 at (320, 180): grows about its centre', query: 'x=320&y=180&anchor=0.5&scale=2', box: { x: 120, y: 80, width: 400, height: 200 }, onCanvas: 'full' },
  { name: "x 'GW/2 - w/2', y 'GH/2 - h/2' (the documented way to centre an image): w, h are 200, 100", query: `x=${encodeURIComponent('GW/2 - w/2')}&y=${encodeURIComponent('GH/2 - h/2')}`, box: { x: 220, y: 130, width: 200, height: 100 }, onCanvas: 'full' },
  { name: "scale 'contain' at (0, 0): 3.2 → 640 x 320", query: 'x=0&y=0&scale=contain', box: { x: 0, y: 0, width: 640, height: 320 }, onCanvas: 'full' },
  { name: "scale 'cover' at (0, 0): 3.6 → 720 x 360, cropped on the right", query: 'x=0&y=0&scale=cover', box: { x: 0, y: 0, width: 720, height: 360 }, onCanvas: 'partial' },
  { name: 'width 300 alone: 300 x 100 (width changes scale.x only)', query: 'x=20&y=30&width=300', box: { x: 20, y: 30, width: 300, height: 100 }, onCanvas: 'full' },
  { name: 'height 200 alone: 200 x 200 (height changes scale.y only)', query: 'x=20&y=30&height=200', box: { x: 20, y: 30, width: 200, height: 200 }, onCanvas: 'full' },
  { name: 'width 300 and height 50: exactly that box', query: 'x=20&y=30&width=300&height=50', box: { x: 20, y: 30, width: 300, height: 50 }, onCanvas: 'full' },
];

/** What the picture should show along one row (through the middle of the box) and one column (through the middle of the white half),
 *  each clipped to the canvas: where the white and the black start and end (end exclusive). */
function expected(b: Box) {
  const clipX = (v: number) => Math.min(640, Math.max(0, v)), clipY = (v: number) => Math.min(360, Math.max(0, v));
  const midX = b.x + b.width / 2;
  return {
    row: Math.floor(b.y + b.height / 2), col: Math.floor(b.x + b.width / 4),
    white: [clipX(b.x), clipX(midX)], black: [clipX(midX), clipX(b.x + b.width)],   // along the row
    tall: [clipY(b.y), clipY(b.y + b.height)],                                      // white along the column
  };
}

async function read(film: Film, e: ReturnType<typeof expected>) {
  return film.eval<any>(`(async () => ({
    logs: window.__logs, size: window.__size,
    row: spans('x', ${e.row}), col: spans('y', ${e.col}),
    layer: await layerOf(0),
  }))()`);
}

/** within 1 px of an edge (a scaled picture is filtered: the pixel on a boundary can go either way) */
const near = (got: number, want: number, what: string) => expect(Math.abs(got - want), `${what}: got ${got}, the documents say ${want}`).toBeLessThanOrEqual(1);

runFilms('Media: an image is drawn at its natural size, scaled about its anchor, the ratio kept by scale and by cover / contain', () => {
  for (const c of cases) {
    it(`${c.name}: the white and the black halves land where the documents put them, and inspect() reports the same box`, async () => {
      await withFilm('media-image-size', async (film) => {
        const e = expected(c.box);
        const r = await read(film, e);
        expect(r.logs).toEqual([]);
        expect(r.size).toEqual([640, 360]);
        // the row through the middle: white, then black, each one run of the documented length (count = end − start: no gap inside)
        const W = r.row.W, K = r.row.K, T = r.col.W;
        expect(W, `${c.name}: some white on row ${e.row}`).not.toBeNull();
        expect(K, `${c.name}: some black on row ${e.row}`).not.toBeNull();
        near(W[0], e.white[0], `${c.name}: row ${e.row}, the white starts`);
        near(W[1], e.white[1], `${c.name}: row ${e.row}, the white ends (exclusive)`);
        near(K[0], e.black[0], `${c.name}: row ${e.row}, the black starts`);
        near(K[1], e.black[1], `${c.name}: row ${e.row}, the black ends (exclusive)`);
        expect(Math.abs(W[2] - (e.white[1] - e.white[0])), `${c.name}: the white is one unbroken run`).toBeLessThanOrEqual(2);
        expect(Math.abs(K[2] - (e.black[1] - e.black[0])), `${c.name}: the black is one unbroken run`).toBeLessThanOrEqual(2);
        // the column through the white half: the drawn height
        near(T[0], e.tall[0], `${c.name}: column ${e.col}, the white starts`);
        near(T[1], e.tall[1], `${c.name}: column ${e.col}, the white ends (exclusive)`);
        // the drawn ratio (on-canvas parts) follows the box: 2 : 1 whenever only scale (or cover / contain) is given
        const drawnW = (K[1] - W[0]), drawnH = (T[1] - T[0]);
        const wantW = e.black[1] - e.white[0], wantH = e.tall[1] - e.tall[0];
        expect(Math.abs(drawnW / drawnH - wantW / wantH), `${c.name}: drawn ${drawnW} x ${drawnH}, the documents say ${wantW} x ${wantH}`).toBeLessThan(0.03);
        // nothing of the image outside its box: one pixel beyond each edge is the blue background (where it is on the canvas)
        for (const [x, y, side] of [[c.box.x - 1, e.row, 'left'], [c.box.x + c.box.width, e.row, 'right'], [e.col, c.box.y - 1, 'top'], [e.col, c.box.y + c.box.height, 'bottom']] as const) {
          if (x < 0 || y < 0 || x >= 640 || y >= 360) continue;
          expect(await film.eval<string>(`kindAt(${x}, ${y})`), `${c.name}: (${x}, ${y}), just outside the ${side} edge, is the background`).toBe('B');
        }
        // inspect(): the same box in canvas pixels
        expect(r.layer.visible).toBe(true);
        expect(r.layer.onCanvas).toBe(c.onCanvas);
        for (const k of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(r.layer.bounds[k] - c.box[k]), `${c.name}: inspect bounds.${k} = ${r.layer.bounds[k]}, the documents say ${c.box[k]}`).toBeLessThanOrEqual(0.5);
      }, { query: c.query });
    }, 120_000);
  }
});
