// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// The three layer drawn by three's WebGLRenderer and by its WebGPURenderer (`renderer: 'webgpu'`): the same scene, over a 2D shape, in the same movie.
const FRAMES = [0, 30, 75];
const BACKGROUND = [16, 32, 64, 255];                                    // #102040
const framesOf = (which: string) => withFilm('three-renderers', async (film) => {
  expect(await film.eval<string>('JSON.stringify(window.__logs)'), `${which}: the page warned`).toBe('[]');
  const out: number[][] = [];
  for (const f of FRAMES) out.push(await film.eval<number[]>(`framePixels(${f})`));
  return out;
}, { query: `renderer=${which}` });

runFilms('Three layer: the WebGL and the WebGPU renderer draw the same scene', () => {
  it('both draw the lit box (the centre is not the background), the 2D band under it stays, and the corner stays the background', async () => {
    for (const which of ['webgl', 'webgpu']) {
      await withFilm('three-renderers', async (film) => {
        const centre = await film.eval<number[]>('pixelAt(30, 160, 90)');
        expect(centre, `${which} centre`).not.toEqual(BACKGROUND);
        expect(await film.eval<number[]>('pixelAt(30, 4, 4)'), `${which} corner`).toEqual(BACKGROUND);
        expect(await film.eval<number[]>('pixelAt(30, 10, 170)'), `${which} the 2D band`).toEqual([242, 193, 78, 255]);
      }, { query: `renderer=${which}` });
    }
  }, 180_000);

  it("really use the renderer the layer asks for (an ignored option would make the next test pass for nothing)", async () => {
    const info = async (which: string) => withFilm('three-renderers', (film) => film.eval<{ cls: string; gpuBackend: boolean }>('window.threeInfo'), { query: `renderer=${which}` });
    expect((await info('webgl')).cls).toBe('WebGLRenderer');
    const gpu = await info('webgpu');
    expect(gpu.cls).toBe('WebGPURenderer');
    expect(gpu.gpuBackend, 'the browser has WebGPU here: three must have used it, not its WebGL2 fallback').toBe(true);
  }, 120_000);

  it('each is a function of the time: forward, backward and a repeat give one picture per frame', async () => {
    for (const which of ['webgl', 'webgpu']) {
      await withFilm('three-renderers', async (film) => {
        const h = async (f: number) => film.eval<string>(`hashOf(${f})`);
        const forward = [await h(0), await h(30), await h(60), await h(75)];
        const back = [await h(75), await h(60), await h(30), await h(0)].reverse();
        expect(back, which).toEqual(forward);
        expect(await h(30), `${which}: a repeat`).toBe(forward[1]);
        expect(new Set(forward).size, `${which}: the box really turns`).toBe(4);
      }, { query: `renderer=${which}` });
    }
  }, 180_000);

  it('the two renderers agree: measured 2026-10-15 a mean difference of 0.04–0.06 of 255 per channel and 33–51 of 172,800 channels off by more than 32 (edges); the bounds are ten times that', async () => {
    const gl = await framesOf('webgl');
    const gpu = await framesOf('webgpu');
    for (let k = 0; k < FRAMES.length; k++) {
      let sum = 0, big = 0;
      for (let i = 0; i < gl[k]!.length; i++) { if (i % 4 === 3) continue; const d = Math.abs(gl[k]![i]! - gpu[k]![i]!); sum += d; if (d > 32) big++; }
      const mean = sum / (gl[k]!.length * 3 / 4);
      expect(mean, `frame ${FRAMES[k]} mean difference`).toBeLessThan(0.6);
      expect(big, `frame ${FRAMES[k]} channels off by more than 32`).toBeLessThan(500);
    }
  }, 180_000);
});

// Where the two renderers legitimately differ (found 2026-10-15 on examples/films/light-as-material: mean 2.9 of 255, gone with both switches below):
// WebGPURenderer blends fog and resolves the multisampling in LINEAR light, before tone mapping and the sRGB encode; WebGLRenderer does both after them (three.js:
// Renderer.js _getFrameBufferTarget, NodeMaterial.js setupOutput; the WebGPU way is the documented "more correct" one). A thin, hot edge and a hot highlight in fog
// therefore come out brighter on WebGPU. If a three release makes them agree, the "differ" tests below fail: then remove them and say so in docs/dsl.md.
const diffOf = async (query: string) => {
  const grab = async (which: string) => withFilm('three-renderers', async (film) => {
    const out: number[][] = [];
    for (const f of [60, 75]) out.push(await film.eval<number[]>(`framePixels(${f})`));
    return out;
  }, { query: `renderer=${which}&${query}` });
  const gl = await grab('webgl'), gpu = await grab('webgpu');
  let worst = 0, worstBig = 0;
  for (let k = 0; k < gl.length; k++) {
    let sum = 0, big = 0, n = 0;
    for (let i = 0; i < gl[k]!.length; i++) { if (i % 4 === 3) continue; const d = Math.abs(gl[k]![i]! - gpu[k]![i]!); sum += d; n++; if (d > 32) big++; }
    worst = Math.max(worst, sum / n); worstBig = Math.max(worstBig, big);
  }
  return { mean: worst, big: worstBig };
};

