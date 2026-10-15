// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';
import { setTimeout as sleep } from 'node:timers/promises';

runFilms('Determinism: the poster time shows a movie at that frame while the playhead is at 0', () => {
  it('the canvas shows the poster frame while the playhead is at 0, play starts from 0, and posterImage is that picture', async () => {
    await withFilm('determinism-poster', async (film) => {
      expect(await film.eval('JSON.stringify(window.__logs)')).toBe('[]');

      // where is the white square on the canvas? (the scan runs along y = 360)
      // (read after two animation frames: a WebGL canvas read at a random moment can be blank, the ticker draws it every frame)
      const squareX = `(async () => { await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); const c = document.getElementById('stage'); const t = document.createElement('canvas'); t.width = c.width; t.height = c.height;
        const g = t.getContext('2d'); g.drawImage(c, 0, 0); const row = g.getImageData(0, 360, t.width, 1).data; let first = -1, last = -1;
        for (let x = 0; x < t.width; x++) if (row[x * 4] > 200) { if (first < 0) first = x; last = x; } return first < 0 ? -1 : (first + last) / 2; })()`;

      const info = await film.eval('({ poster: movie.poster, posterFrame: movie.posterFrame, frame: movie.currentFrame, playing: movie.isPlaying })');
      expect(info).toEqual({ poster: 3, posterFrame: 90, frame: 0, playing: false });
      expect(Math.abs((await film.eval(squareX)) - 850)).toBeLessThan(6);                       // the poster picture: 3 s of 4 -> x = 850

      // the picture is what posterImage returns, and asking for it does not disturb the display
      const imgOk = await film.eval(`(async () => { const url = await movie.posterImage({ as: 'dataURL' }); return url.startsWith('data:image/png'); })()`);
      expect(imgOk).toBe(true);
      expect(Math.abs((await film.eval(squareX)) - 850)).toBeLessThan(6);
      expect(await film.eval('movie.currentFrame')).toBe(0);

      // play starts from the beginning
      await film.eval('movie.play()');
      await sleep(350);
      const during = await film.eval(`(async () => ({ frame: movie.currentFrame, x: await ${squareX} }))()`);
      expect(during.frame).toBeLessThan(25);
      expect(during.x).toBeLessThan(500);                                                      // near the start, not at 850
      await film.eval('movie.pause()');
    });
  }, 90_000);

  it('a movie without a poster option shows frame 0 as before', async () => {
    await withFilm('determinism-poster', async (film) => {
      expect(await film.eval('movie.poster')).toBeNull();
      expect(await film.eval('movie.posterFrame')).toBeNull();
    }, { query: 'noposter', readySeconds: 30 });
  }, 60_000);
});
