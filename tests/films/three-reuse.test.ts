// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// A three layer whose setup, size and options did not change is not built again by setVars: it keeps its scene, its renderer (and its context) and its texture. Setup, which may load a model, runs once.
const counts = (film: { eval: <T>(e: string) => Promise<T> }) => film.eval<{ setups: number; disposes: number; scene: string; logs: string[] }>('({ setups: window.__setups, disposes: window.__disposes, scene: window.__scene, logs: window.__logs })');

runFilms('setVars keeps a three layer that did not change', () => {
  it('setVars of a text variable does not run setup again, keeps the scene, and the picture is the one of a page built with that value from the start', async () => {
    const fresh = await withFilm('three-reuse', (film) => film.eval<string>('hashOf(15)'), { query: 'label=b' });
    await withFilm('three-reuse', async (film) => {
      const first = await film.eval<string>('hashOf(15)');
      const c0 = await counts(film);
      await film.eval('movie.setVars({ label: "b" })');
      const c1 = await counts(film);
      expect(c1.setups, 'setup ran once, at the start').toBe(1);
      expect(c1.scene, 'the same scene').toBe(c0.scene);
      expect(c1.disposes, 'nothing was disposed: the layer lives on').toBe(0);
      expect(await film.eval<string>('hashOf(15)'), 'the picture is that of a movie built with label b').toBe(fresh);
      expect(await film.eval<string>('hashOf(15)')).not.toBe(first);
      for (const v of ['c', 'd', 'e', 'a']) await film.eval(`movie.setVars({ label: ${JSON.stringify(v)} })`);
      expect((await counts(film)).setups, 'five rebuilds, still one setup').toBe(1);
      expect(await film.eval<string>('hashOf(15)'), 'back to label a: the first picture again').toBe(first);
      expect((await counts(film)).logs).toEqual([]);
    });
  }, 180_000);

  it('the layer goes on turning with the time after a rebuild, forward and backward', async () => {
    await withFilm('three-reuse', async (film) => {
      await film.eval('movie.setVars({ label: "x" })');
      const h = async (f: number) => film.eval<string>(`hashOf(${f})`);
      const forward = [await h(0), await h(30), await h(60)];
      expect([await h(60), await h(30), await h(0)].reverse()).toEqual(forward);
      expect(new Set(forward).size).toBe(3);
    });
  }, 120_000);

  it('a layer of another size is another layer (setup again, the old one disposed once); a movie resize that leaves the layer\'s own size alone keeps it; reuse: false builds again', async () => {
    await withFilm('three-reuse', async (film) => {
      await film.eval('movie.rebuild({ composition: { sequences: [window.__text, window.__layer({ width: 200, height: 112 })] } })');
      const c = await counts(film);
      expect(c.setups, 'a new size: the layer is built again').toBe(2);
      expect(c.disposes, 'and the first one was disposed').toBe(1);
    });
    await withFilm('three-reuse', async (film) => {
      await film.eval('movie.resize(400, 225)');                              // the layer says 320 x 180 itself: nothing about it changed
      expect((await counts(film)).setups).toBe(1);
    });
    await withFilm('three-reuse', async (film) => {
      await film.eval('movie.setVars({ label: "z" })');
      const c = await counts(film);
      expect(c.setups, 'reuse: false').toBe(2);
      expect(c.disposes).toBe(1);
    }, { query: 'reuse=0' });
  }, 180_000);

  it('a composition without the layer disposes it once; a different setup is a different layer; destroy disposes the one that is left, once', async () => {
    await withFilm('three-reuse', async (film) => {
      await film.eval('movie.rebuild({ composition: { sequences: [window.__text] } })');
      expect((await counts(film)).disposes, 'the layer is gone: disposed once').toBe(1);
    });
    await withFilm('three-reuse', async (film) => {
      await film.eval('movie.rebuild({ composition: { sequences: [window.__text, window.__layer({ setup: (ctx) => { window.__setups++; ctx.camera.position.set(0, 0, 5); } })] } })');
      const c = await counts(film);
      expect(c.setups, 'another setup function: built again').toBe(2);
      expect(c.disposes).toBe(1);
    });
    await withFilm('three-reuse', async (film) => {
      await film.eval('movie.setVars({ label: "q" })');
      await film.eval('movie.destroy()');
      const c = await counts(film);
      expect(c.disposes, 'the owner after the rebuild disposes at the end, once (not by the first tree, not twice)').toBe(1);
    });
  }, 240_000);

  it("webgpu: the layer that shares Pixi's GPU device keeps its texture across setVars too (no new render target, the same picture)", async () => {
    const fresh = await withFilm('three-reuse', (film) => film.eval<string>('hashOf(15)'), { query: 'renderer=webgpu&label=b' });
    await withFilm('three-reuse', async (film) => {
      expect(await film.eval<boolean>("movie.inspect(0).then(r => r.layers.find(l => l.name === 'world').sharedGpu)")).toBe(true);
      await film.eval('movie.setVars({ label: "b" })');
      expect((await counts(film)).setups).toBe(1);
      expect(await film.eval<string>('hashOf(15)')).toBe(fresh);
      expect(await film.eval<boolean>("movie.inspect(0).then(r => r.layers.find(l => l.name === 'world').sharedGpu)")).toBe(true);
      expect((await counts(film)).logs).toEqual([]);
    }, { query: 'renderer=webgpu' });
  }, 180_000);

  it('a playing movie goes on turning through twenty setVars in a row (the old tree draws while the new one is built on its scene): one setup, no warning, the picture changes with the time', async () => {
    await withFilm('three-reuse', async (film) => {
      await film.eval('movie.play()');
      const frames: number[] = [];
      for (let i = 0; i < 20; i++) {
        await film.eval(`movie.setVars({ label: "n${'$'}{${i}}" })`);
        frames.push(await film.eval<number>('movie.currentFrame'));
        await film.eval('new Promise(r => setTimeout(r, 40))');
      }
      await film.eval('movie.pause()');
      const c = await counts(film);
      expect(c.setups).toBe(1);
      expect(c.disposes).toBe(0);
      expect(c.logs).toEqual([]);
      expect(new Set(frames).size, 'the movie really played meanwhile').toBeGreaterThan(5);
      const h = async (f: number) => film.eval<string>(`hashOf(${f})`);
      expect(await h(10)).not.toBe(await h(40));
    });
  }, 120_000);
});
