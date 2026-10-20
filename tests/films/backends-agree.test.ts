// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

// Backends agree: one small film of what is documented to work on both renderers (a linear-gradient rect, a circle at alpha 0.6, a rotating rect
// in blendMode 'multiply', a text, a blurred circle), drawn on WebGPU (the default) and on WebGL (navigator.gpu removed before the page loads,
// as tests/films/three-layer-texture.test.ts does: PixiJS then falls back to WebGL), compared picture against picture at frames 0, 30 and 59.
//
// Where the answers come from (written before the film was run):
// - docs/philosophy.md "Two renderers, one library: WebGPU first, WebGL as the fallback … Determinism holds within one renderer; across the two,
//   edge pixels can differ."  So away from an edge the two pictures are the same picture: a sample whose 3 x 3 neighbourhood is flat (in both
//   pictures) must agree on the two backends, and only edge samples may differ.
// - docs/dsl.md, Blend modes: "Checked against the W3C formulas on WebGPU and WebGL: every pixel within 2/255 … Another GPU can differ by a step
//   or two."  That is the per-pixel tolerance used below: 2 of 255, for the flat samples and for the colours the formulas give.
// - docs/dsl.md, three, "Measured on one Apple (Metal) machine …: the same lit box drew with a mean difference of 0.04–0.06 (of 255) per channel
//   from the WebGL picture (only edge pixels differ)" and "With antialias: false and no fog the two agree to 0.04 of 255 (the real film: 0.09)".
//   These are the only numbers the documents give for a whole picture on the two backends; the mean tolerance is the worst of them rounded up: 0.1.
// - docs/dsl.md fillGradient: "Positions are in 0–1 of the shape's own bounds", `angle: 0` is "left → right": 4 px inside the left end of a 240 px
//   rect the colour is stop 0 moved by 4/240 of the way (≤ 3.3 of 255 here), 4 px inside the right end it is stop 1 likewise: tolerance 2 + 3.3 → 6.
// - The colours of the probes are the compositing formulas the blend-mode section checks against (W3C): normal "source over" at alpha a is
//   backdrop + (colour − backdrop)·a; multiply over an opaque backdrop is colour·backdrop / 255.
// - skills/pixi-effects/reference/cheatsheet.md "Angles | degrees: rotation"; docs/dsl.md shapes: a rect / circle is centred on x, y.
//   The tile (90 x 90 at (510, 170)) turns 0 → 45 over 1.5 s: the point (510, 225), 55 px below its centre, is outside it at frame 0
//   (55 > 45) and inside at frames 45 and 59 (55/√2 = 38.9 < 45 on both rotated axes).
// - docs/dsl.md Named filters: blur is PixiJS's own Gaussian blur; strength 8 does not reach the centre of a radius-36 circle, so the centre keeps its fill.

const NO_GPU = 'delete Navigator.prototype.gpu;';
const FRAMES = [0, 30, 59];
const STEP = 2;                                  // the picture is point-sampled every 2 px (320 x 180 samples): edges stay edges, nothing is averaged away
const PIXEL_TOL = 2;                             // dsl.md blend modes: "within 2/255", "a step or two"
const MEAN_TOL = 0.1;                            // dsl.md three: 0.04–0.06, "the real film: 0.09"

type RGB = [number, number, number];
const BG: RGB = [0x1e, 0x2a, 0x38], DISC: RGB = [0xff, 0x30, 0x30], TILE: RGB = [0x80, 0xe0, 0xff], GLOW: RGB = [0xff, 0xd1, 0x66];
const STOP0: RGB = [0xff, 0x9a, 0x3c], STOP1: RGB = [0x3c, 0x5b, 0xff];
const over = (b: RGB, c: RGB, a: number): RGB => [0, 1, 2].map((i) => b[i]! + (c[i]! - b[i]!) * a) as RGB;
const multiply = (b: RGB, c: RGB): RGB => [0, 1, 2].map((i) => (b[i]! * c[i]!) / 255) as RGB;

