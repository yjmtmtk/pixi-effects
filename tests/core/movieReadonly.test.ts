import { describe, it, expect, vi } from 'vitest';
import { Movie } from '../../src/core/Movie';

// `movie.currentFrame = 90` reads like `video.currentTime = t`, but it did not seek: it broke the movie's state. The state is read-only now,
// and writing it says which call does the job (a module is strict, so a bare getter would throw a TypeError that names nothing).
describe('the state of a movie is read-only, and writing it says what to call', () => {
  it.each([
    ['currentFrame', /movie\.currentFrame is read-only: to move the playhead, await movie\.gotoFrame\(90\)/],
    ['isPlaying', /movie\.isPlaying is read-only: call movie\.play\(\) or movie\.pause\(\)/],
    ['duration', /movie\.duration is read-only: it is set by movie\.init\(\{ duration \}\)/],
    ['width', /movie\.width is read-only: to change the size, await movie\.resize\(width, height\)/],
    ['frameRate', /movie\.frameRate is read-only: it is set by movie\.init\(\{ frameRate \}\)/],
  ])('%s', (key, message) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const movie = new Movie();
    const before = (movie as unknown as Record<string, unknown>)[key];
    (movie as unknown as Record<string, unknown>)[key] = key === 'isPlaying' ? true : 90;
    expect((movie as unknown as Record<string, unknown>)[key]).toBe(before);
    expect(String(warn.mock.calls[0]?.[0])).toMatch(message);
    warn.mockRestore();
  });
});
