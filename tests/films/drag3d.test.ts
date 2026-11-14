// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';
import { cameraBasis, homeCamera, projectPoint } from '../../src/space/math';

// Dragging an object of a scene3d layer (followCamera) with hit.scene3d.grab, in a real browser: the cube follows the pointer exactly (the grabbed point stays under it);
// movie.project names where an object of the scene is on the canvas, as the composition's own projection puts that point.
type Film = { eval: <T>(e: string) => Promise<T> };
type Pos = { x: number; y: number; z: number };
const fire = (film: Film, type: string, x: number, y: number) => film.eval(`fire('${type}', ${x}, ${y})`);
const settle = (film: Film, ms = 300) => film.eval(`new Promise(r => setTimeout(r, ${ms}))`);
const under = (film: Film, x: number, y: number) => film.eval<{ name: string; kind: string; scene3d?: { object: string; point: number[] } } | null>(`(() => { const h = movie.pick(${x}, ${y}); return h && { name: h.name, kind: h.kind, scene3d: h.scene3d && { object: h.scene3d.object, point: h.scene3d.point } }; })()`);
const posOf = (film: Film) => film.eval<Pos>('JSON.parse(JSON.stringify(window.__pos))');
// the first canvas point (a 4 px grid, scanned in the page) where the pick names the cube
const findCube = (film: Film) => film.eval<[number, number] | null>(`(() => { for (let y = 100; y < 270; y += 4) for (let x = 100; x < 400; x += 4) if (movie.pick(x, y)?.scene3d?.object === 'cube') return [x, y]; return null; })()`);
// where the composition's own camera puts a composition point (x, y down, z) on the canvas
const FLOOR_CAMERA = { x: 240, y: 20, z: 450, lookAtX: 240, lookAtY: 170, lookAtZ: 0, fov: 40 };
const composition = (cam: typeof FLOOR_CAMERA, p: Pos) => projectPoint(cameraBasis(cam, 480, 270), p);

runFilms('Dragging a scene3d object with hit.scene3d.grab', () => {
  it('the cube follows the pointer along the wall plane: after the drag it is under the pointer, no longer where it was, its z did not change, and the point taken is the point under the pointer', async () => {
    await withFilm('drag3d', async (film) => {
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      const first = await under(film, 240, 135);
      expect(first).toMatchObject({ name: 'world', kind: 'scene3d', scene3d: { object: 'cube' } });
      const taken = first!.scene3d!.point;                                  // the front face of the cube, z = 30
      expect(taken[2]).toBeCloseTo(30, 3);
      await fire(film, 'pointerdown', 240, 135);
      await fire(film, 'pointermove', 280, 120);
      await fire(film, 'pointermove', 330, 90);
      await settle(film);
      const pos = await posOf(film);
      expect(pos.z, "the 'wall' plane: z did not change").toBeCloseTo(0, 3);
      expect(pos.x, 'it moved right').toBeGreaterThan(300);
      expect(pos.y, 'and up (y up in the scene)').toBeGreaterThan(-100);
      const now = await under(film, 330, 90);
      expect(now?.scene3d?.object, 'the cube is under the pointer').toBe('cube');
      expect((await under(film, 240, 135))?.name, 'and not where it was').toBe('bg');
      // the same point of the cube is under the pointer: the point now under it is the point taken, moved as the cube moved
      for (const i of [0, 1, 2] as const) expect(now!.scene3d!.point[i]! - taken[i]!, `axis ${i}`).toBeCloseTo([pos.x - 240, pos.y + 135, pos.z][i]!, 1);
      await fire(film, 'pointerup', 330, 90);
      await fire(film, 'pointermove', 400, 200);                            // after the drop, moving the pointer moves nothing
      await settle(film);
      expect(await posOf(film), 'nothing moves after the drop').toEqual(pos);
      expect((await under(film, 330, 90))?.scene3d?.object).toBe('cube');
      expect((await under(film, 400, 200))?.name).toBe('bg');
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
    });
  }, 180_000);

  it("grab('floor') slides on a floor seen in perspective: its height does not change, it follows the pointer, and a pointer above the horizon moves nothing", async () => {
    await withFilm('drag3d', async (film) => {
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      expect((await under(film, 240, 260))?.scene3d?.object, 'the floor is a hit too, with its own name').toBe('floor');
      const at = await findCube(film);
      expect(at, 'the cube is on screen').not.toBeNull();
      const [x0, y0] = at!;
      await fire(film, 'pointerdown', x0, y0);
      await fire(film, 'pointermove', x0 + 60, y0 + 30); await fire(film, 'pointermove', x0 + 90, y0 + 40);
      await settle(film);
      const now = await under(film, x0 + 90, y0 + 40);
      expect(now?.scene3d?.object, 'the cube is under the pointer after the drag').toBe('cube');
      expect((await under(film, x0, y0))?.scene3d?.object, 'and not where it was').not.toBe('cube');
      const pos = await posOf(film);
      expect(pos.y, 'it did not float up or sink: y is the floor').toBeCloseTo(-170, 3);
      expect(pos.x, 'it moved along the floor (x)').toBeGreaterThan(260);
      expect(pos.z, 'and nearer the camera (z), the pointer having gone down the picture').toBeGreaterThan(-40);
      await fire(film, 'pointermove', x0 + 90, 2);                          // far above: the ray goes over the horizon and never meets the floor
      await settle(film);
      expect(await posOf(film), 'a ray that misses the floor leaves the cube where it was').toEqual(pos);
      await fire(film, 'pointerup', x0 + 90, 2);
    }, { query: 'floor=1' });
  }, 180_000);

  it('only the cube can be taken: a press on the background (or on the floor) drags nothing', async () => {
    await withFilm('drag3d', async (film) => {
      const before = await posOf(film);
      await fire(film, 'pointerdown', 20, 20);
      await fire(film, 'pointermove', 200, 100);
      await settle(film);
      expect(await posOf(film)).toEqual(before);
      expect((await under(film, 240, 135))?.scene3d?.object).toBe('cube');
      await fire(film, 'pointerup', 200, 100);
    });
    await withFilm('drag3d', async (film) => {
      const before = await posOf(film);
      await fire(film, 'pointerdown', 240, 260);                            // the floor: a scene3d hit, but not the cube
      await fire(film, 'pointermove', 100, 200);
      await settle(film);
      expect(await posOf(film)).toEqual(before);
      await fire(film, 'pointerup', 100, 200);
    }, { query: 'floor=1' });
  }, 180_000);
});

