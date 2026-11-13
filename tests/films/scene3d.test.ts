// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// The scene3d layer (PixiJS 3D drawn inside PixiJS's renderer): it draws, it is a function of the time, its keyframes reach the scene's objects, it exports,
// and its mistakes (a typo, a key only three has, a setup that fails, PixiJS 3D loaded too late) are said in a sentence. Each on WebGL and on WebGPU.
const BACKGROUND = [16, 32, 64, 255];                                    // #102040
const BAND = [242, 193, 78, 255];                                        // #f2c14e
const WEBGL = "Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })";
const BACKENDS = [['webgpu', undefined], ['webgl', WEBGL]] as const;
const on = <T>(beforeLoad: string | undefined, fn: Parameters<typeof withFilm<T>>[1], query?: string) => withFilm<T>('scene3d', fn, { beforeLoad, ...(query ? { query } : {}) });

/** The x of the middle of what is not the background, in rows 70..115 and columns 110..319 (the cube; the model sits top left). */
const cubeX = (px: number[]): number => {
  let sum = 0, n = 0;
  for (let y = 70; y < 116; y++) for (let x = 110; x < 320; x++) {
    const i = (y * 320 + x) * 4;
    if (Math.abs(px[i]! - 16) + Math.abs(px[i + 1]! - 32) + Math.abs(px[i + 2]! - 64) > 24) { sum += x; n++; }
  }
  return n ? sum / n : -1;
};

