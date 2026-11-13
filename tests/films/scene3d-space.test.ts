// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// A scene3d layer in the composition's space: the same composition drawn as the composition's own threeD cards ('board') and as planes of one scene3d layer with
// followCamera (and, later, followLights / followFog). Pictures compared frame by frame, on both backends, at 480 x 270 and 1280 x 720.
const WEBGL = "Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })";
const BACKENDS = [['webgpu', undefined], ['webgl', WEBGL]] as const;
const FRAMES = [0, 45, 89];

const framesOf = (query: string, beforeLoad?: string) => withFilm('scene3d-space', async (film) => {
  const logs = await film.eval<string[]>('window.__logs');
  const out: number[][] = [];
  for (const f of FRAMES) out.push(await film.eval<number[]>(`framePixels(${f})`));
  return { logs, out };
}, { query, ...(beforeLoad ? { beforeLoad } : {}) });

/** Mean channel difference (0..255) and how many channel values are off by more than 32. */
const compare = (a: number[], b: number[]) => {
  let sum = 0, big = 0, n = 0;
  for (let i = 0; i < a.length; i++) { if (i % 4 === 3) continue; const d = Math.abs(a[i]! - b[i]!); sum += d; n++; if (d > 32) big++; }
  return { mean: sum / n, big };
};

runFilms('scene3d in the composition\'s space', () => {
  for (const big of [false, true]) {
    it(`followCamera${big ? ' at 1280 x 720' : ''}: three planes seen by a camera that moves and changes its fov land where the cards land (measured 2026-11-13: mean 0.000–0.001 of 255 at 480 x 270, 0.015–0.019 at 1280 x 720, edges only; three's followCamera: 0.14–0.19)`, async () => {
      for (const [name, beforeLoad] of BACKENDS) {
        const q = big ? '&big=1' : '';
        const board = await framesOf(`mode=board${q}`, beforeLoad);
        const scene = await framesOf(`mode=scene3d${q}`, beforeLoad);
        expect(scene.logs, name).toEqual([]);
        for (let k = 0; k < FRAMES.length; k++) {
          const { mean, big: off } = compare(board.out[k]!, scene.out[k]!);
          console.log(`scene3d-space camera ${name}${q} frame ${FRAMES[k]}: mean ${mean.toFixed(3)}, ${off} channel values off by more than 32`);
          expect(mean, `${name} frame ${FRAMES[k]}`).toBeLessThan(0.2);
        }
      }
    }, 300_000);
  }

  it('followCamera on a layer of another shape than the composition says so once', async () => {
    const r = await framesOf('mode=scene3d&aspect=1');
    expect(r.logs.join('\n')).toMatch(/scene3d layer "world": followCamera: the layer is 480 x 480 but the composition is 480 x 270/);
  }, 120_000);
});

// --- followLights / followFog / shadows ---
// PixiJS 3D decodes and encodes with a 2.2 gamma (not the piecewise sRGB curve): measured, (58,110,165) under ambient 0.3 is (34,64,95)
const lin = (c: number) => (c / 255) ** 2.2;
const enc = (v: number) => 255 * Math.min(1, v) ** (1 / 2.2);
/** What PixiJS 3D draws for an sRGB colour lit by a total light L (it lights in linear light, then encodes). */
const litAs = (rgb: number[], L: number) => rgb.slice(0, 3).map((c) => enc(lin(c) * L));
const BOX1 = [58, 110, 165];                                              // #3a6ea5, the box at (300, 270, 0) of 960 x 540: pixel (150, 135) at 480 x 270, frame 0 (the home camera)
const near = (got: number[], want: number[], tol: number) => want.every((v, i) => Math.abs(got[i]! - v) <= tol);
const at = (q: string, frame: number, x: number, y: number, beforeLoad?: string) => withFilm('scene3d-space', async (f) => ({ px: await f.eval<number[]>(`pixelAt(${frame}, ${x}, ${y})`), logs: await f.eval<string[]>('window.__logs') }), { query: q, ...(beforeLoad ? { beforeLoad } : {}) });

