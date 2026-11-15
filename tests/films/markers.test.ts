// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// Markers: layers placed by named moments (a component's marker, a layer's end plus an offset, a root marker seen from inside a
// composition, a marker of a slowed composition), drawn at those times; check's moments (resolveAt) know the markers. See markers.html.
const near = (px: number[], want: number[], tol = 8) => want.every((v, i) => Math.abs(px[i]! - v) <= tol);
const BLACK = [0, 0, 0];

runFilms('markers', () => {
  it('each probe appears on the frame of its moment and not the frame before', async () => {
    await withFilm('markers', async (film) => {
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      const px = (t: number, x: number) => film.eval<number[]>(`px(${t}, ${x}, 90)`);
      const f = 1 / 30;
      const cases: Array<[string, number, number, number[]]> = [
        ['p1 host@in', 20, 1.5, [255, 0, 0]],
        ['p2 host@out + 0.2', 70, 2.7, [0, 255, 0]],
        ['p3 @drop from inside scene', 120, 2.5, [0, 0, 255]],
        ['p4 slow@hit (speed 0.5)', 170, 2, [255, 255, 0]],
      ];
      for (const [label, x, t, colour] of cases) {
        expect(near(await px(t - f, x), BLACK), `${label}: not yet at ${t - f}`).toBe(true);
        expect(near(await px(t, x), colour), `${label}: on at ${t}`).toBe(true);
      }
      expect(near(await px(2.5 - f, 220), [255, 0, 255]), 'p5: shown until its keyframe at host@out').toBe(true);
      expect(near(await px(2.5, 220), BLACK), 'p5: the keyframe at host@out (2.5 s) hides it').toBe(true);
      expect(await film.eval('at("host@in, host@out, @drop, slow@hit")')).toEqual([
        { label: 'host-in', frame: 45 }, { label: 'host-out', frame: 75 }, { label: 'drop', frame: 75 }, { label: 'slow-hit', frame: 60 },
      ]);
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
      expect(near(await px(1.5, 270), [255, 255, 255]), 'p6: {who}@in with who = host').toBe(true);
      await film.eval('setWho("hots")');
      const logs = await film.eval<string[]>('window.__logs');
      expect(logs.some(l => /layer "p6": at: "hots@in": no layer named "hots" — did you mean "host"\?/.test(l)), logs.join('\n')).toBe(true);
    });
  }, 120_000);
});
