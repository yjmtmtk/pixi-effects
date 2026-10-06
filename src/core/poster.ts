/** The poster time of a movie: the moment that stands for it before it plays (a title card, the best frame). */
export interface PosterTime { seconds: number | null; frame: number | null }

/**
 * `movie.init({ poster })` in seconds. A negative value counts back from the end (like a keyframe's `at`); one past the end is
 * clamped to the last frame; anything that is not a finite number is ignored. Each of those says so.
 */
export function normalizePoster(poster: unknown, duration: number, frameRate: number): PosterTime {
  if (poster === undefined || poster === null) return { seconds: null, frame: null };
  if (typeof poster !== 'number' || !Number.isFinite(poster)) {
    console.warn(`pixi-effects: movie.init({ poster }): ${JSON.stringify(poster)} is not a time in seconds; ignored`);
    return { seconds: null, frame: null };
  }
  let seconds = poster < 0 ? Math.max(0, duration + poster) : poster;
  if (seconds > duration) {
    console.warn(`pixi-effects: movie.init({ poster }): the poster time ${poster} s is past the end of the movie (${duration} s); using the last frame`);
    seconds = duration;
  }
  return { seconds, frame: Math.round(seconds * frameRate) };
}