/** The probes: away from every edge, the colour the documents give, on BOTH backends. */
function probes(alpha: number): Array<{ what: string; x: number; y: number; frames: number[]; want: RGB | null; tol: number }> {
  const disc = over(BG, DISC, alpha);
  return [
    { what: 'background', x: 600, y: 40, frames: FRAMES, want: BG, tol: PIXEL_TOL },
    { what: 'disc over the background (source over at alpha)', x: 430, y: 100, frames: FRAMES, want: disc, tol: PIXEL_TOL },
    { what: 'tile multiplied over the disc', x: 480, y: 145, frames: FRAMES, want: multiply(disc, TILE), tol: PIXEL_TOL },
    { what: 'tile multiplied over the background', x: 535, y: 195, frames: FRAMES, want: multiply(BG, TILE), tol: PIXEL_TOL },
    { what: 'below the unturned tile: background', x: 510, y: 225, frames: [0], want: BG, tol: PIXEL_TOL },
    { what: 'below the tile turned 45 degrees: inside it', x: 510, y: 225, frames: [45, 59], want: multiply(BG, TILE), tol: PIXEL_TOL },
    { what: 'centre of the blurred circle', x: 560, y: 300, frames: FRAMES, want: GLOW, tol: PIXEL_TOL },
    { what: 'just outside the blurred circle (looked at below)', x: 600, y: 300, frames: [0], want: null, tol: 0 },
    { what: 'just inside the blurred circle (looked at below)', x: 592, y: 300, frames: [0], want: null, tol: 0 },
    { what: 'left end of the gradient: stop 0', x: 34, y: 100, frames: [0], want: STOP0, tol: 6 },
    { what: 'right end of the gradient: stop 1', x: 266, y: 100, frames: [0], want: STOP1, tol: 6 },
  ];
}

interface Grid { width: number; height: number; cols: number; rows: number; rgb: string; flat: string }
interface Box { name: string; type?: string; bounds: { x: number; y: number; width: number; height: number } }
interface Side { backend: string; logs: string[]; grids: Record<number, Grid>; probes: Record<string, RGB>; boxes: Record<number, Box[]> }

async function read(film: Film, alpha: number): Promise<Side> {
  const grids: Record<number, Grid> = {};
  const boxes: Record<number, Box[]> = {};
  for (const f of FRAMES) {
    grids[f] = await film.eval<Grid>(`grid(${f}, ${STEP})`);
    boxes[f] = await film.eval<Box[]>(`movie.inspect(${f}, { layers: 'all' }).then(r => r.layers.filter(l => l.name && l.bounds).map(l => ({ name: l.name, type: l.type, bounds: l.bounds })))`);
  }
  const got: Record<string, RGB> = {};
  for (const p of probes(alpha)) for (const f of p.frames) got[`${p.x},${p.y}@${f}`] = await film.eval<RGB>(`pixelAt(${f}, ${p.x}, ${p.y})`);
  return { backend: await film.eval<string>('window.backend'), logs: await film.eval<string[]>('window.__logs'), grids, probes: got, boxes };
}

interface Diff { frame: number; mean: RGB; flatSamples: number; flatOff: number; worst: { d: number; x: number; y: number; a: RGB; b: RGB }; layer?: [string[], string[]] }
function compare(a: Grid, b: Grid, frame: number): Diff {
  const ra = Buffer.from(a.rgb, 'base64'), rb = Buffer.from(b.rgb, 'base64'), fa = Buffer.from(a.flat, 'base64'), fb = Buffer.from(b.flat, 'base64');
  const sum = [0, 0, 0];
  let flatSamples = 0, flatOff = 0, worst = { d: -1, x: 0, y: 0, a: [0, 0, 0] as RGB, b: [0, 0, 0] as RGB };
  for (let n = 0; n < a.cols * a.rows; n++) {
    let d = 0;
    for (let c = 0; c < 3; c++) { const v = Math.abs(ra[n * 3 + c]! - rb[n * 3 + c]!); sum[c] += v; d = Math.max(d, v); }
    if (fa[n] && fb[n]) { flatSamples++; if (d > PIXEL_TOL) flatOff++; }
    if (d > worst.d) {
      const i = n % a.cols, j = Math.floor(n / a.cols);
      worst = { d, x: Math.floor(STEP / 2) + i * STEP, y: Math.floor(STEP / 2) + j * STEP, a: [...ra.subarray(n * 3, n * 3 + 3)] as RGB, b: [...rb.subarray(n * 3, n * 3 + 3)] as RGB };
    }
  }
  const N = a.cols * a.rows;
  return { frame, mean: sum.map((s) => s / N) as RGB, flatSamples, flatOff, worst };
}

