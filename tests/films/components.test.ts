// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// Components: one composition written once, placed three times with its own params (a colour, a label, a number read in an expression,
// a movie variable passed through a param). See components.html.
const near = (px: number[], want: number[], tol = 8) => want.every((v, i) => Math.abs(px[i]! - v) <= tol);

runFilms('components', () => {
  it('each placement draws with its own params (strings and a number in an expression), the defaults fill the rest, a variable reaches through a param', async () => {
    await withFilm('components', async (film) => {
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      const px = (x: number, y: number) => film.eval<number[]>(`px(${x}, ${y})`);
      expect(near(await px(40, 30), [0, 255, 0]), 'a: green at x 10..70').toBe(true);
      expect(near(await px(20, 130), [0, 0, 0]), 'b: dx 20 moves the rect: nothing at x 20').toBe(true);
      expect(near(await px(50, 140), [0, 0, 255]), 'b: the variable accent through the param colour: blue at x 30..90').toBe(true);
      expect(near(await px(240, 30), [255, 0, 0]), 'c: the default colour').toBe(true);
      const names = await film.eval<string[]>('names');
      expect(names).toEqual(expect.arrayContaining(['a', 'a/box', 'a/label', 'b/box', 'c/label']));
      await film.eval('setAccent("#ffff00")');
      expect(near(await px(50, 140), [255, 255, 0]), 'setVars reaches the param').toBe(true);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    });
  }, 120_000);
});
