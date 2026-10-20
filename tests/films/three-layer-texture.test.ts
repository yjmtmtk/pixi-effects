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

  it('a texture seen small is filtered, not aliased: 1-pixel stripes on a plane a quarter of the picture come out as one even grey on every route (without mipmaps they came out as black and white stripes, spread 127)', async () => {
    // the grey is the average of black and white: PixiJS's GPU mip levels average the stored (sRGB) bytes, so on the shared GPU it is 128; a read-back canvas gets three's mipmaps, made in linear light: 188
    for (const [query, o, grey] of [['mode=stripes', {}, 128], ['mode=stripes&share=0', {}, 188], ['mode=stripes', { beforeLoad: NO_GPU }, 188]] as const) {
      await withFilm('three-layer-texture', async (film) => {
        const stats = await film.eval<{ mean: number; std: number }>('regionStats(0, 260, 150, 120, 60)');
        const where = `${query}${o.beforeLoad ? ' (no WebGPU)' : ''}`;
        expect(Math.abs(stats.mean - grey), `${where}: the grey is ${grey}, got ${stats.mean}`).toBeLessThan(4);
        expect(stats.std, `${where}: no stripes left`).toBeLessThan(8);
      }, { query, ...o });
    }
  }, 180_000);

  // a half-transparent red disc on nothing, over the page background (11, 15, 26): in the 2D movie the disc is (255 x 0.5 + 11 x 0.5, 15 x 0.5, 26 x 0.5) = (133, 7.5, 13)
  it('transparent: true lets what is behind show through the empty and the half-transparent parts: the same colours as the 2D layer would give over the same background, on every route', async () => {
    for (const [query, o] of [['mode=alpha', {}], ['mode=alpha&share=0', {}], ['mode=alpha', { beforeLoad: NO_GPU }]] as const) {
      await withFilm('three-layer-texture', async (film) => {
        const [centre, outside] = await film.eval<number[][]>('pixelsAt(0, [[320, 180], [30, 30]])');
        const where = `${query}${o.beforeLoad ? ' (no WebGPU)' : ''}`;
        expect(centre[0]!, `${where}: red over the background`).toBeGreaterThanOrEqual(131); expect(centre[0]!).toBeLessThanOrEqual(135);
        expect(centre[1]!).toBeGreaterThanOrEqual(6); expect(centre[1]!).toBeLessThanOrEqual(10);
        expect(centre[2]!).toBeGreaterThanOrEqual(11); expect(centre[2]!).toBeLessThanOrEqual(15);
        expect(outside, `${where}: the empty part is the background`).toEqual(PAGE);
      }, { query, ...o });
    }
  }, 180_000);

  it('without it the empty parts are black (an opaque screen), on every route', async () => {
    for (const [query, o] of [['mode=alpha&transparent=0', {}], ['mode=alpha&transparent=0&share=0', {}], ['mode=alpha&transparent=0', { beforeLoad: NO_GPU }]] as const) {
      await withFilm('three-layer-texture', async (film) => {
        const [outside] = await film.eval<number[][]>('pixelsAt(0, [[30, 30]])');
        expect(outside, `${query}${o.beforeLoad ? ' (no WebGPU)' : ''}`).toEqual([0, 0, 0]);
      }, { query, ...o });
    }
  }, 180_000);

  // the picture at (x, y) of a plane that fills 640 x 360 shows the point (x * 0.75, y * 0.75) of the 480 x 270 screen: the button (240,60, 160 x 60: in the UPPER part) is at (320,80) of the picture
  it('a click on the mesh reaches the 2D layer behind it: the top hit is the layer inside the screen at the point under the pointer (with its own pixels), and it says which mesh it came through', async () => {
    await withFilm('three-layer-texture', async (film) => {
      const hit = await film.eval<{ path: string; kind: string; local: { x: number; y: number }; via?: { path: string; object: string } } | null>('(() => { const h = movie.pick(320, 80); return h && { path: h.path, kind: h.kind, local: h.local, via: h.via }; })()');
      expect(hit!.path).toBe('screen/button');
      expect(hit!.kind).toBe('flat');
      expect(Math.abs(hit!.local.x - 80), 'the middle of the button: 80 of its 160 pixels').toBeLessThanOrEqual(1.5);
      expect(Math.abs(hit!.local.y - 30)).toBeLessThanOrEqual(1.5);
      const mirrored = await film.eval<{ path: string } | null>('movie.pick(320, 280)');
      expect(mirrored!.path, 'the mirror image of the button (turned upside down) is the background').toBe('screen/sbg');
      expect(hit!.via).toEqual({ path: 'world', object: 'plane' });
      const off = await film.eval<{ path: string } | null>('movie.pick(100, 50)');
      expect(off!.path, 'beside the button: the screen background').toBe('screen/sbg');
      const all = await film.eval<string[]>('movie.pickAll(320, 80).map(h => h.path)');
      expect(all.slice(0, 3), 'under it: the screen background, then the three layer itself, then the page background').toEqual(['screen/button', 'screen/sbg', 'world']);
    }, { query: 'mode=ui' });
  }, 120_000);

  it('only / ignore see through the mesh: only the screen\'s layers, or only the three layer, or everything but the screen', async () => {
    await withFilm('three-layer-texture', async (film) => {
      expect(await film.eval<string | null>("(() => { const h = movie.pick(320, 80, { only: ['screen'] }); return h && h.path; })()")).toBe('screen/button');
      expect(await film.eval<string | null>("(() => { const h = movie.pick(320, 80, { only: ['button'] }); return h && h.path; })()"), 'a layer by its own name').toBe('screen/button');
      expect(await film.eval<string | null>("(() => { const h = movie.pick(320, 80, { only: ['world'] }); return h && h.path + ':' + h.kind; })()")).toBe('world:three');
      expect(await film.eval<string | null>("(() => { const h = movie.pick(320, 80, { ignore: ['screen'] }); return h && h.path; })()"), 'ignoring the screen leaves the mesh').toBe('world');
      expect(await film.eval<string | null>("(() => { const h = movie.pick(320, 80, { ignore: ['button'] }); return h && h.path; })()")).toBe('screen/sbg');
    }, { query: 'mode=ui' });
  }, 120_000);

  it('the same on a turning cube: wherever the picture shows the green bar at the BOTTOM of the screen, the pick says screen/bar (the screen is not mirrored or turned by the mapping)', async () => {
    await withFilm('three-layer-texture', async (film) => {
      const r = await film.eval<{ dots: number; agree: number }>(`(async () => {
        const d = await movie.snapshot(60, { as: 'imageData' }); let dots = 0, agree = 0;
        for (let y = 0; y < d.height; y += 3) for (let x = 0; x < d.width; x += 3) {
          const i = (y * d.width + x) * 4;
          if (d.data[i] === 61 && d.data[i + 1] === 220 && d.data[i + 2] === 151) { dots++; const h = movie.pick(x, y); if (h && h.path === 'screen/bar') agree++; }
        }
        return { dots, agree };
      })()`);
      expect(r.dots, 'the bar is on the picture').toBeGreaterThan(40);
      expect(r.agree / r.dots, `${r.agree} of ${r.dots} points of the bar are picked as the bar`).toBeGreaterThan(0.97);
    }, { query: 'mode=cube' });
  }, 120_000);

  it('a real click and a real hover on the mesh arrive as the layer inside the screen', async () => {
    await withFilm('three-layer-texture', async (film) => {
      const mouse = async (type: string, x: number, y: number) => film.cdp.send('Input.dispatchMouseEvent', type === 'mouseMoved' ? { type, x, y } : { type, x, y, button: 'left', clickCount: 1 });
      await mouse('mouseMoved', 320, 80);
      await new Promise((r) => setTimeout(r, 150));
      expect(await film.eval('window.__entered'), 'the hover entered the button').toBe('screen/button');
      await mouse('mousePressed', 320, 80); await mouse('mouseReleased', 320, 80);
      await new Promise((r) => setTimeout(r, 100));
      expect(await film.eval('window.__clicked')).toBe('screen/button');
      await mouse('mouseMoved', 100, 50); await mouse('mousePressed', 100, 50); await mouse('mouseReleased', 100, 50);
      await new Promise((r) => setTimeout(r, 100));
      expect(await film.eval('window.__clicked')).toBe('screen/sbg');
    }, { query: 'mode=ui' });
  }, 120_000);

  it('a layer of the screen that lies below the picture is drawn, on the very first draw and after every jump (the screen is taller than the picture: a layer there was culled by the stage\'s own cull)', async () => {
    await withFilm('three-layer-texture', async (film) => {
      expect(await film.eval<string | undefined>('window.initError')).toBeUndefined();
      const at = async (frame: number) => (await film.eval<number[][]>(`pixelsAt(${frame}, [[320, 301], [320, 100]])`));
      const first = await at(60);                                                     // the first picture after the load, a jump to 2 s: the bar (y 700 of 800) has grown
      expect(first[0], 'the bar, on the first draw').toEqual(BAR);
      expect(first[1], 'the background above it').toEqual(BG);
      expect((await at(0))[0], 'at 0 the bar has no width: the background').toEqual(BG);
      expect((await at(60))[0], 'and back at 2 s it is there again').toEqual(BAR);
      expect((await at(45))[0], 'a jump again (1.5 s, the bar just full)').toEqual(BAR);
    }, { query: 'mode=tall' });
  }, 120_000);

  it('a rebuild that fails leaves the old movie showing its own screen (the old layer was drawing the NEW tree\'s source from the moment of the loan), and so does one that is slow', async () => {
    await withFilm('three-layer-texture', async (film) => {
      expect(await film.eval<string | undefined>('window.initError')).toBeUndefined();
      const dot = async () => (await film.eval<number[][]>('pixelsAt(60, [[480, 270]])'))[0];
      const before = await dot();
      expect(before, 'the dot (or the bar) of the screen is there before').not.toEqual(PAGE);
      // slow: a snapshot taken while the new tree is still building shows the old screen, not a black mesh
      await film.eval('window.__slow = true; window.__pending = movie.setVars({ label: "SLOW" }); 1');
      await new Promise((r) => setTimeout(r, 600));
      expect(await dot(), 'during a slow rebuild').toEqual(before);
      await film.eval('window.__pending.then(() => 1)');
      await film.eval('window.__slow = false; window.__fail = true; 1');
      const failed = await film.eval<string>('movie.setVars({ label: "FAIL" }).then(() => "resolved", (e) => String(e.message))');
      expect(failed).toMatch(/boom/);
      expect(await film.eval<string>("movie.snapshot(60, { as: 'imageData' }).then(() => 'ok', (e) => 'threw: ' + e.message)"), 'a snapshot after the failed rebuild').toBe('ok');
      expect(await dot(), 'after a failed rebuild').toEqual(before);
    }, { query: 'mode=rebuild' });
  }, 120_000);

  it('the screen composition\'s own alpha is shown the same on every route: over black (a screen that fades in fades on the mesh; the read-back route used to show full colour)', async () => {
    const at = (query: string, o: { beforeLoad?: string } = {}) => withFilm('three-layer-texture', async (film) => {
      expect(await film.eval<string | undefined>('window.initError')).toBeUndefined();
      return (await film.eval<number[][]>('pixelsAt(0, [[50, 50]])'))[0]!;
    }, { query, ...(o.beforeLoad ? { beforeLoad: o.beforeLoad } : {}) });
    const shared = await at('mode=fade'), ownCanvas = await at('mode=fade&share=0'), webgl = await at('mode=fade', { beforeLoad: NO_GPU });
    expect(shared[0]!, 'half of the blue background over black').toBeLessThan(BG[0]! * 0.8);
    for (const [name, got] of [['its own canvas', ownCanvas], ['WebGL', webgl]] as const) {
      for (let c = 0; c < 3; c++) expect(Math.abs(got[c]! - shared[c]!), `${name}: channel ${c} ${got} against ${shared}`).toBeLessThanOrEqual(3);
    }
  }, 180_000);

  it('resolution does not change the picture: a blur inside the screen is the same width on the mesh at resolution 1 and 2 (it was half as wide at 2)', async () => {
    const edge = (res: number) => withFilm('three-layer-texture', async (film) => {
      expect(await film.eval<string | undefined>('window.initError')).toBeUndefined();
      // the block is 200 wide, centred in 480 x 270 -> on the 640 x 360 picture its left edge is at x = 253 +- the blur; read the row through the middle
      const row = await film.eval<number[]>(`(async () => { const d = await movie.snapshot(0, { as: 'imageData' }); const y = 180; return Array.from({ length: 640 }, (_, x) => d.data[(y * d.width + x) * 4]); })()`);
      const peak = Math.max(...row), at = (f: number) => row.findIndex((v) => v >= f * peak);
      return at(0.9) - at(0.1);                                                  // the width of the edge, in pixels of the picture
    }, { query: `mode=blur&res=${res}` });
    const w1 = await edge(1), w2 = await edge(2);
    expect(w1, 'there is a blurred edge to measure').toBeGreaterThan(4);
    expect(Math.abs(w2 - w1) / w1, `edge widths ${w1} and ${w2}`).toBeLessThan(0.2);
  }, 180_000);

  it('a texture wider than the GPU allows is said in a sentence that names the size and the option, not by a flood of GPU errors', async () => {
    await withFilm('three-layer-texture', async (film) => {
      const err = await film.eval<string | undefined>('window.initError');
      expect(err).toMatch(/texture would be 12000 x 1200/);
      expect(err).toMatch(/resolution/);
    }, { query: 'mode=huge&res=4' });
  }, 120_000);

  it('screen.dispose() takes the handle out of the rebuilds: the next setVars still works (it failed with an opaque null error)', async () => {
    await withFilm('three-layer-texture', async (film) => {
      expect(await film.eval<string | undefined>('window.initError')).toBeUndefined();
      await film.eval('window.__handle.dispose(); 1');
      const r = await film.eval<string>('movie.setVars({ label: "AFTER" }).then(() => "ok", (e) => String(e.message))');
      expect(r).toBe('ok');
    }, { query: 'mode=flat' });
  }, 120_000);

  it('a source that has a mask and is not at the origin says so (its content is drawn from the origin, the mask stays where the parent puts it)', async () => {
    await withFilm('three-layer-texture', async (film) => {
      expect(await film.eval<string | undefined>('window.initError')).toBeUndefined();
      expect((await film.eval<string[]>('window.__logs')).join('\n')).toMatch(/"screen" has a mask.*x: 0, y: 0|mask.*not at the origin/s);
    }, { query: 'mode=maskoff' });
  }, 120_000);

  it('a layer that is not alive does not answer through the mesh, and nothing changes for a mesh that shows no layer', async () => {
    await withFilm('three-layer-texture', async (film) => {
      const early = await film.eval<string | null>("(async () => { await movie.gotoFrame(10, true); const h = movie.pick(320, 80); return h && h.path; })()");
      expect(early, 'before the screen starts (1.5 s) the mesh itself is what is there').toBe('world');
      await film.eval('movie.gotoFrame(60, true)');
      expect(await film.eval<string | null>("(() => { const h = movie.pick(5, 5); return h && h.path; })()"), 'a point of the page behind the mesh').toBeTruthy();
    }, { query: 'mode=lifespan' });
  }, 120_000);
});
