// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// The scene2d layer: PixiJS 2D built by code (setup) and set from the time (update), as a layer of the movie. It draws, it is a function of the time (an
// AnimatedSprite left playing is posed from the layer's time), keyframes reach its objects, it exports, pick names its objects, a rebuild keeps its scene,
// and its mistakes are said in a sentence. The drawing is checked on WebGL and on WebGPU.
const BACKGROUND = [16, 32, 64, 255];
const RED_BOX = [224, 64, 96, 255];
const YELLOW = [242, 193, 78, 255];
const GREEN = [64, 224, 128, 255];
const WEBGL = "Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })";
const BACKENDS = [['webgpu', undefined], ['webgl', WEBGL]] as const;
const on = <T>(fn: Parameters<typeof withFilm<T>>[1], o: { beforeLoad?: string; query?: string } = {}) => withFilm<T>('scene2d', fn, o);
const near = (a: number[], b: number[], tol: number) => a.every((v, i) => Math.abs(v - b[i]!) <= tol);

runFilms('scene2d: PixiJS 2D built by code, as a layer', () => {
  it('draws on both backends: the box, the ball where update puts it, the group, the background where nothing is, and no warning', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(async (film) => {
        expect(await film.eval('window.__error ?? null'), name).toBeNull();
        expect(await film.eval<string>('backend()'), name).toBe(name);
        expect(await film.eval<number[]>('pixelAt(0, 270, 40)'), `${name} box`).toEqual(RED_BOX);
        expect(await film.eval<number[]>('pixelAt(0, 40, 90)'), `${name} ball at 0 s`).toEqual(YELLOW);
        expect(await film.eval<number[]>('pixelAt(30, 120, 90)'), `${name} ball at 1 s`).toEqual(YELLOW);
        expect(await film.eval<number[]>('pixelAt(30, 40, 90)'), `${name} the ball left`).toEqual(BACKGROUND);
        expect(await film.eval<number[]>('pixelAt(0, 25, 25)'), `${name} group`).toEqual(GREEN);
        expect(await film.eval<number[]>('pixelAt(0, 35, 25)'), `${name} between`).toEqual(BACKGROUND);
        expect(await film.eval<string[]>('window.__logs'), name).toEqual([]);
      }, { beforeLoad });
    }
  }, 180_000);

  it('is a function of the time: forward, backward and a repeat give one picture per frame, and the scene moves', async () => {
    await on(async (film) => {
      const h = (f: number) => film.eval<string>(`hashOf(${f})`);
      const forward = [await h(0), await h(30), await h(60), await h(89)];
      const back = [await h(89), await h(60), await h(30), await h(0)].reverse();
      expect(back).toEqual(forward);
      expect(await h(30)).toBe(forward[1]);
      expect(new Set(forward).size).toBe(4);
    });
  }, 120_000);

  it('an AnimatedSprite left playing is posed from the layer\'s time (frame floor(t * 60 * animationSpeed)), in any order, and nothing runs on the ticker', async () => {
    await on(async (film) => {
      const colour = async (f: number) => (await film.eval<number[]>(`pixelAt(${f}, 20, 150)`)).slice(0, 3).join(',');
      const want = ['255,0,0', '0,255,0', '0,0,255', '255,0,0'];
      for (const f of [3, 0, 2, 1]) expect(await colour(f), `frame ${f}`).toBe(want[f]);
      expect(await colour(31), 'frame 31').toBe(want[1]);
      expect(await film.eval<boolean>("(() => { let v = null; const w = c => { if (c.label === 'anim') v = c; for (const k of c.children ?? []) w(k); }; w(movie.app.stage); return v.autoUpdate; })()")).toBe(false);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    });
  }, 120_000);

  it('keyframes reach the scene\'s objects: scene2d.box.alpha takes the box away at 2 s', async () => {
    await on(async (film) => {
      expect(await film.eval<number[]>('pixelAt(50, 270, 40)')).toEqual(RED_BOX);
      expect(await film.eval<number[]>('pixelAt(75, 270, 40)')).toEqual(BACKGROUND);
    });
  }, 120_000);

  it('anchorX / anchorY place the layer\'s box by its own point: a 100 x 100 box anchored at its middle at 160, 90 covers 110..210, 40..140', async () => {
    await on(async (film) => {
      expect(await film.eval<number[]>('pixelAt(0, 112, 42)')).toEqual([255, 255, 255, 255]);
      expect(await film.eval<number[]>('pixelAt(0, 208, 138)')).toEqual([255, 255, 255, 255]);
      expect(await film.eval<number[]>('pixelAt(0, 106, 42)')).toEqual(BACKGROUND);
      expect(await film.eval<number[]>('pixelAt(0, 214, 42)')).toEqual(BACKGROUND);
    }, { query: 'anchor=1' });
  }, 120_000);

  it('exports what it shows: the ball is at x 120 one second into the file', async () => {
    await on(async (film) => {
      expect(near(await film.eval<number[]>('exportPixel([0, 2], 1, 120, 90)'), YELLOW, 24)).toBe(true);
      expect(near(await film.eval<number[]>('exportPixel([0, 2], 1, 40, 90)'), BACKGROUND, 24)).toBe(true);
    });
  }, 120_000);

  it('movie.pick names the object under the point (its label, or a labelled ancestor\'s); empty space in the box is not the layer; grab().move gives the delta', async () => {
    await on(async (film) => {
      await film.eval('movie.snapshot(0, { as: "imageData" })');
      const pick = (x: number, y: number) => film.eval<any>(`(() => { const h = movie.pick(${x}, ${y}); return h && { kind: h.kind, path: h.path, object: h.scene2d && h.scene2d.object, point: h.scene2d && h.scene2d.point }; })()`);
      expect(await pick(270, 40)).toMatchObject({ kind: 'scene2d', path: 'world', object: 'box', point: [270, 40] });
      expect(await pick(45, 25)).toMatchObject({ kind: 'scene2d', object: 'pair' });
      expect(await pick(40, 90)).toMatchObject({ kind: 'scene2d', object: 'ball' });
      expect(await pick(160, 40)).toBeNull();
      const moved = await film.eval<any>('movie.pick(40, 90).scene2d.grab().move(50, 95)');
      expect(moved.point).toEqual([50, 95]);
      expect(moved.delta).toEqual([10, 5]);
      // the frame on screen: at 1 s the ball is at 120 and no longer at 40
      await film.eval('movie.snapshot(30, { as: "imageData" })');
      expect(await pick(120, 90)).toMatchObject({ object: 'ball' });
      expect(await pick(40, 90)).toBeNull();
    });
  }, 120_000);

  it("PixiJS's own pointer events work on a scene2d object (eventMode 'static', on('pointerdown'))", async () => {
    await on(async (film) => {
      await film.eval('movie.snapshot(0, { as: "imageData" })');
      await film.eval("(() => { let v = null; const w = c => { if (c.label === 'box') v = c; for (const k of c.children ?? []) w(k); }; w(movie.app.stage); window.__down = 0; v.eventMode = 'static'; v.on('pointerdown', () => window.__down++); })()");
      await film.cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 270, y: 40 });
      await film.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 270, y: 40, button: 'left', clickCount: 1 });
      await film.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 270, y: 40, button: 'left', clickCount: 1 });
      expect(await film.eval<number>('window.__down')).toBe(1);
    });
  }, 120_000);

  it('setVars keeps the scene (setup runs once) and the picture is the one of a page built with that value; reuse: false builds it again', async () => {
    const fresh = await on(async (film) => film.eval<string>('hashOf(30)'), { query: 'label=b' });
    await on(async (film) => {
      await film.eval('movie.setVars({ label: "b" })');
      expect(await film.eval<number>('window.__setups')).toBe(1);
      expect(await film.eval<string>('hashOf(30)')).toBe(fresh);
      await film.eval('movie.setVars({ label: "c" })');
      await film.eval('movie.setVars({ label: "b" })');
      expect(await film.eval<number>('window.__setups')).toBe(1);
      expect(await film.eval<string>('hashOf(30)')).toBe(fresh);
      expect(await film.eval<number[]>('pixelAt(75, 270, 40)'), 'the keyframe still reaches the kept box').toEqual(BACKGROUND);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    });
    await on(async (film) => {
      await film.eval('movie.setVars({ label: "b" })');
      expect(await film.eval<number>('window.__setups')).toBe(2);
      expect(await film.eval<string>('hashOf(30)')).toBe(fresh);
    }, { query: 'noreuse=1' });
  }, 180_000);

  it('ctx.texture(name) is the texture of a movie asset; an unknown name says which assets there are', async () => {
    await on(async (film) => {
      expect(await film.eval<number[]>('pixelAt(0, 160, 30)')).toEqual([0, 224, 224, 255]);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    }, { query: 'asset=1' });
    await on(async (film) => {
      expect(await film.eval<string>('window.__error')).toMatch(/setup failed: no asset named "nope" \(assets: chip\)/);
    }, { query: 'asset=missing' });
  }, 120_000);

  it('mistakes are said in a sentence with the layer\'s name', async () => {
    await on(async (film) => {
      expect((await film.eval<string[]>('window.__logs')).join('\n')).toMatch(/scene2d layer "world": update calls Math\.random/);
    }, { query: 'impure=1' });
    await on(async (film) => {
      expect(await film.eval<string>('window.__error')).toMatch(/scene2d layer "world": a scene2d layer needs setup/);
    }, { query: 'nosetup=1' });
    await on(async (film) => {
      expect(await film.eval<string>('window.__error')).toMatch(/scene2d layer "world": setup failed: no such texture/);
    }, { query: 'throws=1' });
    await on(async (film) => {
      expect((await film.eval<string[]>('window.__logs')).join('\n')).toMatch(/scene2d\.nope\.x: unknown object "nope" \(known: box, ball, pair, anim, root\)/);
    }, { query: 'badpath=1' });
    await on(async (film) => {
      expect((await film.eval<string[]>('window.__logs')).join('\n')).toMatch(/scene2d layer "world": .*video.* plays by the browser's clock/);
    }, { query: 'video=1' });
  }, 300_000);
});