runFilms('scene3d followLights / followFog / shadows', () => {
  it('each light kind lights the scene as PixiJS 3D says it should (intensity x pi, position y-flipped, direction to the look-at): ambient, parallel, point (none), point (inverseSquare), checked against the formula on a known pixel', async () => {
    // box 1 centre (300, 270, 0); its normal +z. Parallel: from (100, 50, 500) to (480, 270, 0) -> cos = 500 / |(-380, 220, 500)|. Point at (300, 100, 700) -> to the light (0, 170, 700).
    const cosPar = 500 / Math.hypot(380, 220, 500), toLamp = Math.hypot(0, 170, 700), cosPt = 700 / toLamp;
    const R = 300 * 0.5, d = toLamp * 0.5;                                // inverseSquare: radius 300 at 960 -> 150 px here; the distance in px here
    const cases: Array<[string, number]> = [
      ['lights=ambient', 0.3],
      ['lights=parallel', 0.2 + 0.8 * cosPar],
      ['lights=point', 0.2 + 1 * cosPt],
      ['lights=point&falloff=inverseSquare', 0.2 + (R * R / Math.sqrt(d ** 4 + R ** 4)) * cosPt],
    ];
    for (const [name, beforeLoad] of BACKENDS) {
      for (const [q, L] of cases) {
        const r = await at(`mode=scene3d&${q}`, 0, 150, 135, beforeLoad);
        expect(r.logs, `${name} ${q}`).toEqual([]);
        expect(near(r.px, litAs(BOX1, L), 3), `${name} ${q}: ${r.px} vs ${litAs(BOX1, L).map(Math.round)}`).toBe(true);
      }
    }
  }, 300_000);

  it('against the composition\'s own cards the lights land in the same places, brighter in the dim parts: PixiJS 3D lights in linear light, the cards shade the sRGB values (measured 2026-11-13, mean of 255 over the frame: ambient 7.2–7.7, point 1.1–1.2, parallel 2.6–2.8, spot 1.7–2.0)', async () => {
    for (const q of ['lights=ambient', 'lights=point', 'lights=parallel', 'lights=spot']) {
      const board = await framesOf(`mode=board&${q}`), scene = await framesOf(`mode=scene3d&${q}`);
      for (let k = 0; k < 2; k++) expect(compare(board.out[k]!, scene.out[k]!).mean, `${q} frame ${FRAMES[k]}`).toBeLessThan(10);
    }
  }, 300_000);

  for (const kind of ['spot', 'parallel']) {
    for (const big of [false, true]) {
      it(`a ${kind} light with castsShadows throws the card's shadow on the wall${big ? ' at 1280 x 720' : ''}, for a card 50, 300 and 600 px in front of it (PixiJS 3D's defaults lost every shadow in a scene of pixels)`, async () => {
        for (const [name, beforeLoad] of BACKENDS) {
          for (const gap of [50, 300, 600]) {
            const q = `mode=scene3d&shadow=${kind}&gap=${gap}${big ? '&big=1' : ''}`;
            const lit = await framesOf(`${q}&noshadow=1`, beforeLoad), shaded = await framesOf(q, beforeLoad);
            expect(shaded.logs, `${name} ${q}`).toEqual([]);
            const a = lit.out[0]!, b = shaded.out[0]!;
            let darker = 0;
            for (let i = 0; i < a.length; i += 4) if (a[i]! + a[i + 1]! + a[i + 2]! - (b[i]! + b[i + 1]! + b[i + 2]!) > 60) darker++;
            // the visible part of the shadow shrinks as the card nears the wall (it hides behind the card): measured 0.6 % at 50 px for a parallel light
            expect(darker / (a.length / 4), `${name} ${q}: share of the picture in shadow`).toBeGreaterThan(gap === 50 ? 0.003 : 0.01);
          }
        }
      }, 300_000);
    }
  }

  it('a point light with castsShadows says once that PixiJS 3D cannot (and the composition does not call its casters missing)', async () => {
    const r = await framesOf('mode=scene3d&shadow=point');
    expect(r.logs.filter((l) => !/coneAngle \/ coneFeather only matter/.test(l))).toEqual(['warn: pixi-effects: scene3d layer "world": followLights: a point light casts no shadow in PixiJS 3D; use a spot light (or a parallel one) for the shadow']);
  }, 120_000);

  it('a light that only lives from 1 s to 2 s lights the scene exactly then; forward, backward and a repeat agree across its start and end', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await withFilm('scene3d-space', async (film) => {
        const h = (f: number) => film.eval<string>(`hashOf(${f})`);
        const forward = [await h(15), await h(45), await h(75)];
        expect([await h(75), await h(45), await h(15)].reverse(), name).toEqual(forward);
        await withFilm('scene3d-space', async (off) => {
          expect(await off.eval<string>('hashOf(15)'), `${name}: before the lamp`).toBe(forward[0]);
          expect(await off.eval<string>('hashOf(75)'), `${name}: after the lamp`).toBe(forward[2]);
          expect(await off.eval<string>('hashOf(45)'), `${name}: the lamp is on`).not.toBe(forward[1]);
        }, { query: 'mode=scene3d&lamp=off', ...(beforeLoad ? { beforeLoad } : {}) });
      }, { query: 'mode=scene3d&lamp=late', ...(beforeLoad ? { beforeLoad } : {}) });
    }
  }, 300_000);

  it('followLights with no light layer leaves the scene\'s own lights as they are (not a black scene)', async () => {
    const r = await at('mode=scene3d&lights=none&ownLight=1', 0, 150, 135);
    expect(r.px[0]! + r.px[1]! + r.px[2]!, `${r.px}`).toBeGreaterThan(150);
  }, 120_000);

  it('followFog: PixiJS 3D\'s linear fog is close to the composition\'s fog, not equal (smoothstep against linear, mixed in linear light; measured mean 1.3–3.5 of 255 against the cards); fogAmount below 1 says so once', async () => {
    const board = await framesOf('mode=board&fog=1'), scene = await framesOf('mode=scene3d&fog=1');
    for (let k = 0; k < 2; k++) expect(compare(board.out[k]!, scene.out[k]!).mean, `frame ${FRAMES[k]}`).toBeLessThan(5);
    const half = await framesOf('mode=scene3d&fog=1&fogAmount=0.5');
    expect(half.logs.join('\n')).toMatch(/followFog: the camera's fogAmount is 0.5, and PixiJS 3D's fog has no amount below 1/);
  }, 300_000);
});
