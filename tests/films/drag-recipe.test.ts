// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

// The recipe `drag-drop` as written, in a real browser: a card with a label (one target), a zone that lights while the card is over it, a snap on a drop in the zone, a return anywhere else.
type Film = { eval: <T>(e: string) => Promise<T> };
const fire = (film: Film, type: string, x: number, y: number) => film.eval(`fire('${type}', ${x}, ${y})`);
const settle = (film: Film, ms = 400) => film.eval(`new Promise(r => setTimeout(r, ${ms}))`);
const vars = (film: Film) => film.eval<{ cx: number; cy: number; doneLit: number }>('movie.vars');
const cursor = (film: Film) => film.eval<string>('document.getElementById("stage").style.cursor');

runFilms('The recipe drag-drop, as written', () => {
  it('the card and its label are one target; the cursor says it can be taken; the zone lights while the card is over it and not when it leaves; a drop in the zone snaps, a drop elsewhere returns', async () => {
    await withFilm('drag-recipe', async (film) => {
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      await fire(film, 'pointermove', 200, 270);                           // on the face
      expect(await cursor(film), 'a grab hand over the card').toBe('grab');
      await fire(film, 'pointermove', 100, 100);
      expect(await cursor(film), 'the arrow elsewhere').toBe('');
      expect(await film.eval<string | null>('movie.pick(200, 270, { only: ["card"] })?.path ?? null'), 'a group: the leaf is the hit').toMatch(/^card\//);
      // take it by the label (a second layer of the same group)
      await fire(film, 'pointerdown', 205, 275);
      expect(await cursor(film), 'while it is held').toBe('grabbing');
      await fire(film, 'pointermove', 500, 300); await settle(film);
      expect(await vars(film)).toMatchObject({ cx: 495, cy: 295, doneLit: 0 });
      await fire(film, 'pointermove', 770, 270); await settle(film);
      expect((await vars(film)).doneLit, 'over the zone: lit').toBe(0.6);
      await fire(film, 'pointermove', 600, 450); await settle(film);
      expect((await vars(film)).doneLit, 'off the zone: dark again').toBe(0);
      await fire(film, 'pointermove', 780, 280); await settle(film);
      await fire(film, 'pointerup', 780, 280); await settle(film, 600);
      expect(await vars(film), 'snapped into the middle of the zone, the light off').toEqual({ cx: 770, cy: 270, doneLit: 0 });
      expect(await cursor(film)).toBe('');
      // take it again from the zone and let it go over nothing: it goes back
      await fire(film, 'pointerdown', 770, 270);
      await fire(film, 'pointermove', 400, 100);
      await fire(film, 'pointerup', 400, 100); await settle(film, 600);
      expect(await vars(film)).toEqual({ cx: 200, cy: 270, doneLit: 0 });
      // a press on the background takes nothing
      await fire(film, 'pointerdown', 50, 50); await fire(film, 'pointermove', 300, 300); await fire(film, 'pointerup', 300, 300); await settle(film);
      expect(await vars(film)).toEqual({ cx: 200, cy: 270, doneLit: 0 });
    });
  }, 180_000);
});
