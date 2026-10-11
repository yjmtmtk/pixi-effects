import type { Movie, Stop } from '../index';
import { nextStopAfter, previousStopBefore, stopAtOrBefore, pageStarts } from './stops';

/** A presentation is now on a stop (`next()` played to it, or `prev()` / `goToStop()` / `goToPage()` jumped to it). */
export interface StopEvent { index: number; stop: Stop; pageIndex: number }

const listeners = new WeakMap<Movie, Set<(e: StopEvent) => void>>();
const toward = new WeakMap<Movie, Stop>();                          // the stop `next()` is playing toward, per movie

/** Call `fn` every time a presentation lands on a stop. Returns the function that stops listening. */
export function onStop(movie: Movie, fn: (e: StopEvent) => void): () => void {
  let set = listeners.get(movie);
  if (!set) { set = new Set(); listeners.set(movie, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}

function emit(movie: Movie, stop: Stop): void {
  const e: StopEvent = { index: stop.index, stop, pageIndex: stop.pageIndex };
  for (const fn of [...(listeners.get(movie) ?? [])]) fn(e);
}

/** Which stop the playhead is on or has passed (-1 before the first). */
export const stopIndex = (movie: Movie): number => stopAtOrBefore(movie.stops, movie.currentFrame)?.index ?? -1;
/** The stop the playhead is on or has passed, or null. */
export const currentStop = (movie: Movie): Stop | null => stopAtOrBefore(movie.stops, movie.currentFrame);
/** Which page the playhead is in (0-based), -1 before the first stop. */
export const pageIndex = (movie: Movie): number => currentStop(movie)?.pageIndex ?? -1;
/** How many pages the stops make. */
export const pageCount = (movie: Movie): number => pageStarts(movie.stops).length;

/**
 * Play to the next stop and pause exactly there (a presentation's "next"). Pressed again while it is playing toward a stop, it skips the
 * rest of the animation and lands on that stop at once. After the last stop it plays to the end. Resolves when it has landed (or
 * stopped for another reason). An ordinary `movie.play()` ignores the stops.
 */
export async function next(movie: Movie): Promise<void> {
  if (!movie.isReady) return;
  const going = toward.get(movie);
  if (going && movie.isPlaying) {                                   // still on its way: skip the rest of the animation
    toward.delete(movie);
    movie.pause();                                                  // (this settles the first call's playUntil as "not landed": it says nothing)
    await movie.gotoFrame(going.frame, true);
    emit(movie, going);
    return;
  }
  toward.delete(movie);                                             // (a press while it is already landing goes on to the next stop, as it always did)
  if (movie.currentFrame >= movie.totalFrames) return;
  const target = nextStopAfter(movie.stops, movie.currentFrame);
  if (!target) { await movie.playUntil(); return; }
  toward.set(movie, target);
  const landed = await movie.playUntil(target.frame / movie.frameRate);
  if (toward.get(movie) === target) toward.delete(movie);
  if (landed) emit(movie, target);
}

/** Jump back to the previous stop at once (no reverse playback); from the first stop, to the start. */
export async function prev(movie: Movie): Promise<void> {
  if (!movie.isReady) return;
  toward.delete(movie);
  movie.pause();
  const target = previousStopBefore(movie.stops, movie.currentFrame);
  await movie.gotoFrame(target ? target.frame : 0, true);
  if (target) emit(movie, target);
}

/** Jump to stop `index` (0-based). */
export async function goToStop(movie: Movie, index: number): Promise<void> {
  if (!movie.isReady) return;
  const stop = movie.stops[index];
  if (!stop) { console.warn(`pixi-effects: goToStop(movie, ${index}): there are ${movie.stops.length} stops (0 to ${movie.stops.length - 1})`); return; }
  toward.delete(movie);
  movie.pause();
  await movie.gotoFrame(stop.frame, true);
  emit(movie, stop);
}

/** Jump to the first stop of page `page` (0-based). */
export async function goToPage(movie: Movie, page: number): Promise<void> {
  const starts = pageStarts(movie.stops);
  const stop = starts[page];
  if (!stop) { console.warn(`pixi-effects: goToPage(movie, ${page}): there are ${starts.length} pages (0 to ${starts.length - 1})`); return; }
  await goToStop(movie, stop.index);
}