runFilms('movie.project into a scene3d layer', () => {
  it('names where an object of a scene3d layer is on the canvas, as the composition\'s camera projects it: (240, -135, 0) under the default camera is (240, 135), a dragged cube where it went, a cube under a camera above the floor where that camera puts it; a name nobody has throws', async () => {
    await withFilm('drag3d', async (film) => {
      const p = await film.eval<{ x: number; y: number } | null>('movie.project("world/cube")');
      expect(p).not.toBeNull();
      expect(Math.abs(p!.x - 240)).toBeLessThan(0.5);
      expect(Math.abs(p!.y - 135)).toBeLessThan(0.5);
      await fire(film, 'pointerdown', 240, 135);
      await fire(film, 'pointermove', 330, 90);
      await settle(film);
      await fire(film, 'pointerup', 330, 90);
      const pos = await posOf(film);
      const q = await film.eval<{ x: number; y: number }>('movie.project("world/cube")');
      const want = composition(homeCamera(480, 270), { x: pos.x, y: -pos.y, z: pos.z });
      expect(Math.abs(q.x - 240), 'it moved').toBeGreaterThan(50);
      expect(Math.abs(q.x - want.x)).toBeLessThan(0.5);
      expect(Math.abs(q.y - want.y)).toBeLessThan(0.5);
      expect(await film.eval('(() => { try { movie.project("world/cub"); return null } catch (e) { return e.message } })()')).toMatch(/no object "cub" \(did you mean "cube"\?\)/);
    });
    await withFilm('drag3d', async (film) => {
      const p = await film.eval<{ x: number; y: number }>('movie.project("world/cube")');
      const want = composition(FLOOR_CAMERA, { x: 240, y: 170, z: -60 });
      expect(Math.abs(p.x - want.x)).toBeLessThan(0.5);
      expect(Math.abs(p.y - want.y)).toBeLessThan(0.5);
      expect(Math.abs(p.y - 135), 'not where the default camera would put it').toBeGreaterThan(5);
    }, { query: 'floor=1' });
  }, 180_000);
});
