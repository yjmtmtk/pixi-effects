// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// A filter's picture is a function of the time like everything else: the same on every load. PixiJS's `noise` took Math.random() as its seed when
// none was given, and pixi-filters' `glitch` cut its slices with Math.random(): the film named-filters (both, unseeded) drew another picture on
// every load (found comparing browsers toward 1.0: Chrome against itself, mean 2.9 of 255).
const hashes = (film: { eval: <T>(e: string) => Promise<T> }) => film.eval<string[]>(`(async () => { const out = []; for (const f of [0, 30, 59]) { const img = await movie.snapshot(f, { as: 'imageData' }); let h = 0; for (let i = 0; i < img.data.length; i += 3) h = (h * 31 + img.data[i]) | 0; out.push(String(h)); } return out; })()`);

runFilms('filters are seeded: the same picture on every load', () => {
  it('named-filters (noise and glitch with no seed) gives the same pictures on two loads', async () => {
    const first = await withFilm('named-filters', hashes);
    const second = await withFilm('named-filters', hashes);
    expect(second).toEqual(first);
  }, 180_000);
});
