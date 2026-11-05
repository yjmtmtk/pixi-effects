// @vitest-environment node
// Group 14 (Warnings are instructions), the other side: no warning where nothing is wrong. movie.destroy() on a movie that has just drawn made
// PixiJS warn "a textureSource was destroyed while still bound to a shader" (a few hundred times on WebGPU, reported from an app that closed a
// modal with a movie in it, pixi-effects 0.48.0). The movie never draws again, so the warning says nothing. Hiding the line is not enough
// (reported again on 0.48.1): PixiJS's warn() counts every warning before it prints, stops for good at 500 with "too many warnings", and the
// count cannot be reset, so after a few closed movies the page's real PixiJS warnings were gone too. Expected, written before the film was run:
//  - destroy() while playing, and destroy() just after pausing: no console.warn / console.error at all from the page;
//  - make, play, destroy three times on one page (WebGPU and WebGL): no line starting "PixiJS Warning", and PixiJS's count is untouched:
//    499 warnings of the page's own afterwards all print, none is "too many warnings";
//  - any other warning printed during the destroy still reaches the console;
//  - after the destroy, console.warn is the page's own function and PixiJS warns again about a resource destroyed while bound (also when a
//    destroy step throws): the quiet lasts for the teardown only.
import { it, expect } from 'vitest';
import { runFilms, withFilm, type Film } from './support/withFilm';

const NO_GPU = 'delete Navigator.prototype.gpu;';
const play = (ms: number) => `(async () => { movie.play(); await new Promise((r) => setTimeout(r, ${ms})); })()`;
/** After a teardown, PixiJS's own warning works again: a texture destroyed while a bind group holds it is reported (this probe uses one of the 500). */
const restored = `(() => {
  const before = window.__logs.length, source = new PIXI.TextureSource(), group = new PIXI.BindGroup({ 0: source });
  source.destroy();
  const told = window.__logs.slice(before).some((l) => /PixiJS Warning.*'textureSource' was destroyed while still bound/.test(l));
  window.__logs.length = before;
  return console.warn === window.__pageWarn && told && group.resources[0] === null;
})()`;

async function destroyQuietly(film: Film, pauseFirst: boolean): Promise<void> {
  await film.eval(play(600));
  if (pauseFirst) await film.eval('movie.pause()');
  await film.eval('window.__logs.length = 0');
  await film.eval('movie.destroy()');
  expect(await film.eval<string[]>('window.__logs')).toEqual([]);
  expect(await film.eval<boolean>(restored), 'console.warn is the page\'s own and PixiJS warns again after the destroy').toBe(true);
}

/** Make, play, destroy three times; then 499 of the page's own PixiJS warnings, which all print only if the destroys used none of the 500. */
async function threeTimes(film: Film): Promise<void> {
  for (let i = 0; i < 3; i++) {
    if (i) await film.eval('make()');
    await film.eval(play(400));
    await film.eval('movie.destroy()');
  }
  expect((await film.eval<string[]>('window.__logs')).filter((l) => /PixiJS Warning/.test(l))).toEqual([]);
  await film.eval(`for (let i = 0; i < 499; i++) PIXI.warn('probe ' + i)`);
  const after = await film.eval<string[]>('window.__logs');
  expect(after.filter((l) => /too many warnings/.test(l)), 'PixiJS\'s count of 500 was not used by the destroys').toEqual([]);
  expect(after.filter((l) => /PixiJS Warning: +probe/.test(l))).toHaveLength(499);
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
    }, { beforeLoad: NO_GPU });
  }, 180_000);

  it('three movies made and destroyed on one page leave PixiJS\'s warning count untouched (WebGPU and WebGL)', async () => {
    await withFilm('warnings-none-at-destroy', threeTimes);
    await withFilm('warnings-none-at-destroy', threeTimes, { beforeLoad: NO_GPU });
  }, 180_000);

  it('only that one message is kept back: another warning during the destroy still reaches the console, and everything is put back even when a step throws', async () => {
    await withFilm('warnings-none-at-destroy', async (film) => {
      await film.eval(play(300));
      await film.eval(`(() => {
        const seq = movie._rootSequence, own = seq.destroy.bind(seq);
        seq.destroy = () => { console.warn('some other warning'); own(); throw new Error('a step failed'); };
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
