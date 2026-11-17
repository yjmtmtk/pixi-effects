// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// Compressed glTF in loadModel. Meshopt: PixiJS 3D carries its decoder (no network). Draco: its decoder comes from www.gstatic.com the first
// time; when it cannot be fetched, loadModel says so and what to do. KTX2 textures: pixi-effects registers PixiJS's KTX2 loader itself (no
// `import 'pixi.js/ktx2'` on the page) and pins its transcoder to the pixi.js in use (PixiJS's default is the newest one on the CDN).
const on = <T>(query: string, fn: Parameters<typeof withFilm<T>>[1]) => withFilm<T>('scene3d-compressed', fn, { query });

runFilms('scene3d: loadModel with compressed glTF (KTX2, Draco, Meshopt)', () => {
  it('a Meshopt-compressed model loads (the decoder is built in) and is drawn at its size', async () => {
    await on('file=meshopt', async (film) => {
      expect(await film.eval('window.err')).toBe(null);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      const s = await film.eval<{ x: number; y: number; z: number }>('window.model.size()');
      expect([s.x, s.y, s.z].map((v) => +v.toFixed(3))).toEqual([1, 1, 1]);
      expect(await film.eval<number>('drawn()')).toBeGreaterThan(500);
    });
  }, 120_000);

  it('a Draco-compressed model loads (its decoder from gstatic) and is drawn', async () => {
    await on('file=draco', async (film) => {
      expect(await film.eval('window.err')).toBe(null);
      expect(await film.eval<number>('drawn()')).toBeGreaterThan(500);
    });
  }, 120_000);

  it('when the Draco decoder cannot be loaded, loadModel says what happened and what to do', async () => {
    await on('file=draco&decoder=missing', async (film) => {
      const err = await film.eval<string>('window.err');
      expect(err).toMatch(/pixi-effects: loadModel: "Box\.gltf" is compressed with Draco and its decoder could not be loaded/);
      expect(err).toMatch(/setDracoDecoderPath/);
      expect(err).toMatch(/without Draco/);
    });
  }, 120_000);

  it('a model whose only textures are KTX2 loads with no line on the page for it, and the transcoder is pinned to this pixi.js', async () => {
    await on('file=ktx2', async (film) => {
      expect(await film.eval('window.err')).toBe(null);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      expect(await film.eval<number>('drawn()')).toBeGreaterThan(500);
      const ktx = await film.eval<{ jsUrl: string; wasmUrl: string }>('window.ktx');
      expect(ktx.jsUrl).toMatch(/pixi\.js@8\.\d+\.\d+\/transcoders\/ktx\/libktx\.js$/);
      expect(ktx.wasmUrl).toMatch(/pixi\.js@8\.\d+\.\d+\/transcoders\/ktx\/libktx\.wasm$/);
    });
  }, 120_000);
});
