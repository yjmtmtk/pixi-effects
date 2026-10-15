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
