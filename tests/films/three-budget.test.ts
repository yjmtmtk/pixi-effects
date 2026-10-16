// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// A page with more three layers than a browser keeps contexts for: measured 2026-10-15 on Chrome, about 16 WebGL contexts and about 32 WebGPU ones; the rest draw nothing, without an error.
const logsOf = (query: string) => withFilm('three-budget', async (film) => {
  await film.eval('movie.snapshot(0, { as: "dataURL" })');                                  // a frame: any lost context has been reported by now
  return JSON.parse(await film.eval<string>('JSON.stringify(window.__logs)')) as string[];
}, { query, readySeconds: 120 });

runFilms('A page with too many three layers says so (it does not go blank in silence)', () => {
  it('12 WebGL three layers: no warning at all', async () => {
    expect((await logsOf('n=12')).filter((l) => /context|three layers are alive/.test(l))).toEqual([]);
  }, 180_000);

  it("rebuilding a page that has a three layer (setVars, resize, rebuild) does not say the browser took its context: the layer let it go itself", async () => {
    await withFilm('three-budget', async (film) => {
      await film.eval('movie.rebuild()');                                                // the old layer is destroyed (forceContextLoss) and a new one built
      await film.eval('new Promise(r => setTimeout(r, 600))');                           // the browser's loss event arrives a moment after
      await film.eval('movie.rebuild()');
      await film.eval('new Promise(r => setTimeout(r, 600))');
      const logs = JSON.parse(await film.eval<string>('JSON.stringify(window.__logs)')) as string[];
      expect(logs.filter((l) => /took this layer's WebGL context away|three layers are alive/.test(l))).toEqual([]);
    }, { query: 'n=2' });
  }, 120_000);

  it('20 WebGL three layers: a warning at the 13th with the numbers and the way out, and every layer the browser took the context from names itself', async () => {
    const logs = await logsOf('n=20');
    const budget = logs.filter((l) => /three layers are alive/.test(l));
    expect(budget).toHaveLength(1);
    expect(budget[0]).toMatch(/13 three layers/);
    const lost = logs.filter((l) => /took this layer's WebGL context away/.test(l));
    expect(lost.length, 'Chrome takes the oldest contexts when the page asks for more than it keeps: at least one layer says so').toBeGreaterThan(0);
    expect(lost[0]).toMatch(/"box\d+"/);
  }, 180_000);

  it("60 webgpu three layers that share Pixi's GPU device: no budget warning, no lost layer, and every one of them draws (the context cap of about 32 does not apply)", async () => {
    await withFilm('three-budget', async (film) => {
      const picture = await film.eval<number[]>('movie.snapshot(0, { as: "imageData" }).then(i => Array.from(i.data))');
      const logs = JSON.parse(await film.eval<string>('JSON.stringify(window.__logs)')) as string[];
      expect(logs.filter((l) => /three layers are alive|context/.test(l))).toEqual([]);
      const layers = await film.eval<Array<{ sharedGpu?: boolean }>>('movie.inspect(0).then(r => r.layers)');
      expect(layers.filter((l) => l.sharedGpu).length, 'they really share').toBe(60);
      // each layer is 40 x 40 at (20 + 40 i, 20 + 40 j); count the orange pixels in its cell
      let drawn = 0;
      for (let i = 0; i < 60; i++) {
        const x0 = (i % 15) * 40, y0 = Math.floor(i / 15) * 40;
        let orange = 0;
        for (let y = y0; y < y0 + 40; y += 2) for (let x = x0; x < x0 + 40; x += 2) { const k = (y * 600 + x) * 4; if (picture[k]! > 200 && picture[k + 2]! < 80) orange++; }
        if (orange > 10) drawn++;
      }
      expect(drawn, 'layers whose cell holds the orange box').toBe(60);
    }, { query: 'n=60&renderer=webgpu', readySeconds: 120 });
  }, 240_000);

  it("without sharing (`shareGpu: false`) 60 webgpu layers still hit the budget warning as before", async () => {
    const logs = await logsOf('n=40&renderer=webgpu&share=0');
    expect(logs.filter((l) => /three layers are alive/.test(l))).toHaveLength(1);
  }, 240_000);
});
