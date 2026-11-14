// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// An audio layer plays a movie asset in every format a browser decodes, not only mp3 and wav: an .ogg was taken by PixiJS's video loader and played
// nothing, with no warning; .m4a, .flac and .opus had no loader and failed with "Cannot read properties of null". A file that is not sound is said
// in a sentence that names the asset and the formats.
const FORMATS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'opus'];

runFilms('audio formats: an audio asset in any format the browser decodes', () => {
  for (const ext of FORMATS) {
    it(`.${ext} plays: one source, a tone near -6 dBFS, no warning`, async () => {
      await withFilm('audio-formats', async (film) => {
        expect(await film.eval('window.__error ?? null')).toBeNull();
        const s = await film.eval<{ sources: number; peak: number; issues: string[] }>('sound()');
        expect(s.sources, JSON.stringify(s)).toBe(1);
        expect(s.peak, JSON.stringify(s)).toBeGreaterThan(-30);
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      }, { query: `ext=${ext}` });
    }, 120_000);
  }

  it('a file that is not sound stops init with the asset, its file and the formats', async () => {
    await withFilm('audio-formats', async (film) => {
      const error = await film.eval<string | null>('window.__error ?? null');
      expect(error).toMatch(/audio asset "tone".*media\/tone\.txt/);
      expect(error).toMatch(/mp3, wav, ogg, m4a, flac/);
    }, { query: 'src=media/tone.txt' });
  }, 120_000);
});
