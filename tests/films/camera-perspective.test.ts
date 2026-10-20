// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Camera and 2.5D: the perspective numbers of the default camera. One white threeD rect, 200 x 100, centred on (320, 180) of a black 640 x 360 canvas,
// at the z of the query (?z=-400, ?z=200, ?z=cam = exactly on the camera plane), with no camera layer (the default camera) or ?fov=60 (a camera layer with only fov).
//
// Where the answers come from (written before the film was run):
// - docs/dsl.md "Camera" table: the camera's `z` default is `(H/2) / tan(fov/2)` ("Auto: if you never set it, it follows fov so the z = 0 plane stays 1:1"),
//   `fov` is the vertical field of view in degrees, default 40; `x`, `y` default `W/2`, `H/2`; it looks at `W/2, H/2, 0`.
//   For this film's H = 360: camZ = 180 / tan 20° = 494.5459 (fov 40); 180 / tan 30° = 311.7691 (fov 60).
//   (skills/pixi-effects/reference/cheatsheet.md "camera" and pitfalls.md 25 give the same formula, "≈ 989 at 720p": 360 / tan 20° = 989.09.)
// - docs/dsl.md "Conventions": "+z toward the viewer … Bigger z = nearer = larger on screen"; "Default camera: … the z = 0 plane, which maps 1:1 to pixels.
//   A threeD layer at z = 0 looks identical to a 2D layer".
// - docs/dsl.md "Depth of field" (the card-size rule): "a card at depth z … s = camZ / (camZ − z)": a plane facing the camera at z is drawn s times its size,
//   about the point the camera looks at (the canvas centre, which is also the rect's centre, so the rect stays centred on (320, 180)).
//   So z = −400 (fov 40): s = 494.5459 / 894.5459 = 0.552846; z = +200 (= +D/2): s = 494.5459 / 294.5459 = 1.679011; z = −400 at fov 60: s = 311.7691 / 711.7691 = 0.438020.
// - docs/dsl.md "Depth order and limits": "A layer at or behind the camera is hidden for that frame"; docs/dsl.md "Camera": a layer the camera passes on purpose takes
//   `hideBehindCamera: true` ("hidden quietly when it is at or behind the camera, instead of a warning"); pitfalls.md 25: "A layer at/behind the camera plane is hidden …
//   (fixed: warns once)". So without hideBehindCamera: no white pixel and ONE warning that names the layer and says it is hidden; with it: no white pixel, no warning.
// - docs/api.md inspect(): bounds are in canvas pixels ("Where every layer is drawn").
// A run is measured on the frame's red channel > 128 (more than half covered), so its ends are the true edges rounded: within 1 px of the formula.

const H = 360;
const camZ = (fov: number) => (H / 2) / Math.tan((fov / 2) * Math.PI / 180);
const scaleAt = (z: number, fov = 40) => camZ(fov) / (camZ(fov) - z);
const W0 = 200, H0 = 100, CX = 320, CY = 180;
/** The documented picture of the rect: left, right, top, bottom edges. */
const edges = (z: number, fov = 40) => { const s = scaleAt(z, fov); return { s, left: CX - W0 * s / 2, right: CX + W0 * s / 2, top: CY - H0 * s / 2, bottom: CY + H0 * s / 2 }; };

// The numbers above, worked by hand from the formula, so a change to the helper cannot move the answer with it.
const HAND: Record<string, { s: number; left: number; right: number; top: number; bottom: number }> = {
  'z=0': { s: 1, left: 220, right: 420, top: 130, bottom: 230 },
  'z=-400': { s: 0.552846, left: 264.7154, right: 375.2846, top: 152.3577, bottom: 207.6423 },
  'z=200': { s: 1.679011, left: 152.0989, right: 487.9011, top: 96.0494, bottom: 263.9506 },
  'z=-400&fov=60': { s: 0.438020, left: 276.1980, right: 363.8020, top: 158.0990, bottom: 201.9010 },
  'z=0&fov=60': { s: 1, left: 220, right: 420, top: 130, bottom: 230 },
};

async function read(film: Film, frame = 0) {
  return film.eval<any>(`(async () => { await shot(${frame}); return { logs: window.__logs.slice(), size: window.__size,
    row: runs('x', ${CY}), col: runs('y', ${CX}), white: countWhite(), centre: pixel(${CX}, ${CY}),
    layer: ((await movie.inspect(${frame}, { layers: 'all' })).layers.find(l => l.name === 'card')) }; })()`);
}

