// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

type Report = { loudness: { integratedLufs: number | null; truePeakDb: number }; notes: string[]; issues: string[] };
const report = (query: string) => withFilm('audio-loudness', async (film) => ({
  initError: await film.eval<string | undefined>('window.initError'),
  audio: await film.eval<Report | null>('(() => { try { return JSON.parse(JSON.stringify(movie.inspectAudio())); } catch (e) { return null; } })()'),
  logs: await film.eval<string[]>('window.__logs'),
}), { query });

runFilms('init({ loudness }): the whole mix at a loudness', () => {
  it('without the option the mix is what the layers make (quiet here), and check advises the option; with it the mix is at the target, and the report says what was done', async () => {
    const plain = await report('');
    const target = await report('loudness=-16');
    expect(plain.audio!.loudness.integratedLufs!, 'three quiet sfx at volume 0.15').toBeLessThan(-20);
    expect(plain.audio!.notes.join('\n')).toMatch(/quiet for web video.*loudness: -16/s);
    expect(Math.abs(target.audio!.loudness.integratedLufs! + 16), 'within half a LUFS of the target').toBeLessThanOrEqual(0.5);
    expect(target.audio!.notes.join('\n')).toMatch(/raised by [\d.]+ dB to reach -16 LUFS/);
    expect(target.audio!.loudness.truePeakDb).toBeLessThan(0);
    expect(target.logs).toEqual([]);
  }, 150_000);

  it('a lower target gives a quieter mix, and false is the same as no option', async () => {
    const q = await report('loudness=-23');
    expect(Math.abs(q.audio!.loudness.integratedLufs! + 23)).toBeLessThanOrEqual(0.5);
    const off = await report('loudness=off');
    const plain = await report('');
    expect(off.audio!.loudness.integratedLufs).toBe(plain.audio!.loudness.integratedLufs);
  }, 150_000);

  it('a mistake in the option stops init with a sentence that says what to write', async () => {
    const bad = await report('loudness=loud');
    expect(bad.initError).toMatch(/loudness.*number.*-16|-16.*loudness/s);
    const high = await report('loudness=5');
    expect(high.initError).toMatch(/loudness.*0 or below|negative|LUFS/is);
  }, 150_000);
});
