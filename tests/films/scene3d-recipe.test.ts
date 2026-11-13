// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// The recipe scene3d-basics as written (fetched from recipes.md and run): no warning, the circle wipe reveals the scene, the title sits over it.
const BG = [13, 18, 32];                                                 // #0d1220
const far = (px: number[], c: number[]) => Math.abs(px[0]! - c[0]!) + Math.abs(px[1]! - c[1]!) + Math.abs(px[2]! - c[2]!) > 30;

runFilms('The recipe scene3d-basics, as written', () => {
  it('runs with no warning; at 0 the wipe has not opened (the backdrop), at 2 s the scene shows in the middle', async () => {
    await withFilm('scene3d-recipe', async (film) => {
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      expect(far(await film.eval<number[]>('pixelAt(0, 640, 500)'), BG), 'frame 0: only the backdrop').toBe(false);
      expect(far(await film.eval<number[]>('pixelAt(60, 640, 500)'), BG), 'frame 60: the floor').toBe(true);
    });
  }, 120_000);
});
