// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// threeGltf and threeFrameCamera in a three layer, in a real browser: the clip is posed by the time, the model is framed, and in the composition's space (followCamera) it sits where its pixels say.
const BACKGROUND = [16, 32, 64, 255];                                   // #102040
const BAND = [242, 193, 78, 255];                                       // #f2c14e, the 2D band under the model (y 156..180)
const bbox = (px: number[], w = 320, h = 156) => {                      // the model's rectangle: what is neither the background nor the band
  let x0 = w, x1 = -1, y0 = h, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * 320 + x) * 4; if (Math.abs(px[i]! - 16) + Math.abs(px[i + 1]! - 32) + Math.abs(px[i + 2]! - 64) > 24) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } }
  return { x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + 1 };
};

runFilms('A glTF model in a three layer (threeGltf, threeFrameCamera)', () => {
  it('own camera, framed by threeFrameCamera: the model is drawn, the corner and the 2D band stay, and the page did not warn', async () => {
    await withFilm('gltf-model', async (film) => {
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      expect(await film.eval<number[]>('pixelAt(6, 160, 70)')).not.toEqual(BACKGROUND);
      expect(await film.eval<number[]>('pixelAt(6, 4, 4)')).toEqual(BACKGROUND);
      expect(await film.eval<number[]>('pixelAt(6, 10, 170)')).toEqual(BAND);
    }, { query: 'mode=own' });
  }, 120_000);

  it('the clip is a function of the time: it turns (0.2 s is not 0), repeats (2.2 s = 0.2 s), and forward, backward and a repeat give one picture per frame', async () => {
    await withFilm('gltf-model', async (film) => {
      const h = async (f: number) => film.eval<string>(`hashOf(${f})`);
      const order = [0, 6, 18, 37];                                     // off the quarter turns: a cube looks the same every 90°
      const forward: string[] = []; for (const f of order) forward.push(await h(f));
      const back: string[] = []; for (const f of [...order].reverse()) back.push(await h(f));
      expect(back.reverse()).toEqual(forward);
      expect(new Set(forward).size, 'the box really turns').toBe(order.length);
      expect(await h(66), '2.2 s equals 0.2 s').toBe(forward[1]);
      expect(await h(6)).toBe(forward[1]);
    }, { query: 'mode=own' });
  }, 120_000);

  it("in the composition's space: fit(100) puts the model's longest side at 100 px at the middle (the front face is nearer, so about 125 px on screen), and the camera moving 80 px sideways slides it the other way by the parallax of its depth", async () => {
    await withFilm('gltf-model', async (film) => {
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      const first = bbox(await film.eval<number[]>('framePixels(0)'));
      expect(first.w, 'width at frame 0').toBeGreaterThan(115); expect(first.w).toBeLessThan(135);
      expect(first.cx, 'x of the middle').toBeGreaterThan(157); expect(first.cx).toBeLessThan(163);
      expect(first.cy, 'y of the middle').toBeGreaterThan(87); expect(first.cy).toBeLessThan(93);
      const last = bbox(await film.eval<number[]>('framePixels(89)'));           // t = 2.97 s: the camera is at x = 239
      // the camera moved 79 px: the centre of the cube (247 px away) slides 79 px, its nearest face (197 px away) 99 px: the rectangle of the whole cube slides in between (measured 92)
      expect(first.cx - last.cx, 'the model slid left, by what the parallax of its depth says').toBeGreaterThan(79); expect(first.cx - last.cx).toBeLessThan(99);
    }, { query: 'mode=space' });
  }, 120_000);

  it("works with renderer: 'webgpu': the same picture within the bounds of the two renderers (antialias edges only)", async () => {
    const grab = (q: string) => withFilm('gltf-model', async (film) => { const out: number[][] = []; for (const f of [6, 37]) out.push(await film.eval<number[]>(`framePixels(${f})`)); return out; }, { query: q });
    for (const mode of ['own', 'space']) {
      const gl = await grab(`mode=${mode}`), gpu = await grab(`mode=${mode}&renderer=webgpu`);
      for (let k = 0; k < gl.length; k++) {
        let sum = 0, big = 0, n = 0;
        for (let i = 0; i < gl[k]!.length; i++) { if (i % 4 === 3) continue; const d = Math.abs(gl[k]![i]! - gpu[k]![i]!); sum += d; n++; if (d > 32) big++; }
        expect(sum / n, `${mode} frame ${k} mean`).toBeLessThan(0.6);
        expect(big, `${mode} frame ${k} channels off by more than 32`).toBeLessThan(500);
      }
    }
  }, 240_000);
});
