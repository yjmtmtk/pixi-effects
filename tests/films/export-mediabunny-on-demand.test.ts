// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, pictureFrames } from './support/withFilm';

// mediabunny (about 180 KB gzipped) writes the file of an export and decodes a video layer. A page that only plays must not fetch it, and needs
// no import map entry for it; an export or a video layer fetches it then, from the import map, a bundler or useMediabunny().

const renderError = `movie.render().then(() => 'no error', (e) => String(e.message))`;
const boxAt = (frame: number) => `movie.inspect(${frame}).then((r) => r.layers.find((l) => l.name === 'box')?.bounds?.x ?? null)`;

runFilms('Export: mediabunny is fetched only when something needs it', () => {
  it('a page with no import map entry for mediabunny plays (seek and play move the picture) and never fetches it', async () => {
    await withFilm('export-mediabunny-on-demand', async (film) => {
      expect(await film.eval('window.__initError ?? null')).toBeNull();
      const start = await film.eval<number>(boxAt(0)), middle = await film.eval<number>(boxAt(15));
      expect(middle - start, 'the box crosses the frame: half way at frame 15').toBeGreaterThan(40);
      await film.eval(`(async () => { await movie.gotoFrame(0); movie.play(); await new Promise((r) => setTimeout(r, 400)); movie.pause(); })()`);
      expect(await film.eval<number>('movie.currentFrame'), 'playing moves the clock').toBeGreaterThan(0);
      expect(await film.eval<boolean>('window.mediabunnyFetched()')).toBe(false);
      expect(await film.eval('window.__logs')).toEqual([]);
    });
  }, 120_000);

  it('there, an export fails with a sentence that says what to write; useMediabunny(url) then makes the same export work (a failed load is tried again)', async () => {
    await withFilm('export-mediabunny-on-demand', async (film) => {
      const message = await film.eval<string>(renderError);
      expect(message).toMatch(/could not load mediabunny/);
      expect(message).toMatch(/import map/);
      expect(message).toMatch(/useMediabunny\(/);
      await film.eval('useMediabunny(window.MB_URL)');
      expect((await pictureFrames(await film.render())).frames).toBe(30);
      expect(await film.eval<boolean>('window.mediabunnyFetched()')).toBe(true);
    });
  }, 120_000);

  it('with mediabunny in the import map: nothing is fetched while it plays, the export fetches it and writes the whole movie', async () => {
    await withFilm('export-mediabunny-on-demand', async (film) => {
      await film.eval('movie.gotoFrame(20)');
      expect(await film.eval<boolean>('window.mediabunnyFetched()'), 'fetched before anything needed it').toBe(false);
      expect((await pictureFrames(await film.render())).frames).toBe(30);
      expect(await film.eval<boolean>('window.mediabunnyFetched()')).toBe(true);
    }, { query: 'map=1' });
  }, 120_000);

  it('a video layer fetches it at load: without a source the load fails and names mediabunny; with useMediabunny(() => import(...)) the video loads and exports', async () => {
    const failed = await withFilm('export-mediabunny-on-demand', (film) => film.eval<string | null>('window.__initError ?? null'), { query: 'video=1' });
    expect(failed).toMatch(/mediabunny/);
    expect(failed).toMatch(/video layer/);
    await withFilm('export-mediabunny-on-demand', async (film) => {
      expect(await film.eval('window.__initError ?? null')).toBeNull();
      expect(await film.eval<boolean>('window.mediabunnyFetched()')).toBe(true);
      const clip = await film.eval<boolean>(`movie.inspect(10).then((r) => !!r.layers.find((l) => l.name === 'clip')?.visible)`);
      expect(clip, 'the video layer is drawn').toBe(true);
      expect((await pictureFrames(await film.render())).frames).toBe(30);
    }, { query: 'video=1&give=fn' });
  }, 180_000);
});
