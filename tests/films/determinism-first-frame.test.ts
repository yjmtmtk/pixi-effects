// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

runFilms('Determinism: the first picture after init is the movie at its start', () => {
  it('shows the movie at its start before anything seeks: a set at 0 is applied, a layer that starts later is hidden', async () => {
    await withFilm('determinism-first-frame', async (film) => {
      const state = await film.eval<string>(`(() => { const c = window.movie._rootSequence._children; const t = n => c.find(s => s.spec.name === n).target; return JSON.stringify({ x: t('box').x, y: t('box').y, later: t('later').renderable }); })()`);
      expect(JSON.parse(state)).toEqual({ x: 300, y: 100, later: false });
    });
  }, 120000);
});
