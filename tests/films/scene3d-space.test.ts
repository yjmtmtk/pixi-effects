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