runFilms('Three layer: where WebGL and WebGPU differ on purpose (the output pipeline)', () => {
  it('with tone mapping and no antialias and no fog the two agree (measured mean 0.04 of 255, no channel off by more than 32)', async () => {
    const d = await diffOf('aa=0&fog=0&tone=1');
    expect(d.mean).toBeLessThan(0.3);
    expect(d.big).toBeLessThan(50);
  }, 300_000);

  it('DIFFER: with antialias and tone mapping the edges are brighter on WebGPU (measured 222 channels off by more than 32, against 0 without antialias)', async () => {
    const aa = await diffOf('aa=1&fog=0&tone=1');
    const noAa = await diffOf('aa=0&fog=0&tone=1');
    expect(aa.big, 'with antialias').toBeGreaterThan(100);
    expect(noAa.big, 'without antialias').toBeLessThan(50);
  }, 300_000);

  it('DIFFER: fog is blended before tone mapping on WebGPU and after on WebGL: a lit scene in fog is brighter there (measured mean 3.1 of 255, ~7,800 channels off by more than 32)', async () => {
    const d = await diffOf('aa=0&fog=1&tone=1');
    expect(d.mean).toBeGreaterThan(1.5);
    expect(d.big).toBeGreaterThan(2000);
  }, 300_000);
});

const NO_WEBGPU = "Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });";   // what three sees in a browser without WebGPU (its own code path: navigator.gpu missing)

runFilms("Three layer: the page default, and a browser with no WebGPU", () => {
  it("registerThree({ renderer: 'webgpu' }) is the default of a layer that names no renderer; the layer's own renderer still wins", async () => {
    const info = (query: string) => withFilm('three-renderers', (film) => film.eval<{ cls: string }>('window.threeInfo'), { query });
    expect((await info('page=webgpu')).cls).toBe('WebGPURenderer');
    expect((await info('page=webgl')).cls).toBe('WebGLRenderer');
    expect((await info('renderer=webgpu')).cls).toBe('WebGPURenderer');
  }, 120_000);

  it("with no WebGPU in the browser three's WebGPURenderer draws with its WebGL2 backend: no warning in the page, deterministic, and the same picture as the WebGPU backend (measured: no antialias 0.00 of 255; with antialias edges only)", async () => {
    const noGpu = (aa: number) => withFilm('three-renderers', async (film) => {
      const info = await film.eval<{ cls: string; gpuBackend: boolean }>('window.threeInfo');
      const logs = await film.eval<string>('JSON.stringify(window.__logs)');
      const h = async (f: number) => film.eval<string>(`hashOf(${f})`);
      const forward = [await h(0), await h(30), await h(60)];
      const back = [await h(60), await h(30), await h(0)].reverse();
      const px: number[][] = [];
      for (const f of FRAMES) px.push(await film.eval<number[]>(`framePixels(${f})`));
      return { info, logs, forward, back, px };
    }, { query: `renderer=webgpu&fog=1&tone=1&aa=${aa}`, beforeLoad: NO_WEBGPU });
    const withGpu = (aa: number) => withFilm('three-renderers', async (film) => {
      const px: number[][] = [];
      for (const f of FRAMES) px.push(await film.eval<number[]>(`framePixels(${f})`));
      return px;
    }, { query: `renderer=webgpu&fog=1&tone=1&aa=${aa}` });
    for (const aa of [0, 1]) {
      const a = await noGpu(aa);
      expect(a.info.cls, `aa=${aa}`).toBe('WebGPURenderer');
      expect(a.info.gpuBackend, 'there is no WebGPU: the WebGL2 backend').toBe(false);
      expect(a.logs, 'the "WebGPU is not available" warning is information, not a console line').not.toMatch(/WebGPU is not available/);
      expect(a.back, 'a function of the time').toEqual(a.forward);
      const b = await withGpu(aa);
      for (let k = 0; k < FRAMES.length; k++) {
        let sum = 0, big = 0, n = 0;
        for (let i = 0; i < a.px[k]!.length; i++) { if (i % 4 === 3) continue; const d = Math.abs(a.px[k]![i]! - b[k]![i]!); sum += d; n++; if (d > 32) big++; }
        expect(sum / n, `aa=${aa} frame ${FRAMES[k]} mean difference`).toBeLessThan(aa ? 0.3 : 0.05);
        expect(big, `aa=${aa} frame ${FRAMES[k]} channels off by more than 32`).toBeLessThan(aa ? 500 : 5);
      }
    }
  }, 600_000);
});
