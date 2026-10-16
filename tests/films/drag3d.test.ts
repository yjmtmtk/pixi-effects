// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// Dragging an object of a three layer with hit.three.grab, in a real browser: the cube follows the pointer exactly (the grabbed point stays under it).
type Film = { eval: <T>(e: string) => Promise<T> };
const fire = (film: Film, type: string, x: number, y: number) => film.eval(`fire('${type}', ${x}, ${y})`);
const settle = (film: Film, ms = 300) => film.eval(`new Promise(r => setTimeout(r, ${ms}))`);
const under = (film: Film, x: number, y: number) => film.eval<{ name: string; three?: { object: string; point: number[] } } | null>(`(() => { const h = movie.pick(${x}, ${y}); return h && { name: h.name, three: h.three && { object: h.three.object, point: h.three.point } }; })()`);

runFilms('Dragging a three object with hit.three.grab', () => {
  it('the cube follows the pointer along the wall plane: after the drag it is under the pointer, no longer where it was, and the point taken is the point under the pointer', async () => {
    await withFilm('drag3d', async (film) => {
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      const first = await under(film, 240, 135);
      expect(first!.three!.object).toBe('cube');
      const taken = first!.three!.point;                                    // the front face of the cube, z = 30
      await fire(film, 'pointerdown', 240, 135);
      await fire(film, 'pointermove', 280, 120);
      await fire(film, 'pointermove', 330, 90);
      await settle(film);
      const now = await under(film, 330, 90);
      expect(now?.three?.object, 'the cube is under the pointer').toBe('cube');
      expect((await under(film, 240, 135))?.name, 'and not where it was').toBe('bg');
      // the same point of the cube is under the pointer: on the wall plane through the point taken, it has moved by what the pointer did in that plane
      expect(now!.three!.point[2]).toBeCloseTo(taken[2]!, 3);               // the plane: z did not change
      await fire(film, 'pointerup', 330, 90);
      await fire(film, 'pointermove', 400, 200);                            // after the drop, moving the pointer moves nothing
      await settle(film);
      expect((await under(film, 330, 90))?.three?.object).toBe('cube');
      expect((await under(film, 400, 200))?.name).toBe('bg');
    });
  }, 180_000);

  it('only the cube can be taken: a press on the background drags nothing', async () => {
    await withFilm('drag3d', async (film) => {
      await fire(film, 'pointerdown', 20, 20);
      await fire(film, 'pointermove', 200, 100);
      await settle(film);
      expect((await under(film, 240, 135))?.three?.object).toBe('cube');
    });
  }, 120_000);
});