/** For each layer, over the samples inside its reported bounds (widened by `pad` px; 24 for the blurred one): the largest difference and how many samples differ by more than 2. */
function perLayer(a: Grid, b: Grid, boxes: Box[]) {
  const ra = Buffer.from(a.rgb, 'base64'), rb = Buffer.from(b.rgb, 'base64');
  return boxes.map((box) => {
    const pad = box.name === 'glow' ? 24 : 2, { x, y, width, height } = box.bounds;
    let max = 0, over = 0, n = 0;
    for (let j = 0; j < a.rows; j++) for (let i = 0; i < a.cols; i++) {
      const X = Math.floor(STEP / 2) + i * STEP, Y = Math.floor(STEP / 2) + j * STEP;
      if (X < x - pad || X > x + width + pad || Y < y - pad || Y > y + height + pad) continue;
      const k = (j * a.cols + i) * 3; let d = 0;
      for (let c = 0; c < 3; c++) d = Math.max(d, Math.abs(ra[k + c]! - rb[k + c]!));
      n++; max = Math.max(max, d); if (d > PIXEL_TOL) over++;
    }
    return { name: box.name, type: box.type, samples: n, max, over };
  });
}

/** Both backends open at once: the pictures, the probes, and at the largest difference of each frame the layers on top within 1.5 px (movie.pick) on each backend. */
async function run(query: string, alpha: number) {
  return withFilm('backends-agree', (gpuFilm) => withFilm('backends-agree', async (glFilm) => {
    const gpu = await read(gpuFilm, alpha), gl = await read(glFilm, alpha);
    const diffs = FRAMES.map((f) => compare(gpu.grids[f]!, gl.grids[f]!, f));
    for (const d of diffs) {
      const ask = `layersNear(${d.frame}, ${d.worst.x}, ${d.worst.y})`;
      d.layer = [await gpuFilm.eval<string[]>(ask), await glFilm.eval<string[]>(ask)];
    }
    const rows = diffs.map((d) => `frame ${d.frame}: mean |WebGPU − WebGL| = [${d.mean.map((v) => v.toFixed(3))}] of 255; flat samples ${d.flatSamples}, off by more than ${PIXEL_TOL}: ${d.flatOff}; ` +
      `largest single difference ${d.worst.d} at (${d.worst.x}, ${d.worst.y}), the layers within 1.5 px: [${d.layer![0]}] on WebGPU, [${d.layer![1]}] on WebGL (none = the background) (WebGPU [${d.worst.a}], WebGL [${d.worst.b}])`);
    for (const f of FRAMES) rows.push(`frame ${f}, per layer (largest difference / samples off by more than ${PIXEL_TOL} / samples): ` +
      perLayer(gpu.grids[f]!, gl.grids[f]!, gpu.boxes[f]!).map((l) => `${l.name} (${l.type}) ${l.max} / ${l.over} / ${l.samples}`).join(', '));
    console.log(`[backends-agree ${query || 'default'}]\n${rows.join('\n')}`);
    return { gpu, gl, diffs, rows };
  }, { ...(query ? { query } : {}), beforeLoad: NO_GPU }), query ? { query } : {});
}

