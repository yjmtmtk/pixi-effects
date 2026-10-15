// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

/** load the film with a seed; return snapshots (data URLs) of the frames, taken in the given order */
const frames = (seed: number, order: number[]): Promise<Record<number, string>> => withFilm('determinism-seeded', async (film) => {
  expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
  const out: Record<number, string> = {};
  for (const f of order) out[f] = await film.eval(`movie.snapshot(${f}, { as: 'dataURL' })`);
  return out;
}, { query: `seed=${seed}` });

runFilms('Determinism: a seed is a picture (the same on every load, after any order of seeking)', () => {
  it('the same seed gives the same pixels on every load and after any order of seeking; another seed gives another picture', async () => {
    const a = await frames(1, [10, 40, 75]);
    const b = await frames(1, [75, 10, 40]);                 // another load, another order
    const c = await frames(2, [10, 40, 75]);
    for (const f of [10, 40, 75]) {
      expect(a[f]!.length).toBeGreaterThan(1000);
      expect(b[f]).toBe(a[f]);
      expect(c[f]).not.toBe(a[f]);
    }
    expect(a[10]).not.toBe(a[40]);                           // and it does move
  }, 120_000);
});
