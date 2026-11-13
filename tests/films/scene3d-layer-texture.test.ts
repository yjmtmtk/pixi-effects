// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// layerTexture: a 2D layer (a composition) shown on a mesh of a scene3d layer. The layer stays a layer of the movie: drawn into a texture by the movie's own frame, not by a ticker.
const WEBGL = "Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })";
const BACKENDS = [['webgpu', undefined], ['webgl', WEBGL]] as const;
const mean = (a: number[], b: number[]) => { let s = 0, n = 0; for (let i = 0; i < a.length; i++) { if (i % 4 === 3) continue; s += Math.abs(a[i]! - b[i]!); n++; } return s / n; };

runFilms('scene3d: a 2D layer on a mesh (layerTexture)', () => {
  it('a face-on plane shows the 2D layer as it is drawn flat: the same colours, upright (mean under 3 of 255), at two frames', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      const grab = (q: string) => withFilm('scene3d-layer-texture', async (f) => ({ logs: await f.eval<string[]>('window.__logs'), px: [await f.eval<number[]>('framePixels(15)'), await f.eval<number[]>('framePixels(75)')] }), { query: q, ...(beforeLoad ? { beforeLoad } : {}) });
      const flat = await grab('flat=1'), mesh = await grab('');
      expect(mesh.logs, name).toEqual([]);
      for (let k = 0; k < 2; k++) {
        const m = mean(flat.px[k]!, mesh.px[k]!);
        console.log(`scene3d layerTexture ${name} frame ${[15, 75][k]}: mean ${m.toFixed(3)}`);
        expect(m, `${name} frame ${[15, 75][k]}`).toBeLessThan(3);
      }
    }
  }, 300_000);

  it('the 2D layer animates with the movie in an EXPORT (the count differs between two frames of the file), not with a ticker', async () => {
    await withFilm('scene3d-layer-texture', async (film) => {
      const [a, b] = await film.eval<number[][]>('exportPixels([0, 2], [0.5, 1.5])');
      expect(mean(a!, b!)).toBeGreaterThan(0.5);
    });
  }, 180_000);

  it('a pick on the screen names the 2D layer under the point (top half: "top", bottom half: "bottom"), through the scene3d layer', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await withFilm('scene3d-layer-texture', async (film) => {
        await film.eval('movie.snapshot(30, { as: "imageData" })');
        const top = await film.eval<any>('(() => { const h = movie.pick(30, 20); return h && { path: h.path, via: h.via }; })()');
        const bottom = await film.eval<any>('(() => { const h = movie.pick(30, 115); return h && { path: h.path, via: h.via }; })()');
        expect(top, name).toMatchObject({ path: 'screen/top', via: { path: 'tv', object: 'panel' } });
        expect(bottom, name).toMatchObject({ path: 'screen/bottom', via: { path: 'tv', object: 'panel' } });
      }, beforeLoad ? { beforeLoad } : {});
    }
  }, 180_000);

  it('a name that is not there says which layers are (and that the 2D layer must come before the scene3d layer)', async () => {
    await withFilm('scene3d-layer-texture', async (film) => {
      expect((await film.eval<string[]>('window.__logs')).join('\n')).toMatch(/layerTexture: no layer named "screne" before this scene3d layer \(the layers built before it: "screen"\)/);
    }, { query: 'bad=1' });
  }, 120_000);
});
