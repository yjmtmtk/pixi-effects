// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// A `three` layer that lives in the composition's space (followCamera, followLights) against the composition's own cards (threeD shapes): the same camera, the same lights, two ways
// of drawing three flat squares. The measured numbers are in each title; the bounds are about three times them.
const FRAMES = [0, 20, 45, 70, 89];
const frames = (query: string, frames = FRAMES) => withFilm('three-space', async (film) => {
  expect(await film.eval<string>('JSON.stringify(window.__logs)'), `${query}: the page warned`).toBe('[]');
  const out: number[][] = [];
  for (const f of frames) out.push(await film.eval<number[]>(`framePixels(${f})`));
  return out;
}, { query });
const diff = (a: number[], b: number[]) => {
  let sum = 0, big = 0, n = 0;
  for (let i = 0; i < a.length; i++) { if (i % 4 === 3) continue; const d = Math.abs(a[i]! - b[i]!); sum += d; n++; if (d > 32) big++; }
  return { mean: sum / n, big };
};
const worst = (a: number[][], b: number[][]) => a.map((x, k) => diff(x, b[k]!)).reduce((w, d) => ({ mean: Math.max(w.mean, d.mean), big: Math.max(w.big, d.big) }), { mean: 0, big: 0 });

runFilms('Three layer in the composition\'s space: the same camera and lights as the cards', () => {
  it('followCamera: three squares seen by a camera that moves and changes its fov land where the cards land (measured mean 0.14–0.19 of 255, up to 912 channel values off by more than 32 along the edges)', async () => {
    const card = await frames('mode=board&lights=none'), three = await frames('mode=three&lights=none');
    const w = worst(card, three);
    expect(w.mean).toBeLessThan(0.5);
    expect(w.big).toBeLessThan(2500);
    expect(card[2]!.some((v, i) => i % 4 === 0 && v !== 16), 'the squares are really drawn (not just the background)').toBe(true);
  }, 120_000);

  for (const kind of ['ambient', 'point', 'parallel', 'spot']) {
    it(`followLights, ${kind}: Lambert planes in colour-management-off shade like the cards (measured: ambient 0.02–0.04, point 0.16–0.20, parallel 0.11–0.14, spot 0.14–0.16 of 255)`, async () => {
      const card = await frames(`mode=board&lights=${kind}&cm=0`), three = await frames(`mode=three&lights=${kind}&cm=0`);
      const w = worst(card, three);
      expect(w.mean, kind).toBeLessThan(kind === 'ambient' ? 0.1 : 0.5);
      expect(w.big, kind).toBeLessThan(kind === 'ambient' ? 20 : 2500);
    }, 120_000);
  }

  it('with three\'s default colour management the lights are close but not the same (measured mean 0.77–1.35 of 255): that is the price of three\'s linear light, not a mistake', async () => {
    const card = await frames('mode=board&lights=point'), three = await frames('mode=three&lights=point');
    const w = worst(card, three);
    expect(w.mean).toBeLessThan(3);
    expect(w.mean, 'if this ever drops under 0.4 the default pipeline matches the cards: say so in docs/dsl.md').toBeGreaterThan(0.4);
  }, 120_000);

  it('a light that only lives from 1 s to 2 s lights the layer exactly then (the frames before and after match the cards; the lit frame is not the unlit one)', async () => {
    const at = [15, 45, 75];
    const card = await frames('mode=board&lamp=late&cm=0', at), three = await frames('mode=three&lamp=late&cm=0', at);
    expect(worst(card, three).mean).toBeLessThan(0.5);
    const unlit = await frames('mode=three&lights=none&cm=0', [45]);
    expect(diff(three[1]!, unlit[0]!).mean, 'the lamp changes the picture while it lives').toBeGreaterThan(1);
  }, 120_000);

  it('is a function of the time: forward, backward and a repeat give one picture per frame, also across the moments a light begins and ends', async () => {
    await withFilm('three-space', async (film) => {
      const h = async (f: number) => film.eval<string>(`hashOf(${f})`);
      const order = [0, 15, 45, 75, 89];
      const forward: string[] = []; for (const f of order) forward.push(await h(f));
      const back: string[] = []; for (const f of [...order].reverse()) back.push(await h(f));
      expect(back.reverse()).toEqual(forward);
      expect(await h(45)).toBe(forward[2]);
      expect(new Set(forward).size, 'the camera moves: every frame is its own picture').toBe(order.length);
    }, { query: 'mode=three&lamp=late&cm=0' });
  }, 120_000);

  it("works with renderer: 'webgpu' too (really WebGPU; the same squares and the same light within the same bounds)", async () => {
    const info = await withFilm('three-space', (film) => film.eval<string>('movie.inspect(0).then(r => JSON.stringify(r.layers.find(l => l.name === "scene3d")))'), { query: 'mode=three&lights=point&cm=0&renderer=webgpu' });
    expect(JSON.parse(info).renderer).toBe('webgpu');
    const card = await frames('mode=board&lights=point&cm=0'), gpu = await frames('mode=three&lights=point&cm=0&renderer=webgpu');
    const w = worst(card, gpu);
    expect(w.mean).toBeLessThan(0.5);
    expect(w.big).toBeLessThan(2500);
  }, 180_000);
});
