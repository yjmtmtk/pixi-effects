// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// backdropBlur blurs what is behind the layer, on WebGPU and on WebGL. On WebGL PixiJS needs the renderer's back buffer for it (`useBackBuffer`),
// which the movie turned on only for an advanced blendMode: a page with backdropBlur and no blend mode warned and drew the stripes sharp
// (found by running every browser test on WebGL: npm run test:webgl).
const WEBGL = "Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })";

runFilms('backdropBlur on both backends', () => {
  for (const [name, beforeLoad] of [['webgpu', undefined], ['webgl', WEBGL]] as const) {
    it.skipIf(name === 'webgpu' && process.env.PE_BACKEND === 'webgl')(`${name}: the stripes behind the panel are blurred, the stripes outside are not, and no warning`, async () => {
      await withFilm('backdrop-blur', async (film) => {
        expect(await film.eval<string>('backend()')).toBe(name);
        expect(await film.eval<number>('contrast(10, 110, 135)'), 'outside the panel').toBeGreaterThan(200);
        expect(await film.eval<number>('contrast(160, 320, 135)'), 'behind the panel').toBeLessThan(120);
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      }, { beforeLoad });
    }, 120_000);
  }
});
