// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// movie.pick in a real browser: flat layers by their own shape, a threeD card by its projected quad, a three layer by a ray through its camera; the canvas shown at twice its size.
type Hit = { name?: string; kind: string; local?: { x: number; y: number }; three?: { object: string; distance: number } } | null;
const at = (film: { eval: <T>(e: string) => Promise<T> }, frame: number, x: number, y: number, opts = 'undefined') => film.eval<Hit>(`pickAt(${frame}, ${x}, ${y}, ${opts})`);

runFilms('movie.pick: what is under a point of the canvas', () => {
  it('a rotated bar is hit by its own shape, a round dot by its circle, text by its box; the background is what is under the rest', async () => {
    await withFilm('pick', async (film) => {
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      // the bar: 120 x 20 turned 45° about (100, 60) (anchor in the middle)
      expect((await at(film, 0, 100, 60))?.name).toBe('button');
      expect((await at(film, 0, 100 + 40, 60 + 40))?.name, 'along the bar').toBe('button');
      expect((await at(film, 0, 100 + 40, 60 - 40))?.name, 'inside the box around the bar, off the bar').toBe('bg');
      // the dot: radius 30 at (380, 60)
      expect((await at(film, 0, 380, 60))?.name).toBe('dot');
      expect((await at(film, 0, 380 + 25, 60 + 25))?.name, 'the corner of its box is outside the circle (35 px from the middle)').toBe('bg');
      expect((await at(film, 0, 380 + 20, 60 + 20))?.name, 'inside the circle (28 px)').toBe('dot');
      // the title
      expect((await at(film, 0, 240, 240))?.name).toBe('title');
      const hit = await at(film, 0, 100, 60);
      expect(hit!.kind).toBe('flat');
      expect(hit!.local!.x).toBeGreaterThan(0);
    });
  }, 120_000);

  it('a threeD card is hit by its projected quad (turned 40°: the box around it has corners that are not the card), a three layer by a ray: the object is named, with its distance', async () => {
    await withFilm('pick', async (film) => {
      const card = await at(film, 0, 150, 150);
      expect(card).toMatchObject({ name: 'card', kind: 'card' });
      // the card is 100 x 60 turned about y: narrower on screen than 100 px, so 48 px to the right of the middle is off it, inside the box of a flat 100 px card
      expect((await at(film, 0, 150 + 48, 150))?.name).toBe('bg');
      const cube = await at(film, 0, 330, 170);
      expect(cube).toMatchObject({ name: 'world', kind: 'three' });
      expect(cube!.three!.object).toBe('cube');
      expect(cube!.three!.distance).toBeGreaterThan(0);
      expect((await at(film, 0, 330 + 60, 170))?.name, 'beside the cube the three layer has nothing: the layer below is hit').toBe('bg');
    });
  }, 120_000);

  it("the camera glides sideways, and what is under a point follows it: the cube leaves the point, the card too; going back gives the answer it gave before (a function of the frame)", async () => {
    await withFilm('pick', async (film) => {
      const first = [await at(film, 0, 330, 170), await at(film, 0, 150, 150)];
      expect([first[0]?.name, first[1]?.name]).toEqual(['world', 'card']);
      const later = [await at(film, 80, 330, 170), await at(film, 80, 150, 150)];
      expect([later[0]?.name, later[1]?.name], 'the camera moved 160 px: both are somewhere else').toEqual(['bg', 'bg']);
      const again = [await at(film, 0, 330, 170), await at(film, 0, 150, 150)];
      expect(again).toEqual(first);
    });
  }, 120_000);

  it('pickAll lists what is under a point, the top first; only / ignore choose', async () => {
    await withFilm('pick', async (film) => {
      const all = await film.eval<Array<{ name: string }>>('pickAllAt(0, 100, 60)');
      expect(all.map((h) => h.name)).toEqual(['button', 'bg']);
      expect((await at(film, 0, 100, 60, "{ ignore: ['button'] }"))?.name).toBe('bg');
      expect((await at(film, 0, 100, 60, "{ only: ['dot'] }"))).toBeNull();
    });
  }, 120_000);

  it('canvasPoint turns a pointer event into canvas pixels when the canvas is shown at twice its size', async () => {
    await withFilm('pick', async (film) => {
      const p = await film.eval<[number, number]>('canvasPointOf(clientPointFor(380, 60))');
      expect(p[0]).toBeCloseTo(380, 6); expect(p[1]).toBeCloseTo(60, 6);
      expect((await film.eval<{ name: string }>(`(async () => { await movie.snapshot(0, { as: 'imageData' }); return movie.pick(...canvasPointOf(clientPointFor(380, 60))); })()`)).name).toBe('dot');
    });
  }, 120_000);
});