runFilms('Camera and 2.5D: the default camera draws a threeD layer s = camZ / (camZ − z) times its size, and hides it at the camera plane', () => {
  it('the documented camera distance: 494.55 for this 360-high film at fov 40, 989.09 for 720p (the number the docs quote)', () => {
    expect(camZ(40)).toBeCloseTo(494.5459, 3);
    expect(2 * camZ(40)).toBeCloseTo(989.09, 2);      // H = 720: the "about 989" of docs/dsl.md, cheatsheet.md and pitfalls.md 25
    for (const [q, h] of Object.entries(HAND)) {
      const p = new URLSearchParams(q); const e = edges(Number(p.get('z')), p.has('fov') ? Number(p.get('fov')) : 40);
      for (const k of ['s', 'left', 'right', 'top', 'bottom'] as const) expect(e[k], `${q}: ${k}`).toBeCloseTo(h[k], 3);
    }
  });

  for (const [query, h] of Object.entries(HAND)) {
    it(`${query}: one white run along row y ${CY} from ${h.left.toFixed(2)} to ${h.right.toFixed(2)} (width ${(W0 * h.s).toFixed(2)}) and along column x ${CX} from ${h.top.toFixed(2)} to ${h.bottom.toFixed(2)}; inspect() agrees`, async () => {
      await withFilm('camera-perspective', async (film) => {
        const r = await read(film);
        expect(r.logs).toEqual([]);
        expect(r.size).toEqual([640, 360]);
        expect(r.centre, 'the middle of the canvas is the white rect').toBeGreaterThan(220);
        expect(r.row.length, `one run along row ${CY}: ${JSON.stringify(r.row)}`).toBe(1);
        expect(r.col.length, `one run along column ${CX}: ${JSON.stringify(r.col)}`).toBe(1);
        const [x0, x1] = r.row[0], [y0, y1] = r.col[0];
        expect(Math.abs(x0 - h.left), `${query}: the run starts at x ${x0}, the documented left edge is ${h.left.toFixed(2)}`).toBeLessThanOrEqual(1);
        expect(Math.abs(x1 - h.right), `${query}: the run ends at x ${x1} (exclusive), the documented right edge is ${h.right.toFixed(2)}`).toBeLessThanOrEqual(1);
        expect(Math.abs(y0 - h.top), `${query}: the run starts at y ${y0}, the documented top edge is ${h.top.toFixed(2)}`).toBeLessThanOrEqual(1);
        expect(Math.abs(y1 - h.bottom), `${query}: the run ends at y ${y1} (exclusive), the documented bottom edge is ${h.bottom.toFixed(2)}`).toBeLessThanOrEqual(1);
        // the white area is the projected rect: (W0 s)(H0 s) within a 1 px border all round
        const area = (h.right - h.left) * (h.bottom - h.top), border = 2 * ((h.right - h.left) + (h.bottom - h.top));
        expect(Math.abs(r.white - area), `${query}: ${r.white} white pixels, the projected rect is ${area.toFixed(0)}`).toBeLessThanOrEqual(border);
        // inspect(): the layer's bounds in canvas pixels are the projected rect
        expect(r.layer?.threeD).toBe(true);
        expect(r.layer?.visible).toBe(true);
        const b = r.layer.bounds;
        expect(Math.abs(b.x - h.left), `inspect bounds.x ${b.x}`).toBeLessThanOrEqual(1);
        expect(Math.abs(b.y - h.top), `inspect bounds.y ${b.y}`).toBeLessThanOrEqual(1);
        expect(Math.abs(b.width - (h.right - h.left)), `inspect bounds.width ${b.width}`).toBeLessThanOrEqual(1);
        expect(Math.abs(b.height - (h.bottom - h.top)), `inspect bounds.height ${b.height}`).toBeLessThanOrEqual(1);
      }, { query });
    }, 120_000);
  }

  // At or behind the camera plane: hidden, and said once (on frame 0 and still once after frames 15 and 29 are drawn).
  for (const z of ['cam', '600']) {
    it(`z = ${z === 'cam' ? 'camZ (494.546, on the camera plane)' : z + ' (behind the camera at 494.55)'}: no white pixel on any frame, and one warning naming the layer and saying it is hidden`, async () => {
      await withFilm('camera-perspective', async (film) => {
        for (const f of [0, 15, 29]) {
          const r = await read(film, f);
          expect(r.white, `frame ${f}: the layer at the camera plane is not drawn`).toBe(0);
          expect(r.centre).toBeLessThan(35);
        }
        const logs: string[] = await film.eval('window.__logs');
        expect(logs.length, logs.join('\n')).toBe(1);
        expect(logs[0]).toMatch(/^warn: pixi-effects: layer "card"/);
        expect(logs[0]).toMatch(/behind the camera/);
        expect(logs[0]).toMatch(/hidden/);
      }, { query: `z=${z}` });
    }, 120_000);
  }

  it('z = 600 with hideBehindCamera: true: hidden quietly (no white pixel, no warning)', async () => {
    await withFilm('camera-perspective', async (film) => {
      for (const f of [0, 15, 29]) expect((await read(film, f)).white, `frame ${f}`).toBe(0);
      expect(await film.eval('window.__logs')).toEqual([]);
    }, { query: 'z=600&hideBehindCamera=1' });
  }, 120_000);
});
