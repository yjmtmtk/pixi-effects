// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// A page with more three layers than a browser keeps contexts for: measured 2026-10-15 on Chrome, about 16 WebGL contexts and about 32 WebGPU ones; the rest draw nothing, without an error.
const logsOf = (query: string) => withFilm('three-budget', async (film) => {
  await film.eval('movie.snapshot(0, { as: "dataURL" })');                                  // a frame: any lost context has been reported by now
  return JSON.parse(await film.eval<string>('JSON.stringify(window.__logs)')) as string[];
}, { query, readySeconds: 120 });

runFilms('A page with too many three layers says so (it does not go blank in silence)', () => {
  it('12 WebGL three layers: no warning at all', async () => {
    expect((await logsOf('n=12')).filter((l) => /context|three layers are alive/.test(l))).toEqual([]);
  }, 180_000);

  it('20 WebGL three layers: a warning at the 13th with the numbers and the way out, and every layer the browser took the context from names itself', async () => {
    const logs = await logsOf('n=20');
    const budget = logs.filter((l) => /three layers are alive/.test(l));
    expect(budget).toHaveLength(1);
    expect(budget[0]).toMatch(/13 three layers/);
    const lost = logs.filter((l) => /took this layer's WebGL context away/.test(l));
    expect(lost.length, 'Chrome takes the oldest contexts when the page asks for more than it keeps: at least one layer says so').toBeGreaterThan(0);
    expect(lost[0]).toMatch(/"box\d+"/);
  }, 180_000);
});
