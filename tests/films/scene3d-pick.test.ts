// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// movie.pick into a scene3d layer: the ray through a canvas point meets the scene's objects (named by their label or their nearest labelled ancestor), as the frame on screen
// shows them; hit.scene3d.grab(plane).move(x, y) drags along a plane through the hit point; check --pick prints what is under a point.
const WEBGL = "Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true })";
const BACKENDS = [['webgpu', undefined], ['webgl', WEBGL]] as const;
const on = <T>(beforeLoad: string | undefined, fn: Parameters<typeof withFilm<T>>[1]) => withFilm<T>('scene3d-pick', fn, beforeLoad ? { beforeLoad } : {});

runFilms('scene3d: pick, hover and drag', () => {
  it('a point on an object names it (its label, or a labelled ancestor\'s); a point on empty space falls through to the 2D layer below', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(beforeLoad, async (film) => {
        await film.eval('movie.snapshot(0, { as: "imageData" })');
        for (const obj of ['red', 'blue', 'mover']) {
          const [x, y] = await film.eval<[number, number]>(`screenOf('${obj}')`);
          const hit = await film.eval<any>(`(() => { const h = movie.pick(${x}, ${y}); return h && { kind: h.kind, path: h.path, object: h.scene3d && h.scene3d.object, d: h.scene3d && h.scene3d.distance, p: h.scene3d && h.scene3d.point }; })()`);
          expect(hit, `${name} ${obj}`).toMatchObject({ kind: 'scene3d', path: 'world', object: obj });
          expect(hit.d, `${name} ${obj} distance`).toBeGreaterThan(3);
        }
        const empty = await film.eval<any>('(() => { const h = movie.pick(240, 20); return h && { kind: h.kind, path: h.path }; })()');
        expect(empty, `${name} empty`).toEqual({ kind: 'flat', path: 'backdrop' });
        expect(await film.eval<string[]>('window.__logs'), name).toEqual([]);
      });
    }
  }, 180_000);

  it('a pick after a seek answers for the frame on screen: the mover is found where it is at that frame, not where it was', async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(beforeLoad, async (film) => {
        await film.eval('movie.snapshot(0, { as: "imageData" })');
        const [x0, y0] = await film.eval<[number, number]>("screenOf('mover')");
        await film.eval('movie.snapshot(80, { as: "imageData" })');
        const [x1, y1] = await film.eval<[number, number]>("screenOf('mover')");
        expect(x1 - x0, name).toBeGreaterThan(40);
        expect(await film.eval<any>(`movie.pick(${x1}, ${y1})?.scene3d?.object`), `${name} where it is now`).toBe('mover');
        expect(await film.eval<any>(`movie.pick(${x0}, ${y0})?.scene3d?.object ?? null`), `${name} where it was`).not.toBe('mover');
      });
    }
  }, 180_000);

  it("grab('floor').move(x, y): the pointer's ray meets the floor through the hit point, and delta is how far that is from it (exact to a thousandth of a unit)", async () => {
    for (const [name, beforeLoad] of BACKENDS) {
      await on(beforeLoad, async (film) => {
        await film.eval('movie.snapshot(0, { as: "imageData" })');
        const r = await film.eval<any>(`(() => {
          const [x, y] = screenOf('red'); const h = movie.pick(x, y); const p = h.scene3d.point;
          const g = h.scene3d.grab('floor'); const to = worldToCanvas([p[0] + 0.5, p[1], p[2] - 0.25]);
          return { p, moved: g.move(to[0], to[1]) };
        })()`);
        expect(r.moved.delta[0], name).toBeCloseTo(0.5, 3);
        expect(r.moved.delta[1], name).toBeCloseTo(0, 3);
        expect(r.moved.delta[2], name).toBeCloseTo(-0.25, 3);
      });
    }
  }, 180_000);

  it('check --pick prints the object under the point: "world (scene3d: red)"', async () => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join, resolve } = await import('node:path');
    const root = resolve(__dirname, '../..');
    const xy = await on(undefined, async (film) => { await film.eval('movie.snapshot(0, { as: "imageData" })'); return film.eval<[number, number]>("screenOf('red')"); });
    const r = await promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/scene3d-pick.html'), '--no-export', '--out', mkdtempSync(join(tmpdir(), 'pick-')), '--at', '0', '--pick', `${Math.round(xy[0])},${Math.round(xy[1])}`], { timeout: 150_000 }).catch((e: any) => e);
    expect(r.stdout).toMatch(/pick .*world \(scene3d: red\)/);
  }, 200_000);
});
