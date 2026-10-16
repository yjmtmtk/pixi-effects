// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// movie.hover and the drag-and-drop of the recipe `drag-drop`, in a real browser (the canvas is shown at twice its size; pointer events are sent at canvas pixels).
type Film = { eval: <T>(e: string) => Promise<T> };
const fire = (film: Film, type: string, x: number, y: number) => film.eval(`fire('${type}', ${x}, ${y})`);
const events = (film: Film) => film.eval<string[]>('window.__events');
const settle = (film: Film, ms = 400) => film.eval(`new Promise(r => setTimeout(r, ${ms}))`);
const where = (film: Film, x: number, y: number) => film.eval<string | null>(`(() => { const h = movie.pick(${x}, ${y}); return h ? h.name : null; })()`);

runFilms('Interaction on movie.pick: hover and drag and drop', () => {
  it('hover: onEnter once for the layer under the pointer, onLeave when it goes to another or off the picture; the cursor follows', async () => {
    await withFilm('interact', async (film) => {
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      await fire(film, 'pointermove', 100, 100);                             // on the card
      await fire(film, 'pointermove', 110, 105);
      expect(await events(film)).toEqual(['in card']);
      expect(await film.eval<string>('document.getElementById("stage").style.cursor')).toBe('pointer');
      await fire(film, 'pointermove', 380, 200);                             // on the zone
      expect(await events(film)).toEqual(['in card', 'out card', 'in zone']);
      await fire(film, 'pointermove', 20, 250);                              // only the background (ignored): nothing is hovered
      expect(await events(film)).toEqual(['in card', 'out card', 'in zone', 'out zone']);
      expect(await film.eval<string>('document.getElementById("stage").style.cursor')).toBe('');
      await fire(film, 'pointermove', 380, 200);
      await fire(film, 'pointerleave', 380, 200);
      expect((await events(film)).slice(-2)).toEqual(['in zone', 'out zone']);
    });
  }, 120_000);

  it('hover follows a picture that moves under a still pointer: the runner leaves the pointer while it plays (no pointer event in between)', async () => {
    await withFilm('interact', async (film) => {
      await fire(film, 'pointermove', 60, 40);                               // on the runner at the start
      expect(await events(film)).toEqual(['in runner']);
      await film.eval('movie.play()');
      await settle(film, 1500);                                              // it has run 150 px away
      await film.eval('movie.pause()');
      expect(await events(film)).toEqual(['in runner', 'out runner']);
    });
  }, 120_000);

  it('drag and drop: the card follows the pointer by the variables, the drop asks what is under it, and a drop on the zone snaps into it', async () => {
    await withFilm('interact', async (film) => {
      expect(await where(film, 100, 100)).toBe('card');
      await fire(film, 'pointerdown', 110, 110);                             // taken 10 px right and below its middle
      await fire(film, 'pointermove', 200, 160);
      await fire(film, 'pointermove', 300, 180);
      await settle(film);
      expect(await where(film, 290, 170), 'the card is where the pointer took it along (its middle at 290, 170)').toBe('card');
      expect(await where(film, 100, 100), 'and no longer where it was').toBe('bg');
      await fire(film, 'pointermove', 380, 200);
      await fire(film, 'pointerup', 380, 200);
      await settle(film, 600);
      expect(await events(film)).toContain('drop on zone');
      expect(await where(film, 380, 200), 'snapped into the middle of the zone').toBe('card');
      // the card is held again from there and let go over nothing: it stays where it is let go
      await fire(film, 'pointerdown', 380, 200);
      await fire(film, 'pointermove', 100, 60);
      await fire(film, 'pointerup', 100, 60);
      await settle(film, 600);
      expect((await events(film)).at(-1)).toBe('drop on bg');
      expect(await where(film, 100, 60)).toBe('card');
    }, { query: 'hover=0' });
  }, 180_000);
});
