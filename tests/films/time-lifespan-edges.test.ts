// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// Time: the edges of a lifespan. The answers come from the documents, written before the film was run:
// - docs/dsl.md ("A layer is not removed when its lifespan [at, at + duration) ends: it is only hidden … Outside the lifespan it is invisible")
//   and skills/pixi-effects/reference/cheatsheet.md ("A layer is hidden (not removed) outside [at, at+duration)"): the start is in, the end is out.
// - docs/api.md render(): "a 10 s movie at 30 fps is 300 frames … frames 0 to 299; the moment duration itself is not a frame": frame f is the moment f / 30 s.
//   So for at: 1, duration: 1 at 30 fps: frame 29 (0.967 s) is before, frame 30 (1 s) is the first inside, frame 59 (1.967 s) the last inside, frame 60 (2 s) is out.
// - cheatsheet.md "Time of a keyframe's at: seconds from the start of its own layer": the keyframe { at: 0, to: { x: 260 }, duration: 1, ease: 'none' }
//   starts at composition second 1, so the centre is x = 60 + 200 × (f − 30) / 30: 60 at frame 30, 160 at frame 45, 253.33 at frame 59.
//   (Were it composition time, the slide would be over by frame 30 and the rect would stand at x 260.)
// - docs/dsl.md shapes: a rect is centred on x, y; docs/api.md inspect(): visible = "alive at this frame, not hidden by an ancestor, alpha > 0", bounds in canvas pixels.
const RED = [255, 0, 0];
const BLACK = [0, 0, 0];
const centre = (f: number) => 60 + 200 * (f - 30) / 30;

runFilms('Time: a layer is alive in [at, at + duration), and its keyframes count from its own start', () => {
  it('frame 29 is before (not seen), 30 is the start (seen, at the keyframe\'s first value), 59 the last frame inside, 60 the end (not seen): in the picture and in inspect()', async () => {
    await withFilm('time-lifespan-edges', async (film) => {
      const px = (f: number, x: number) => film.eval<number[]>(`pixelAt(${f}, ${x}, 90)`);
      const life = (f: number) => film.eval<any>(`lifeAt(${f})`);

      // what a person sees: the middle of where the rect stands (or would stand), at each edge
      expect(await px(29, 60), 'frame 29 (0.967 s): before the start, nothing where the rect will appear').toEqual(BLACK);
      expect(await px(30, 60), 'frame 30 (1 s): on the start, the rect at its first x (60)').toEqual(RED);
      expect(await px(59, 253), 'frame 59 (1.967 s): the last frame inside, the rect near x 253.33').toEqual(RED);
      expect(await px(60, 253), 'frame 60 (2 s): the end is not inside, the rect is gone').toEqual(BLACK);
      expect(await px(60, 260), 'frame 60: not at its last value either (hidden, not just moved)').toEqual(BLACK);

      // what inspect() says: visible exactly on frames 30..59, and the bounds follow the local keyframe
      for (const f of [0, 29, 60, 61, 89]) expect((await life(f)).visible, `frame ${f} is outside [30, 60)`).toBe(false);
      for (const f of [30, 31, 45, 58, 59]) {
        const l = await life(f);
        expect(l.frame).toBe(f);
        expect(l.time).toBeCloseTo(f / 30, 6);
        expect(l.visible, `frame ${f} is inside [30, 60)`).toBe(true);
        expect(l.bounds.x, `frame ${f}: left edge = centre ${centre(f).toFixed(2)} − 20`).toBeCloseTo(centre(f) - 20, 1);
        expect(l.bounds.y).toBeCloseTo(70, 1);
        expect(l.bounds.width).toBeCloseTo(40, 1);
        expect(l.bounds.height).toBeCloseTo(40, 1);
      }
      expect(await film.eval<string[]>('window.__logs')).toEqual([]);
    });
  }, 120_000);

  it('time inside the layer is its own: half way through the life the rect is half way along (x 160), and the place it started from is empty', async () => {
    await withFilm('time-lifespan-edges', async (film) => {
      const px = (f: number, x: number) => film.eval<number[]>(`pixelAt(${f}, ${x}, 90)`);
      expect(await px(45, 160), 'frame 45 (local 0.5 s): the centre is at 60 + 200 × 0.5').toEqual(RED);
      expect(await px(45, 60), 'frame 45: x 60 is 100 px behind it').toEqual(BLACK);
      expect(await px(45, 260), 'frame 45: x 260 (where a composition-time keyframe would have put it) is empty').toEqual(BLACK);
      expect(await px(30, 260), 'frame 30: the slide has not begun, x 260 is empty').toEqual(BLACK);
      // seeking back from the end and forward again gives the same answer (a frame is a function of the time)
      expect(await px(89, 160)).toEqual(BLACK);
      expect(await px(45, 160)).toEqual(RED);
      expect(await px(29, 60)).toEqual(BLACK);
    });
  }, 120_000);
});