function expectProbes(side: Side, alpha: number, label: string) {
  for (const p of probes(alpha)) for (const f of p.frames) {
    const got = side.probes[`${p.x},${p.y}@${f}`]!;
    if (!p.want) continue;
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(got[c]! - p.want[c]!), `${label}, frame ${f}, ${p.what} at (${p.x}, ${p.y}): got [${got}], the documents give [${p.want.map((v) => v.toFixed(1))}] ± ${p.tol}`).toBeLessThanOrEqual(p.tol);
    }
  }
}

runFilms('Backends agree: WebGPU and WebGL draw the same film (only edge pixels may differ)', () => {
  for (const [name, query, alpha] of [['the film as written (disc alpha 0.6)', '', 0.6], ['the disc at alpha 0.3 (?alpha=0.3)', 'alpha=0.3', 0.3]] as const) {
    it(`${name}: each backend draws the documented colours, flat samples agree within ${PIXEL_TOL}/255, the mean difference is under ${MEAN_TOL}/255 per channel`, async () => {
      const { gpu, gl, diffs, rows } = await run(query, alpha);
      expect(gpu.backend, 'the default run is on WebGPU').toBe('webgpu');
      expect(gl.backend, 'the run with navigator.gpu removed is on WebGL').toBe('webgl');
      expect(gpu.logs, 'WebGPU: no warning').toEqual([]);
      expect(gl.logs, 'WebGL: no warning').toEqual([]);
      expect(gpu.grids[0]!.cols * gpu.grids[0]!.rows).toBe(320 * 180);

      expectProbes(gpu, alpha, 'WebGPU');
      expectProbes(gl, alpha, 'WebGL');
      // the blur really blurs on both (dsl.md: "Glow / shadow / blur draw outside the layer: widen filterArea"): 4 px outside the circle's edge
      // (x 600 = 560 + 36 + 4) is no longer the background, and 4 px inside it (x 592) is no longer the full fill
      for (const [side, label] of [[gpu, 'WebGPU'], [gl, 'WebGL']] as const) {
        const out = side.probes['600,300@0']!, inn = side.probes['592,300@0']!;
        expect(out[0], `${label}: 4 px outside the blurred circle, red ${out[0]} is above the background's ${BG[0]}`).toBeGreaterThan(BG[0] + 10);
        expect(inn[0], `${label}: 4 px inside the blurred circle, red ${inn[0]} is below the fill's ${GLOW[0]}`).toBeLessThan(GLOW[0] - 10);
      }

      for (const d of diffs) {
        expect(d.flatSamples, `frame ${d.frame}: most of the picture is flat (not an edge)`).toBeGreaterThan(0.8 * 320 * 180);
        expect(d.flatOff, `frame ${d.frame}: flat samples (no edge within 1 px) that differ by more than ${PIXEL_TOL}/255 between the backends\n${rows.join('\n')}`).toBe(0);
        for (let c = 0; c < 3; c++) expect(d.mean[c], `frame ${d.frame}, channel ${'RGB'[c]}: the mean difference\n${rows.join('\n')}`).toBeLessThan(MEAN_TOL);
      }
    }, 240_000);
  }

  it('a film that IS different on WebGL (?drift=12: the tile 12 px further right there) is caught, and the difference is named as the tile', async () => {
    const { gpu, gl, diffs } = await run('drift=12', 0.6);
    expect(gl.backend).toBe('webgl');
    // the documented answer for a tile moved by 12 px on one backend only: the left 12 px of the tile (a strip 12 x ~90 px: ~270 samples at
    // a 2 px step) is the tile on WebGPU and the background or the disc on WebGL, and the right 12 px the other way round: flat samples disagree
    for (const d of diffs) {
      expect(d.flatOff, `frame ${d.frame}: the moved tile makes flat samples disagree`).toBeGreaterThan(200);
      expect([...d.layer![0], ...d.layer![1]], `frame ${d.frame}: the largest difference is at the tile on one of the backends`).toContain('tile');
    }
    expect(gpu.logs.concat(gl.logs)).toEqual([]);
  }, 240_000);
});
