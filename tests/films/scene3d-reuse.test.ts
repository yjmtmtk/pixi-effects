// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// A scene3d layer whose setup, size and options did not change is not built again by setVars: setup (which may load a model) runs once, and the scene's objects are the same ones.
const on = <T>(query: string, fn: Parameters<typeof withFilm<T>>[1]) => withFilm<T>('scene3d-reuse', fn, { query });

runFilms('setVars keeps a scene3d layer that did not change', () => {
  it('setVars of a text variable does not run setup again, keeps the scene\'s objects, and the picture is the one of a page built with that value from the start', async () => {
    const fresh = await on('label=b', (film) => film.eval<string>('hashOf(30)'));
    await on('', async (film) => {
      const cube = await film.eval('(window.__first = window.__cube, 1)');
      expect(cube).toBe(1);
      await film.eval("movie.setVars({ label: 'b' })");
      expect(await film.eval<number>('window.__setups')).toBe(1);
      expect(await film.eval<boolean>('window.__cube === window.__first')).toBe(true);
      expect(await film.eval<string>('hashOf(30)')).toBe(fresh);
      expect(await film.eval<number>('window.__disposes')).toBe(0);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    });
  }, 120_000);

  it('the layer goes on turning with the time after a rebuild, forward and backward', async () => {
    await on('', async (film) => {
      await film.eval("movie.setVars({ label: 'b' })");
      const h = (f: number) => film.eval<string>(`hashOf(${f})`);
      const fwd = [await h(10), await h(40), await h(70)];
      expect([await h(70), await h(40), await h(10)].reverse()).toEqual(fwd);
      expect(new Set(fwd).size).toBe(3);
    });
  }, 120_000);

  it('a layer of another size is another layer (setup again, the old one disposed once); reuse: false builds again', async () => {
    await on('', async (film) => {
      await film.eval('movie.rebuild({ composition: { sequences: [window.__text, window.__layer({ width: 200 })] } })');
      expect(await film.eval<number>('window.__setups')).toBe(2);
      expect(await film.eval<number>('window.__disposes')).toBe(1);
    });
    await on('reuse=0', async (film) => {
      await film.eval("movie.setVars({ label: 'b' })");
      expect(await film.eval<number>('window.__setups')).toBe(2);
      expect(await film.eval<number>('window.__disposes')).toBe(1);
    });
  }, 120_000);

  it('a composition without the layer disposes it once; destroy disposes the one that is left, once', async () => {
    await on('', async (film) => {
      await film.eval("movie.setVars({ label: 'b' })");
      await film.eval('movie.rebuild({ composition: { sequences: [window.__text] } })');
      expect(await film.eval<number>('window.__disposes')).toBe(1);
    });
    await on('', async (film) => {
      await film.eval("movie.setVars({ label: 'b' })");
      await film.eval('movie.destroy()');
      expect(await film.eval<number>('window.__disposes')).toBe(1);
    });
  }, 120_000);

  it('a playing movie goes on through twenty setVars in a row (the old tree draws while the new one is built): one setup, no warning, the picture changes with the time', async () => {
    await on('', async (film) => {
      await film.eval(`(async () => { movie.play(); for (let i = 0; i < 20; i++) { await movie.setVars({ label: 'n' + i }); await new Promise(r => setTimeout(r, 30)); } movie.pause(); })()`);
      expect(await film.eval<number>('window.__setups')).toBe(1);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      expect(await film.eval<string>('hashOf(10)')).not.toBe(await film.eval<string>('hashOf(50)'));
    });
  }, 180_000);

  it('a rebuild that fails leaves the old layer drawing its scene (the borrow was only a loan: nothing moved), and a later rebuild still keeps it', async () => {
    await on('', async (film) => {
      const before = await film.eval<string>('hashOf(30)');
      const failed = await film.eval<string>(`movie.rebuild({ composition: { sequences: [window.__text, window.__layer(), { type: 'scene3d', name: 'broken', setup: () => { throw new Error('no model'); } }] } }).then(() => 'ok', (e) => String(e && e.message || e))`);
      expect(failed).toMatch(/scene3d layer "broken": setup failed: no model/);
      expect(await film.eval<string>('hashOf(30)')).toBe(before);
      await film.eval("movie.setVars({ label: 'a' })");
      expect(await film.eval<number>('window.__setups')).toBe(1);
      expect(await film.eval<string>('hashOf(30)')).toBe(before);
    });
  }, 120_000);

  it('what setup did to the view itself (its background, exposure, the camera it switched to) and a keyframe on scene3d.view are kept across setVars: the picture is the one of a page built with that value', async () => {
    const fresh = await on('viewset=1&label=b', (film) => Promise.all([film.eval<string>('hashOf(15)'), film.eval<string>('hashOf(60)')]));
    await on('viewset=1', async (film) => {
      await film.eval("movie.setVars({ label: 'b' })");
      expect(await film.eval<number>('window.__setups')).toBe(1);
      expect([await film.eval<string>('hashOf(15)'), await film.eval<string>('hashOf(60)')]).toEqual(fresh);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    });
  }, 120_000);

  it('a layer that follows the composition\'s camera and lights keeps them across setVars: the lights, the shadow and the camera are the ones of a page built with that value (no light twice, no shadow lost)', async () => {
    const fresh = await on('lights=1&label=b', (film) => Promise.all([film.eval<string>('hashOf(15)'), film.eval<string>('hashOf(60)')]));
    await on('lights=1', async (film) => {
      await film.eval("movie.setVars({ label: 'b' })");
      expect(await film.eval<number>('window.__setups')).toBe(1);
      expect([await film.eval<string>('hashOf(15)'), await film.eval<string>('hashOf(60)')]).toEqual(fresh);
      await film.eval("movie.setVars({ label: 'c' })");
      await film.eval("movie.setVars({ label: 'b' })");
      expect([await film.eval<string>('hashOf(15)'), await film.eval<string>('hashOf(60)')], 'after two more rebuilds').toEqual(fresh);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    });
  }, 180_000);

  it('a 2D layer shown on a mesh follows the rebuild: the mesh shows the new tree\'s layer (the variable\'s new value), as a page built with it does', async () => {
    const fresh = await on('screen=1&label=b', (film) => film.eval<string>('hashOf(30)'));
    await on('screen=1', async (film) => {
      await film.eval("movie.setVars({ label: 'b' })");
      expect(await film.eval<number>('window.__setups')).toBe(1);
      expect(await film.eval<string>('hashOf(30)')).toBe(fresh);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    });
  }, 120_000);
});
