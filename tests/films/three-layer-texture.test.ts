// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// threeLayerTexture(ctx, 'screen'): a live 2D composition on a mesh of a three layer. The picture of a plane that fills the frame must be the 2D layer itself, pixel for pixel, on every route:
// Pixi and the layer on one GPU device (no copy: three's ExternalTexture), the layer on a canvas of its own, and Pixi on WebGL (pixels read back).
const BG = [29, 58, 110], DOT = [242, 193, 78], BAR = [61, 220, 151], PAGE = [11, 15, 26];
// the plane is 640 x 360 for a 480 x 270 screen: a point (x, y) of the picture is (x * 0.75, y * 0.75) of the screen
const POINTS: Array<[number, number]> = [[50, 50], [80, 180], [150, 307]];                 // the background, the dot at frame 0, the bar at frame 60
const NO_GPU = 'delete Navigator.prototype.gpu;';

const parity = (query: string, o: { beforeLoad?: string } = {}) => withFilm('three-layer-texture', async (film) => {
  expect(await film.eval<string | undefined>('window.initError'), `init: ${query}`).toBeUndefined();
  const bg = (await film.eval<number[][]>('pixelsAt(0, [[50, 50]])'))[0];
  const dot = (await film.eval<number[][]>('pixelsAt(0, [[80, 180]])'))[0];
  const bar = (await film.eval<number[][]>('pixelsAt(60, [[150, 307]])'))[0];
  return { bg, dot, bar, pixi: await film.eval<string>('movie.app.renderer.name'), logs: (await film.eval<string[]>('window.__logs')).filter((l) => !/Math\.random/.test(l)) };
}, { query, ...(o.beforeLoad ? { beforeLoad: o.beforeLoad } : {}) });

runFilms('threeLayerTexture: a live 2D layer on a mesh of a three layer', () => {
  it('on the shared GPU device (no copy) the plane equals the 2D layer: the background, the moving dot and the growing bar, colour for colour', async () => {
    const r = await parity('mode=flat');
    expect(r.pixi).toBe('webgpu');
    expect(r.bg).toEqual(BG); expect(r.dot).toEqual(DOT); expect(r.bar).toEqual(BAR);
    expect(r.logs).toEqual([]);
  }, 120_000);

  it('with the three layer on a canvas of its own (shareGpu: false) the pixels are read back and the picture is the same', async () => {
    const r = await parity('mode=flat&share=0');
    expect(r.pixi).toBe('webgpu');
    expect(r.bg).toEqual(BG); expect(r.dot).toEqual(DOT); expect(r.bar).toEqual(BAR);
    expect(r.logs).toEqual([]);
  }, 120_000);

  it('with no WebGPU in the browser (Pixi on WebGL) the picture is the same', async () => {
    const r = await parity('mode=flat', { beforeLoad: NO_GPU });
    expect(r.pixi).toBe('webgl');
    expect(r.bg).toEqual(BG); expect(r.dot).toEqual(DOT); expect(r.bar).toEqual(BAR);
    expect(r.logs).toEqual([]);
  }, 120_000);

  it('the 2D layer is not drawn on the stage as well: outside a plane of half the size the picture is the page background; and the hidden layer is not picked', async () => {
    await withFilm('three-layer-texture', async (film) => {
      const corner = (await film.eval<number[][]>('pixelsAt(0, [[5, 5], [630, 355]])'));
      expect(corner[0]).toEqual(PAGE); expect(corner[1]).toEqual(PAGE);
      const hit = await film.eval<string | null>("(() => { const h = movie.pick(5, 5); return h ? h.path : null; })()");
      expect(hit, 'a point where the 2D layer would be: the page background is what is under it').toBe('bg');
      const inspected = await film.eval<Array<{ name?: string; visible: boolean }>>("movie.inspect(0).then(r => r.layers.filter(l => l.name === 'screen').map(l => ({ name: l.name, visible: l.visible })))");
      expect(inspected.every((l) => l.visible === false), 'inspect does not list it as on screen').toBe(true);
    }, { query: 'mode=half' });
  }, 120_000);

  it('is a function of the time: forward, backward and a repeat give one picture per frame, and the picture moves', async () => {
    for (const query of ['mode=cube', 'mode=cube&share=0']) {
      await withFilm('three-layer-texture', async (film) => {
        const h = async (f: number) => film.eval<string>(`hashOf(${f})`);
        const forward = [await h(0), await h(30), await h(60), await h(90)];
        const back = [await h(90), await h(60), await h(30), await h(0)].reverse();
        expect(back, query).toEqual(forward);
        expect(await h(30), `${query}: a repeat`).toBe(forward[1]);
        expect(new Set(forward).size, `${query}: it really moves`).toBe(4);
        expect(await film.eval('window.__logs.filter(l => !/Math\\.random/.test(l))')).toEqual([]);
      }, { query });
    }
  }, 180_000);

  it('resolution: 2 gives the texture twice the pixels of the layer (a sharper screen) and the same picture', async () => {
    await withFilm('three-layer-texture', async (film) => {
      expect(await film.eval('window.__screen')).toEqual({ width: 960, height: 540 });
      const bg = (await film.eval<number[][]>('pixelsAt(0, [[50, 50]])'))[0];
      expect(bg).toEqual(BG);
    }, { query: 'mode=flat&res=2' });
  }, 120_000);

  it("the 2D layer's own life is respected: before it starts the mesh shows nothing of it", async () => {
    await withFilm('three-layer-texture', async (film) => {
      const early = (await film.eval<number[][]>('pixelsAt(10, [[50, 50]])'))[0];
      const during = (await film.eval<number[][]>('pixelsAt(60, [[50, 50]])'))[0];
      expect(early, 'at 0.33 s the layer has not started').not.toEqual(BG);
      expect(during, 'at 2 s it is there').toEqual(BG);
    }, { query: 'mode=lifespan' });
  }, 120_000);

  it('a rebuild (setVars) keeps the three layer (its setup does not run again) and the mesh goes on showing the live 2D layer, with the new text', async () => {
    await withFilm('three-layer-texture', async (film) => {
      const before = await film.eval<string>('hashOf(20)');
      await film.eval('movie.setVars({ label: "CHANGED" })');
      expect(await film.eval<number>('window.__setups'), 'setup ran once').toBe(1);
      const after = await film.eval<string>('hashOf(20)');
      expect(after, 'the text of the 2D layer changed on the mesh').not.toBe(before);
      const dot = (await film.eval<number[][]>('pixelsAt(0, [[80, 180]])'))[0];
      expect(dot, 'and the mesh is still the 2D layer, colour for colour').toEqual(DOT);
      expect(await film.eval('window.__logs.filter(l => !/Math\\.random/.test(l))')).toEqual([]);
    }, { query: 'mode=flat' });
  }, 120_000);

  it('mistakes say what to write: no such layer (with the names that are there), a layer that is not a composition, a layer listed after the three layer', async () => {
    const say = (query: string) => withFilm('three-layer-texture', (film) => film.eval<string>('window.initError'), { query });
    expect(await say('mode=missing')).toMatch(/no layer named "nothing-here".*(screen|bg)/s);
    expect(await say('mode=notcomp')).toMatch(/"bg".*(shape).*composition/s);
    expect(await say('mode=late')).toMatch(/"screen".*(before|after|not built)/s);
  }, 180_000);
});
