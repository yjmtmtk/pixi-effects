// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// frameRate and loop on a composition, through the whole movie: a square moving 0 → 200 px over 1 s, on 5 pictures a second, repeating.
runFilms('composition: frameRate and loop', () => {
  it('the square sits on fifths of a second and comes round again each second; the same frame is the same picture whichever order it is drawn in', async () => {
    await withFilm('composition-clock', async (film) => {
      const left = (t: number) => film.eval<number>(`leftAt(${t})`);
      expect(await left(0.3)).toBeCloseTo(40, -1);       // step 0.2 s → 40 px
      expect(await left(11 / 30)).toBeCloseTo(40, -1);   // frame 11 (0.367 s): still on that step
      expect(await left(14 / 30)).toBeCloseTo(80, -1);   // frame 14 (0.467 s): step 0.4 s
      expect(await left(1.3)).toBeCloseTo(40, -1);       // round again: 1.3 s is 0.3 s into the second time
      expect(await left(86 / 30)).toBeCloseTo(160, -1);  // frame 86 (2.867 s): 0.867 → step 0.8 → 160 px
      expect(await left(0.3)).toBeCloseTo(40, -1);       // drawn again after later frames: the same
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    });
  }, 120_000);
});
