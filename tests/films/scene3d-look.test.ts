// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// PixiJS 3D draws its view at full strength whatever the view's alpha and blend mode; a scene3d layer must look like any other layer: each 3D cell is compared with
// a 2D rect of the same colour given the same alpha / parent alpha / blend mode.
const WEBGL = "Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })";
const BACKENDS = [['webgpu', undefined], ['webgl', WEBGL]] as const;
const CELLS = ['alpha', 'parent', 'add', 'multiply'];

/** Mean channel difference between the centre 40 × 40 of the 2D cell (y 25..65) and of the 3D cell (y 115..155) of column k. */
const cellDiff = (px: number[], k: number): number => {
  let sum = 0, n = 0;
  for (let dy = 0; dy < 40; dy++) for (let dx = 0; dx < 40; dx++) {
    const x = 80 * k + 20 + dx;
    const a = ((25 + dy) * 320 + x) * 4, b = ((115 + dy) * 320 + x) * 4;
    for (let c = 0; c < 3; c++) { sum += Math.abs(px[a + c]! - px[b + c]!); n++; }
  }
  return sum / n;
};

runFilms('scene3d: opacity and blend modes look as on any layer', () => {
  it('alpha, a parent composition\'s alpha, add and multiply: each 3D cell matches its 2D reference (mean channel difference under 3 of 255)', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await withFilm('scene3d-look', async (film) => {
        expect(await film.eval<string[]>('window.__logs'), name).toEqual([]);
        const px = await film.eval<number[]>('framePixels(0)');
        for (let k = 0; k < CELLS.length; k++) expect(cellDiff(px, k), `${name} ${CELLS[k]}`).toBeLessThan(3);
      }, { beforeLoad });
    }
  }, 180_000);

  it('a full-opacity normal scene3d layer carries no filter of the layer\'s own (it pays nothing)', async () => {
    await withFilm('scene3d-look', async (film) => {
      expect(await film.eval<string[] | null>("filtersOf('plain')")).toEqual([]);
    });
  }, 120_000);

  it('a tint keyframe on a scene3d layer says it is ignored and what to do instead', async () => {
    await withFilm('scene3d-look', async (film) => {
      expect((await film.eval<string[]>('window.__logs')).join('\n')).toMatch(/scene3d layer "alpha": tint is ignored on a scene3d layer \(PixiJS 3D draws its own colours\): colour the materials, or put a filter on the layer/);
    }, { query: 'tint=1' });
  }, 120_000);
});
