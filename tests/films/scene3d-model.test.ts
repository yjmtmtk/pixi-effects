// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// loadModel: load a glTF, name its clips, measure it, fit it to a size, pose its clip from t (a function of the time). fitCamera: the whole model in the picture.
const on = <T>(query: string, fn: Parameters<typeof withFilm<T>>[1]) => withFilm<T>('scene3d-model', fn, { query });

runFilms('scene3d: loadModel and fitCamera', () => {
  it('names the clips and measures the model; fit(n) makes the longest side n', async () => {
    await on('file=long&fit=3', async (film) => {
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      const r = await film.eval<any>('({ clips: window.model.clips, size: window.model.size() })');
      expect(Array.isArray(r.clips)).toBe(true);
      expect(Math.max(r.size.x, r.size.y, r.size.z)).toBeCloseTo(3, 4);
    });
    await on('animation=Spin', async (film) => {
      expect(await film.eval<string[]>('window.model.clips')).toEqual(['Spin']);
    });
  }, 120_000);

  it('pose(t) is a function of the time: forward, backward and a repeat agree, and the clip moves the model; animation: false holds the bind pose', async () => {
    await on('animation=Spin', async (film) => {
      const h = (f: number) => film.eval<string>(`hashOf(${f})`);
      const fwd = [await h(5), await h(14), await h(23)];                     // (frames whose turns are not mirror images of each other: a cube looks the same at 120 and 240 degrees)
      expect([await h(23), await h(14), await h(5)].reverse()).toEqual(fwd);
      expect(new Set(fwd).size).toBe(3);
    });
    await on('animation=false', async (film) => {
      expect(await film.eval<string>('hashOf(5)')).toBe(await film.eval<string>('hashOf(40)'));
    });
  }, 120_000);

  it('speed, offset and loop: the clip time is t x speed + offset; loop: false holds the last pose', async () => {
    const at = (q: string, f: number) => on(q, (film) => film.eval<string>(`hashOf(${f})`));
    expect(await at('animation=Spin&speed=2', 15)).toBe(await at('animation=Spin', 30));                 // 0.5 s at speed 2 = 1 s
    expect(await at('animation=Spin&offset=0.5', 15)).toBe(await at('animation=Spin', 30));              // 0.5 s + 0.5 = 1 s
    expect(await at('animation=Spin&loop=0', 80)).toBe(await at('animation=Spin&loop=0', 89));           // past the clip's 2 s: held
  }, 300_000);

  it('fitCamera puts the whole model in the picture, filling it (a long model and a three-quarter view)', async () => {
    for (const q of ['file=long', 'file=long&dir=0,0,1', 'file=spin&margin=1.5']) {
      await on(q, async (film) => {
        const pts = await film.eval<Array<[number, number] | null>>('corners()');
        expect(pts.every((p) => p !== null), q).toBe(true);
        const xs = pts.map((p) => p![0]), ys = pts.map((p) => p![1]);
        expect(Math.min(...xs), q).toBeGreaterThanOrEqual(-0.5); expect(Math.max(...xs), q).toBeLessThanOrEqual(320.5);
        expect(Math.min(...ys), q).toBeGreaterThanOrEqual(-0.5); expect(Math.max(...ys), q).toBeLessThanOrEqual(180.5);
        // as large as fits: the farthest corner reaches the edge less the margin (1 / 1.1 = 0.91 of the way from the centre; a long box at a slant is lopsided, so its span can be smaller)
        const reach = Math.max(...pts.map((p) => Math.max(Math.abs(p![0] - 160) / 160, Math.abs(p![1] - 90) / 90)));
        expect(reach, `${q}: how far the farthest corner reaches toward the edge`).toBeGreaterThan(q.includes('margin=1.5') ? 0.6 : 0.85);
      });
    }
  }, 300_000);

  it('a clip name that is not there says which clips there are', async () => {
    await on('animation=Run', async (film) => {
      expect((await film.eval<string[]>('window.__logs')).join('\n')).toMatch(/loadModel: the model has no clip "Run" \(its clips: "Spin"\)/);
    });
  }, 120_000);
});
