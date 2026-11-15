// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// A composition is one picture (as a CSS element or an After Effects precomp): its alpha, blendMode and clip apply to what its layers drew
// together, not to each layer. See the cells in composition-group.html.
const WEBGL = "Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })";
const BACKENDS = [['webgpu', undefined], ['webgl', WEBGL]] as const;
const near = (px: number[], want: number[], tol: number) => want.every((v, i) => Math.abs(px[i]! - v) <= tol);

runFilms('composition: one picture', () => {
  it('alpha, blendMode, clip and culling act on the composition as one picture, on both backends', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await withFilm('composition-group', async (film) => {
        expect.soft(await film.eval<string[]>('window.__logs'), name).toEqual([]);
        const px = (x: number, y: number) => film.eval<number[]>(`px(${x}, ${y})`);
        const cells: Array<[string, number, number, number[]]> = [
          ['group alpha: red alone', 45, 60, [128, 0, 0]],
          ['group alpha: the overlap is the blue rect at half, no red through it', 95, 60, [0, 0, 128]],
          ['multiply as one: the overlap is green (per layer it would be black)', 275, 60, [0, 255, 0]],
          ['difference as one: the overlap is cyan (per layer it would be blue)', 455, 60, [0, 255, 255]],
          ['clip: inside', 60, 170, [255, 255, 0]],
          ['clip: outside the 100 x 60 rectangle nothing', 150, 170, [0, 0, 0]],
          ['no clip: a child past the rectangle is drawn', 330, 170, [255, 255, 0]],
          ['a composition whose rectangle is off the canvas still draws a child placed back on it', 410, 170, [255, 0, 255]],
          ['threeD card at alpha 0.5: the overlap is the blue rect at half', 95, 280, [0, 0, 128]],
        ];
        for (const [what, x, y, want] of cells) {
          const got = await px(x, y);
          expect.soft(near(got, want, 12), `${name} ${what}: ${got}`).toBe(true);
        }
        // a composition that fades must not change how its content is drawn: the anti-aliased edge of a circle at alpha 0.999 is the one at alpha 1
        for (let dx = -34; dx <= -26; dx++) {
          const solid = await px(520 + dx, 170), almost = await px(600 + dx, 170);
          expect.soft(near(almost, solid, 3), `${name} edge at ${dx}: ${solid} vs ${almost}`).toBe(true);
        }
        expect(await film.eval<number>("alphaOf('groupA')"), `${name} inspect reads the composition's alpha`).toBeCloseTo(0.5, 5);
      }, { beforeLoad });
    }
  }, 180_000);
});
