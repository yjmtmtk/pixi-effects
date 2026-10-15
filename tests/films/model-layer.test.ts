// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// The `model` layer on a real browser: a glTF box turning 360° in 2 s (clip "Spin"), drawn by three's WebGL or WebGPU renderer, in a 3 s movie at 30 fps.
const BACKGROUND = [16, 32, 64, 255];                                    // #102040
const meanDiff = (a: number[], b: number[]) => { let s = 0, n = 0; for (let i = 0; i < a.length; i++) { if (i % 4 === 3) continue; s += Math.abs(a[i]! - b[i]!); n++; } return s / n; };

runFilms('Model layer: a glTF model as data, posed by the time', () => {
  it('draws the model (the centre is not the background), leaves the corner and the 2D band alone, and loads with no warning', async () => {
    await withFilm('model-layer', async (film) => {
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      expect(await film.eval<number[]>('pixelAt(15, 160, 90)')).not.toEqual(BACKGROUND);
      expect(await film.eval<number[]>('pixelAt(15, 4, 4)')).toEqual(BACKGROUND);
      expect(await film.eval<number[]>('pixelAt(15, 10, 170)')).toEqual([242, 193, 78, 255]);
    });
  }, 180_000);

  // A cube looks the same every 90°, so the frames are chosen off the quarter turns: 6 = 0.2 s = 36°, 66 = 2.2 s.
  it('plays the clip (0.2 s = 36° differs from 0), and loops it (2.0 s equals 0 s, 2.2 s equals 0.2 s)', async () => {
    await withFilm('model-layer', async (film) => {
      const px = async (f: number) => film.eval<number[]>(`framePixels(${f})`);
      const [f0, f6, f60, f66] = [await px(0), await px(6), await px(60), await px(66)];
      expect(meanDiff(f0, f6), 'the box turns').toBeGreaterThan(1);
      expect(meanDiff(f0, f60), 'a whole turn is back where it started').toBeLessThan(0.05);
      expect(meanDiff(f6, f66), 'the clip repeats').toBeLessThan(0.05);
    });
  }, 180_000);

  it('is a function of the time: forward, backward and a repeat give one picture per frame, and real time passing changes nothing', async () => {
    await withFilm('model-layer', async (film) => {
      const h = async (f: number) => film.eval<string>(`hashOf(${f})`);
      const forward = [await h(0), await h(6), await h(18), await h(37)];       // 0°, 36°, 108°, 222°
      const back = [await h(37), await h(18), await h(6), await h(0)].reverse();
      expect(back).toEqual(forward);
      await new Promise((r) => setTimeout(r, 600));
      expect(await h(6), 'after 0.6 s of real time').toBe(forward[1]);
      expect(new Set(forward).size, 'four poses, four pictures').toBe(4);
    });
  }, 180_000);

  it("inspect says which renderer drew it; renderer: 'webgpu' is really WebGPU, and the page default is WebGL", async () => {
    const info = (query: string) => withFilm('model-layer', (film) => film.eval<{ renderer: string; backend: string }>('layerInfo(6)'), { query });
    expect(await info('renderer=webgl')).toMatchObject({ renderer: 'webgl', backend: 'webgl' });
    expect(await info('')).toMatchObject({ renderer: 'webgl', backend: 'webgl' });
    expect(await info('renderer=webgpu')).toMatchObject({ renderer: 'webgpu', backend: 'webgpu' });
  }, 180_000);

  it('WebGL and WebGPU draw the same model (no antialias: measured below 0.1 of 255; with antialias edges only)', async () => {
    const grab = (which: string, aa: number) => withFilm('model-layer', async (film) => {
      const out: number[][] = [];
      for (const f of [0, 6, 18, 37]) out.push(await film.eval<number[]>(`framePixels(${f})`));
      return out;
    }, { query: `renderer=${which}&aa=${aa}` });
    for (const aa of [0, 1]) {
      const gl = await grab('webgl', aa), gpu = await grab('webgpu', aa);
      for (let k = 0; k < gl.length; k++) expect(meanDiff(gl[k]!, gpu[k]!), `aa=${aa} frame ${[0, 6, 18, 37][k]}`).toBeLessThan(aa ? 0.5 : 0.2);
    }
  }, 300_000);
});
