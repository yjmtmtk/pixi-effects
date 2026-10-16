/**
 * `movie.hover({ onEnter, onLeave })`: which layer (or which object of a three layer) the pointer is over, as two callbacks. It is a page-side tool on top of `movie.pick`: it listens to the
 * canvas, asks `pick` where the pointer is, and calls `onEnter(hit)` when the layer under it changes to another and `onLeave(hit)` for the one it left. While the pointer rests inside the
 * picture it asks again on every frame, so a layer that runs away from a still pointer is left. Nothing here is part of the video: an exported file has no pointer.
 */
import type { PickHit, PickOptions } from './pick';

export interface HoverOptions extends PickOptions {
  /** The layer (or, in a `three` layer, the object) the pointer has just come onto. */
  onEnter?: (hit: PickHit) => void;
  /** The one it has just left (also when the pointer leaves the picture, or `stop()` is called). */
  onLeave?: (hit: PickHit) => void;
  /** A CSS cursor to show while something is hovered (`true` is `'pointer'`); it goes back when nothing is. */
  cursor?: string | boolean;
}

/** What `startHover` needs from the outside: the canvas, the movie's `pick` and `canvasPoint`, and a frame clock (the browser's by default). */
export interface HoverHost {
  canvas: HTMLCanvasElement;
  pick: (x: number, y: number, opts: PickOptions) => PickHit | null;
  point: (event: PointerEvent) => [number, number];
  requestFrame?: (fn: () => void) => number;
  cancelFrame?: (id: number) => void;
}

const keyOf = (h: PickHit | null): string | null => (h ? `${h.path}${h.three ? `#${h.three.object}` : ''}` : null);

/** Start watching the pointer over `host.canvas`. Returns the function that stops it. */
export function startHover(host: HoverHost, opts: HoverOptions = {}): () => void {
  const { canvas } = host;
  const request = host.requestFrame ?? ((fn: () => void) => requestAnimationFrame(fn));
  const cancel = host.cancelFrame ?? ((id: number) => cancelAnimationFrame(id));
  const cursor = opts.cursor === true ? 'pointer' : opts.cursor || '';
  const pickOpts: PickOptions = {};
  if (opts.only) pickOpts.only = opts.only;
  if (opts.ignore) pickOpts.ignore = opts.ignore;

  let current: PickHit | null = null;
  let last: PointerEvent | null = null;
  let loop: number | null = null;
  let said = false;

  const call = (fn: ((hit: PickHit) => void) | undefined, hit: PickHit): void => {
    if (!fn) return;
    try { fn(hit); } catch (err) {
      if (!said) { said = true; console.warn('pixi-effects: movie.hover: a handler threw (said once) —', err); }
    }
  };
  const setCursor = (on: boolean): void => { if (cursor) canvas.style.cursor = on ? cursor : ''; };
  const evaluate = (): void => {
    if (!last) return;
    const [x, y] = host.point(last);
    const hit = host.pick(x, y, pickOpts);
    if (keyOf(hit) === keyOf(current)) { current = hit ?? current; return; }
    const was = current;
    current = hit;
    if (was) call(opts.onLeave, was);
    if (hit) call(opts.onEnter, hit);
    setCursor(!!hit);
  };
  const tick = (): void => { loop = null; if (last) { evaluate(); loop = request(tick); } };
  const onMove = (event: Event): void => {
    last = event as PointerEvent;
    evaluate();
    if (loop === null) loop = request(tick);
  };
  const onLeave = (): void => {
    last = null;
    if (loop !== null) { cancel(loop); loop = null; }
    const was = current;
    current = null;
    if (was) call(opts.onLeave, was);
    setCursor(false);
  };

  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onMove);
  canvas.addEventListener('pointerleave', onLeave);
  return () => {
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onMove);
    canvas.removeEventListener('pointerleave', onLeave);
    onLeave();
  };
}
