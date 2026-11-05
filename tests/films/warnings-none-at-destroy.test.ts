// @vitest-environment node
// Group 14 (Warnings are instructions), the other side: no warning where nothing is wrong. movie.destroy() on a movie that has just drawn makes
// PixiJS warn "a textureSource was destroyed while still bound to a shader" (a few hundred times on WebGPU, reported from an app that closed a
// modal with a movie in it, pixi-effects 0.48.0). The movie never draws again, so the warning says nothing; a rebuild already silenced the same
// message for the same reason (src/core/Movie.ts, muteBoundTextureWarning). Expected, written before the film was run:
//  - destroy() while playing, and destroy() just after pausing: no console.warn / console.error at all from the page;
//  - any other warning printed during the destroy still reaches the console (only that one message is silenced);
//  - after the destroy, console.warn is the page's own function again (the silencing is undone, also when a destroy step throws).
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

const play = (ms: number) => `(async () => { movie.play(); await new Promise((r) => setTimeout(r, ${ms})); })()`;
const restored = 'console.warn === window.__pageWarn';

async function destroyQuietly(film: Film, pauseFirst: boolean): Promise<void> {
  await film.eval(play(600));
  if (pauseFirst) await film.eval('movie.pause()');
  await film.eval('window.__logs.length = 0');
  await film.eval('movie.destroy()');
  expect(await film.eval<string[]>('window.__logs')).toEqual([]);
  expect(await film.eval<boolean>(restored), 'console.warn is the page\'s own again').toBe(true);
}

runFilms('Warnings: destroying a movie that has just played is silent', () => {
  it('destroy() while playing gives no warning (WebGPU)', async () => {
    await withFilm('warnings-none-at-destroy', async (film) => {
      expect(await film.eval<string>('movie.app.renderer.name')).toBe('webgpu');
      await destroyQuietly(film, false);
    });
  }, 120_000);

  it('destroy() just after a pause gives no warning (WebGPU and WebGL)', async () => {
    await withFilm('warnings-none-at-destroy', (film) => destroyQuietly(film, true));
    await withFilm('warnings-none-at-destroy', async (film) => {
      expect(await film.eval<string>('movie.app.renderer.name')).toBe('webgl');
      await destroyQuietly(film, true);
    }, { beforeLoad: 'delete Navigator.prototype.gpu;' });
  }, 180_000);

  it('only that one message is silenced: another warning during the destroy still reaches the console, and console.warn comes back even when a step throws', async () => {
    await withFilm('warnings-none-at-destroy', async (film) => {
      await film.eval(play(300));
      await film.eval(`(() => {
        const seq = movie._rootSequence, own = seq.destroy.bind(seq);
        seq.destroy = () => { console.warn('a textureSource was destroyed while still bound to a shader'); console.warn('some other warning'); own(); throw new Error('a step failed'); };
      })()`);
      await film.eval('window.__logs.length = 0');
      await film.eval('movie.destroy()');
      const others = ['warn: some other warning', 'warn: pixi-effects: cleanup step threw, continuing: a step failed'];   // the second: safeRun's own
      expect(await film.eval<string[]>('window.__logs')).toEqual(others);
      expect(await film.eval<boolean>(restored)).toBe(true);
      await film.eval(`console.warn('after the destroy')`);
      expect(await film.eval<string[]>('window.__logs')).toEqual([...others, 'warn: after the destroy']);
    });
  }, 120_000);
});
