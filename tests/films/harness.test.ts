// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runFilms, withFilm, pictureFrames } from './support/withFilm';

runFilms('withFilm: the way every test film is opened', () => {
  it('opens a film, waits for it, and gives the test eval and the real file', async () => {
    await withFilm('harness', async (film) => {
      expect(await film.eval<number>('movie.totalFrames')).toBe(30);
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      const file = await film.render();
      const r = await pictureFrames(file);
      expect(r.frames).toBe(30);
      expect(r.seconds).toBeCloseTo(1, 3);
      expect(r.keyFrames[0]).toBe(0);
      expect(r.audioSeconds).toBeNull();                       // the film has no sound
    });
  }, 120_000);
  it('a query reaches the page; a film that does not exist says where it looked', async () => {
    await withFilm('harness', async (film) => { expect(await film.eval<string>('location.search')).toBe('?x=1'); }, { query: 'x=1' });
    await expect(withFilm('no-such-film', async () => 0)).rejects.toThrow(/tests\/films\/no-such-film\.html/);
  }, 120_000);
  it('a film that never becomes ready fails with the page\'s own warnings, it does not hang', async () => {
    await expect(withFilm('harness', async () => 0, { query: 'broken=1', readySeconds: 3 })).rejects.toThrow(/never became ready.*broken on purpose/s);
  }, 120_000);
});
