// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// loadModel and a model's colourways (glTF KHR_materials_variants): list them, pick one at load, switch at any time (a click, or from the time,
// as a function of it), back to the file's own colours with null. A part with no colourways keeps its own material. A wrong name says the right ones.
const on = <T>(query: string, fn: Parameters<typeof withFilm<T>>[1]) => withFilm<T>('scene3d-variants', fn, { query });
const blue = (c: number[]) => c[2]! > c[0]! + 40 && c[2]! > c[1]!;
const orange = (c: number[]) => c[0]! > c[2]! + 60 && c[0]! > c[1]!;
const green = (c: number[]) => c[1]! > c[0]! + 40 && c[1]! > c[2]!;
const grey = (c: number[]) => Math.max(...c) - Math.min(...c) < 25;

runFilms('scene3d: loadModel colourways (KHR_materials_variants)', () => {
  it('lists the colourways of a .gltf and of a .glb; none is chosen until asked (the file\'s own colours)', async () => {
    for (const file of ['gltf', 'glb']) {
      await on(`file=${file}`, async (film) => {
        expect(await film.eval<string[]>('window.__logs')).toEqual([]);
        expect(await film.eval('({ variants: window.model.variants, variant: window.model.variant })')).toEqual({ variants: ['orange', 'blue', 'green'], variant: null });
        expect(orange(await film.eval<number[]>('boxColour(10)')), file).toBe(true);
      });
    }
  }, 120_000);

  it('variant at load: the box takes that colourway, the base (no colourways) keeps its grey', async () => {
    await on('file=glb&variant=blue', async (film) => {
      expect(await film.eval('window.model.variant')).toBe('blue');
      expect(blue(await film.eval<number[]>('boxColour(10)'))).toBe(true);
      expect(grey(await film.eval<number[]>('baseColour(10)'))).toBe(true);
    });
  }, 120_000);

  it('setVariant switches at any time and null goes back to the file\'s own colours', async () => {
    await on('file=gltf', async (film) => {
      await film.eval(`window.model.setVariant('green')`);
      expect(green(await film.eval<number[]>('boxColour(10)'))).toBe(true);
      expect(await film.eval('window.model.variant')).toBe('green');
      await film.eval(`window.model.setVariant(null)`);
      expect(orange(await film.eval<number[]>('boxColour(10)'))).toBe(true);
      expect(await film.eval('window.model.variant')).toBe(null);
    });
  }, 120_000);

  it('a colourway chosen from the time is a function of it: forward, by jumps and backward agree', async () => {
    await on('file=gltf&timed=1', async (film) => {
      const h = (f: number) => film.eval<string>(`hashOf(${f})`);
      const fwd = [await h(5), await h(40)];
      expect(fwd[0]).not.toBe(fwd[1]);
      expect([await h(40), await h(5)].reverse()).toEqual(fwd);
      expect(orange(await film.eval<number[]>('boxColour(5)'))).toBe(true);
      expect(blue(await film.eval<number[]>('boxColour(40)'))).toBe(true);
    });
  }, 120_000);

  it('the model\'s own material overrides are honoured: a colourway is resolved through model.materials when it is shown, and forward and backward agree', async () => {
    await on('file=gltf&timed=1&override=1&variant=blue', async (film) => {
      const h = (f: number) => film.eval<string>(`hashOf(${f})`);
      const first = await h(5);
      await h(60);
      expect(await h(5)).toBe(first);
      expect(orange(await film.eval<number[]>('boxColour(5)'))).toBe(true);
      expect(blue(await film.eval<number[]>('boxColour(40)'))).toBe(true);
      expect(await film.eval(`(() => { const box = window.model.model.getChildByLabel('box', true); return box.material === window.model.model.materials[1]; })()`)).toBe(true);
    });
  }, 120_000);

  it('a model loaded by an Assets alias still lists its colourways (the file is found as Assets found it)', async () => {
    await on('alias=1', async (film) => {
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      expect(await film.eval('window.model.variants')).toEqual(['orange', 'blue', 'green']);
    });
  }, 120_000);

  it('a name that is not there says which there are (at load and in setVariant); a model with none says so', async () => {
    await on('file=gltf&bad=load', async (film) => {
      expect(await film.eval<string>('window.err')).toMatch(/loadModel: the model has no colourway "red" \(its colourways: "orange", "blue", "green"\)/);
    });
    await on('file=gltf&bad=set', async (film) => {
      expect(await film.eval<string>('window.err')).toMatch(/setVariant: the model has no colourway "gren" \(its colourways: "orange", "blue", "green"\); did you mean "green"\?/);
    });
    await on('file=plain&bad=set', async (film) => {
      expect(await film.eval('window.model.variants')).toEqual([]);
      expect(await film.eval<string>('window.err')).toMatch(/setVariant: the model has no colourways \(its file has no KHR_materials_variants\)/);
    });
  }, 180_000);
});
