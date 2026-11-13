// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// The recipe scene2d-basics runs as written: no warning, the burst spreads from the middle, the ring grows by its keyframe, and it is a function of the time.
runFilms('recipe scene2d-basics', () => {
  it('runs as written with no warning; the pieces leave the middle, the ring is drawn by its keyframe, and a frame is the same however it is reached', async () => {
    await withFilm('scene2d-recipe', async (film) => {
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      const count = (f: number) => film.eval<number>(`(async () => { const img = await movie.snapshot(${f}, { as: 'imageData' }); let n = 0;
        for (let y = 0; y < 720; y += 4) for (let x = 0; x < 1280; x += 4) { const i = (y * 1280 + x) * 4; const d = Math.abs(img.data[i] - 16) + Math.abs(img.data[i + 1] - 20) + Math.abs(img.data[i + 2] - 37);
          if (d > 60 && Math.hypot(x - 640, y - 360) > 300) n++; } return n; })()`);
      expect(await count(0), 'at 0 s everything is in the middle').toBe(0);
      expect(await count(24), 'at 0.8 s the pieces have flown out').toBeGreaterThan(40);
      // the ring: radius 120 at scale 0.2 + (2.4 - 0.2) * expo.out(p); at 0.2 s it is well grown and still bright on its right edge
      const ringX = await film.eval<number>(`(async () => { const img = await movie.snapshot(6, { as: 'imageData' }); let best = -1;
        for (let x = 640; x < 1280; x++) { const i = (360 * 1280 + x) * 4; if (img.data[i] > 200 && img.data[i + 1] > 200 && img.data[i + 2] > 200) best = x; } return best; })()`);
      expect(ringX).toBeGreaterThan(640 + 150);
      const a = await film.eval<string>('hashOf(40)');
      await film.eval('hashOf(90)');
      expect(await film.eval<string>('hashOf(40)')).toBe(a);
    });
  }, 120_000);
});
