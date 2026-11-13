// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// Masks on scene3d layers: inside the circle the scene's colour, outside it (still inside the 70 × 70 view) the background. On WebGL, PixiJS 3D 0.1.0 drew nothing for a
// stencil-masked view inside a container with a filter (cell 2): the layer must still show.
const WEBGL = "Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })";
const BACKENDS = [['webgpu', undefined], ['webgl', WEBGL]] as const;
const SCENE = [224, 80, 48];
const BG = [64, 128, 192];
const near = (px: number[], want: number[], tol: number) => want.every((v, i) => Math.abs(px[i]! - v) <= tol);

runFilms('scene3d: masks', () => {
  it('an inline mask, a mask with a filter, a mask inside a filtered composition: the scene inside the circle, the background outside it', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await withFilm('scene3d-mask', async (film) => {
        expect(await film.eval<string[]>('window.__logs'), name).toEqual([]);
        for (const [cell, x] of [['masked', 40], ['masked-blurred', 120], ['masked-in-filter', 200]] as const) {
          const inside = await film.eval<number[]>(`pixelAt(0, ${x}, 90)`);
          const outside = await film.eval<number[]>(`pixelAt(0, ${x - 30}, 62)`);
          expect(near(inside, SCENE, 24), `${name} ${cell} inside: ${inside}`).toBe(true);
          expect(near(outside, BG, 24), `${name} ${cell} outside the circle: ${outside}`).toBe(true);
        }
      }, { beforeLoad });
    }
  }, 180_000);

  it('a scene3d layer inside a threeD composition card shows on the card', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await withFilm('scene3d-mask', async (film) => {
        const centre = await film.eval<number[]>('pixelAt(0, 280, 90)');
        expect(near(centre, SCENE, 24), `${name} card centre: ${centre}`).toBe(true);
      }, { beforeLoad });
    }
  }, 180_000);
});