runFilms('scene3d: a PixiJS 3D scene as a layer', () => {
  it('draws on both backends: the cube over the background, the 2D band under it, the corner left alone, and no warning', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(beforeLoad, async (film) => {
        expect(await film.eval('window.__error ?? null'), name).toBeNull();
        expect(await film.eval<string>('backend()'), name).toBe(name);
        expect(await film.eval<number[]>('pixelAt(30, 160, 90)'), `${name} centre`).not.toEqual(BACKGROUND);
        expect(await film.eval<number[]>('pixelAt(30, 316, 4)'), `${name} corner`).toEqual(BACKGROUND);
        expect(await film.eval<number[]>('pixelAt(30, 10, 170)'), `${name} band`).toEqual(BAND);
        expect(await film.eval<string[]>('window.__logs'), name).toEqual([]);
      });
    }
  }, 180_000);

  it('is a function of the time: forward, backward and a repeat give one picture per frame, and the scene really moves', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(beforeLoad, async (film) => {
        const h = (f: number) => film.eval<string>(`hashOf(${f})`);
        const forward = [await h(0), await h(30), await h(60), await h(89)];
        const back = [await h(89), await h(60), await h(30), await h(0)].reverse();
        expect(back, name).toEqual(forward);
        expect(await h(30), `${name}: a repeat`).toBe(forward[1]);
        expect(new Set(forward).size, `${name}: the scene moves`).toBe(4);
      });
    }
  }, 180_000);

  it('a model made with autoPlay and posed by nobody plays its clip on the layer\'s time: every frame drawn while playing is the frame a seek draws, and the model moves', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(beforeLoad, async (film) => {
        expect(await film.eval('window.__error ?? null'), name).toBeNull();
        const played = await film.eval<Record<string, string>>('playAndRecord(1.2)');
        const frames = Object.keys(played).map(Number);
        expect(frames.length, `${name}: frames drawn while playing`).toBeGreaterThan(5);
        for (const f of frames) expect(await film.eval<string>(`hashOf(${f})`), `${name} frame ${f}`).toBe(played[f]);
        const model = async (f: number) => (await film.eval<number[]>(`framePixels(${f})`)).filter((_, i) => { const p = i >> 2, x = p % 320, y = (p / 320) | 0; return x > 5 && x < 105 && y > 10 && y < 90; }).join(',');
        expect(await model(10), `${name}: the clip moves the model`).not.toBe(await model(20));
        expect(await film.eval<string[]>('window.__logs'), name).toEqual([]);
      }, 'selfplay=1');
    }
  }, 180_000);

  it('a clip the layer played early is the author\'s again once update poses it: from 1 s the model holds the pose update gives it (the layer keeps no memory of the frames it drew)', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(beforeLoad, async (film) => {
        const model = async (f: number) => (await film.eval<number[]>(`framePixels(${f})`)).filter((_, i) => { const p = i >> 2, x = p % 320, y = (p / 320) | 0; return x > 5 && x < 105 && y > 10 && y < 90; }).join(',');
        expect(await model(10), `${name}: before 1 s the layer plays the clip`).not.toBe(await model(20));
        expect(await model(60), `${name}: from 1 s update's pose holds`).toBe(await model(68));
      }, 'condplay=1');
    }
  }, 180_000);

  it('the shader time uTime that PixiJS 3D hands its materials is the layer\'s time, not the wall clock (a shader bit that reads it is a function of the time)', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(beforeLoad, async (film) => {
        for (const f of [45, 15]) {
          await film.eval(`movie.snapshot(${f}, { as: 'imageData' })`);
          const u = await film.eval<number>("(() => { let v = null; const w = c => { if (c.label === 'hero') v = c; for (const k of c.children ?? []) w(k); }; w(movie.app.stage); return v._gpuData[movie.app.renderer.uid].globalUniformGroup.uniforms.uTime; })()");
          expect(u, `${name} frame ${f}`).toBeCloseTo(f / 30, 5);
        }
      });
    }
  }, 180_000);

  it('a keyframe on scene3d.cube.position.x moves the cube: it is further right at 2 s than at 1 s', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(beforeLoad, async (film) => {
        const at1 = cubeX(await film.eval<number[]>('framePixels(30)'));
        const at2 = cubeX(await film.eval<number[]>('framePixels(60)'));
        expect(at1, name).toBeGreaterThan(0);
        expect(at2 - at1, `${name}: ${at1} -> ${at2}`).toBeGreaterThan(15);
      });
    }
  }, 180_000);

  it('exports: the file shows the cube (WebGPU)', async () => {
    await on(undefined, async (film) => {
      const px = await film.eval<number[]>('exportPixel([0, 1], 0.5, 160, 90)');
      expect(Math.abs(px[0]! - 16) + Math.abs(px[1]! - 32) + Math.abs(px[2]! - 64), `exported pixel ${px}`).toBeGreaterThan(40);
    });
  }, 180_000);

  it('says what is wrong: a typo of a key (did you mean), a key only a three layer has, and a keyframe path to an object setup did not name', async () => {
    await on(undefined, async (film) => {
      const logs = (await film.eval<string[]>('window.__logs')).join('\n');
      expect(logs).toMatch(/scene3d layer "hero": unknown key "setUp"; did you mean "setup"\?/);
      expect(logs).toMatch(/scene3d layer "hero": shareGpu is about three's own renderer; a scene3d layer is drawn by PixiJS itself, so it has no such option/);
      expect(logs).toMatch(/scene3d\.nope\.x: unknown object "nope" \(known: cube, camera, view\)/);
    }, 'badkey=1');
  }, 120_000);

  it('a setup that fails stops init with the layer named and the reason', async () => {
    await on(undefined, async (film) => {
      expect(await film.eval<string>('window.__error')).toMatch(/scene3d layer "hero": setup failed: the model was not found/);
    }, 'throw=1');
  }, 120_000);

  it('PixiJS 3D loaded after the renderer started: the build says to import pixi-effects/3d before movie.init', async () => {
    await on(undefined, async (film) => {
      expect(await film.eval<string>('window.__error')).toMatch(/import 'pixi-effects\/3d' \(and call register3D\(\)\) before movie\.init/);
    }, 'late=1');
  }, 120_000);

  it('a rebuild (setVars) destroys the old scene quietly and the new one draws', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(beforeLoad, async (film) => {
        await film.eval("movie.setVars({ label: 'b' })");
        expect(await film.eval<number[]>('pixelAt(30, 160, 90)'), name).not.toEqual(BACKGROUND);
        expect(await film.eval<string[]>('window.__logs'), name).toEqual([]);
      });
    }
  }, 180_000);

  it('the two backends draw nearly the same scene (they are different pipelines in PixiJS 3D: measured below, not required to match)', async () => {
    const grab = (beforeLoad: string | undefined) => on(beforeLoad, async (film) => [await film.eval<number[]>('framePixels(0)'), await film.eval<number[]>('framePixels(45)')]);
    const gpu = await grab(undefined), gl = await grab(WEBGL);
    for (let k = 0; k < 2; k++) {
      let sum = 0;
      for (let i = 0; i < gpu[k]!.length; i++) if (i % 4 !== 3) sum += Math.abs(gpu[k]![i]! - gl[k]![i]!);
      const mean = sum / (gpu[k]!.length * 3 / 4);
      console.log(`scene3d webgl vs webgpu, frame ${[0, 45][k]}: mean ${mean.toFixed(3)} of 255`);
      expect(mean).toBeLessThan(10);
    }
  }, 180_000);
});
