// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// movie.inspect gives the facts of a text as the eye gets it: the words drawn, the font size on the canvas (after every scale) and the alpha with every group above it.
runFilms('inspect: a text layer as drawn', () => {
  it('text, fontPx (the set size times the scales above it) and opacity (its alpha times its groups\')', async () => {
    await withFilm('inspect-text-facts', async (film) => {
      const r = await film.eval<Array<{ name: string; text?: string; fontPx?: number; alpha: number; opacity: number }>>(
        "movie.inspect(0).then(r => r.layers.filter(l => l.type === 'text').map(l => ({ name: l.name, text: l.text, fontPx: l.fontPx, alpha: l.alpha, opacity: l.opacity })))");
      const by = Object.fromEntries(r.map((l) => [l.name, l]));
      expect(by.plain).toMatchObject({ text: 'Hello world', fontPx: 40, opacity: 1 });
      expect(by.scaled).toMatchObject({ text: 'Big', fontPx: 40, opacity: 1 });
      expect(by.inner).toMatchObject({ text: 'Faded line', fontPx: 30, alpha: 0.8 });
      expect(by.inner!.opacity).toBeCloseTo(0.4, 3);
      expect(await film.eval('window.__logs')).toEqual([]);
    });
  }, 120_000);
});
