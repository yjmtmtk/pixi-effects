// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// `follow: '<layer>/<object>'` carries a 2D layer to where an object of a scene (or another layer) is on screen, every frame; its own x / y are an offset
// from there. `movie.project(target)` says where that is. A trial (2026-11-14): two agents labelling orbiting planets wrote the camera projection by hand.
type P = [number, number];
const on = <T>(fn: Parameters<typeof withFilm<T>>[1], query?: string) => withFilm<T>('follow', fn, query ? { query } : {});
const close = (a: P | null, b: P | null, tol = 1.01) => !!a && !!b && Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;

runFilms('follow: a layer that stays next to an object of a scene', () => {
  it('lands on a scene3d object, a scene2d object, a plain layer and a layer in a nested composition, at several frames, and equals movie.project', async () => {
    await on(async (film) => {
      expect(await film.eval('window.__error ?? null')).toBeNull();
      for (const frame of [0, 30, 60, 89]) {
        await film.eval(`movie.gotoFrame(${frame}, true)`);
        const t = frame / 30;
        const at = (name: string) => film.eval<P | null>(`centreOf(${JSON.stringify(name)})`);
        const project = (target: string) => film.eval<{ x: number; y: number } | null>(`movie.project(${JSON.stringify(target)})`).then((p) => (p ? [p.x, p.y] as P : null));
        // scene3d: the view's own projection of the group's origin (computed here independently of the library)
        const mover = await film.eval<P>(`screenOf('mover')`);
        expect(close(await at('f3d'), mover), `f3d at ${frame}: ${await at('f3d')} vs ${mover}`).toBe(true);
        expect(close(await project('world/mover'), mover), `project world/mover at ${frame}`).toBe(true);
        // scene2d: the dot is at (60 + 40 t, 200); the follower is 10 px to its right (its own x is the offset)
        expect(close(await at('f2d'), [70 + 40 * t, 200]), `f2d at ${frame}: ${await at('f2d')}`).toBe(true);
        expect(close(await project('flat/dot'), [60 + 40 * t, 200]), `project flat/dot at ${frame}`).toBe(true);
        // a plain layer: its anchor point, keyframed x 300 → 420 over 3 s
        expect(close(await at('fbox'), [300 + 40 * t, 60]), `fbox at ${frame}: ${await at('fbox')}`).toBe(true);
        // a layer inside a composition placed at (200, 0)
        expect(close(await at('fnest'), [240, 30]), `fnest at ${frame}: ${await at('fnest')}`).toBe(true);
      }
      // the follower is drawn there: its colour at the scene2d dot's place + 10 px
      expect(await film.eval<number[]>('pixelAt(45, 70 + 40 * 1.5, 200)')).toEqual([0, 255, 0, 255]);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    });
  }, 180_000);

  it('is hidden while its object is behind the camera, and while the followed layer is not on screen', async () => {
    await on(async (film) => {
      await film.eval('movie.gotoFrame(30, true)');
      expect(await film.eval('shown("fbehind")')).toBe(false);
      expect(await film.eval('movie.project("world/behind")')).toBeNull();
      expect(await film.eval('shown("flate")')).toBe(false);                 // "late" starts at 2 s
      expect(await film.eval('movie.project("late")')).toBeNull();
      await film.eval('movie.gotoFrame(75, true)');
      expect(await film.eval('shown("flate")')).toBe(true);
      expect(close(await film.eval<P>('centreOf("flate")'), [440, 240])).toBe(true);
      expect(await film.eval('movie.pick(440, 240, { only: ["flate"] })?.name ?? null')).toBe('flate');     // pick finds it where it is drawn
    });
  }, 120_000);

  it('is a function of the time: forward, backward and a repeat give one picture per frame', async () => {
    await on(async (film) => {
      const h = (f: number) => film.eval<string>(`hashOf(${f})`);
      const forward = [await h(0), await h(30), await h(60), await h(89)];
      const back = [await h(89), await h(60), await h(30), await h(0)].reverse();
      expect(back).toEqual(forward);
      expect(new Set(forward).size).toBe(4);
    });
  }, 120_000);

  it('says its mistakes: an unknown object with the known ones, a threeD follower, an offset bigger than the movie, a target inside a threeD card', async () => {
    const logs = (q: string) => on((film) => film.eval<string[]>('window.__logs'), q);
    expect((await logs('bad=1')).join('\n')).toMatch(/fbad.*follow "world\/Marz": the scene3d layer "world" has no object "Marz".*mover/);
    expect((await logs('flat3d=1')).join('\n')).toMatch(/f3dcard.*a threeD layer cannot follow/);
    expect((await logs('far=1')).join('\n')).toMatch(/ffar.*x \/ y are measured from the followed point/);
    expect((await logs('card=1')).join('\n')).toMatch(/fcard.*inside a threeD card/);
    await on(async (film) => {
      expect(await film.eval('(() => { try { movie.project("world/Marz"); return null } catch (e) { return e.message } })()')).toMatch(/no object "Marz".*mover/);
      expect(await film.eval('(() => { try { movie.project("nowhere"); return null } catch (e) { return e.message } })()')).toMatch(/no layer "nowhere"/);
    });
  }, 180_000);
});
