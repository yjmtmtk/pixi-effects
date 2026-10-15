// @vitest-environment node
import { it, expect } from 'vitest';
import { runFilms, withFilm, pictureFrames } from './support/withFilm';

const framesOf = async (query: string, opts: object = {}) => withFilm('export-frames', async (film) => pictureFrames(await film.render(opts)), { query });

runFilms('Export: a file is exactly the frames of its movie', () => {
  it('whole numbers and not: round(duration × fps) frames, whatever the length (1.5 s at 24 fps = 36; 2 s at 29.97 = 60; 0.5 s at 60 = 30; 1.01 s at 30 = 30, not 31; 1.1 s at 30 = 33, not 34 though 1.1 × 30 is 33.000000000000004)', async () => {
    for (const [duration, fps, frames] of [[1.5, 24, 36], [2, 29.97, 60], [0.5, 60, 30], [3, 30, 90], [1.01, 30, 30], [1.1, 30, 33]] as const) {
      const r = await framesOf(`duration=${duration}&fps=${fps}`);
      expect(r.frames, `${duration} s at ${fps} fps`).toBe(frames);
      expect(r.seconds).toBeCloseTo(frames / fps, 2);
    }
  }, 300_000);
  it('a movie of one frame is a file of one frame', async () => {
    expect((await framesOf('duration=0.0333&fps=30')).frames).toBe(1);
  }, 120_000);
  it('a range is [from, to): 1 to 2.5 s is 45 frames; a range that ends at the very end keeps the last frame and no more; one that starts at 0 and ends at the end is the whole movie', async () => {
    expect((await framesOf('duration=4', { range: [1, 2.5] })).frames).toBe(45);
    expect((await framesOf('duration=4', { range: [3, 4] })).frames).toBe(30);
    expect((await framesOf('duration=4', { range: [0, 4] })).frames).toBe(120);
  }, 300_000);
  it('the sound ends with the picture: measured 2026-10-15, the sound is 28 to 47 ms longer (the encoder pads to whole audio frames); it is never shorter, and never more than 60 ms longer', async () => {
    for (const duration of [3, 1.5, 2.01]) {
      const r = await framesOf(`duration=${duration}&sound=1`);
      expect(r.audioSeconds).not.toBeNull();
      const diff = r.audioSeconds! - r.seconds;
      expect(diff, `${duration} s: picture ${r.seconds} s, sound ${r.audioSeconds} s (a lost tail of the sound)`).toBeGreaterThanOrEqual(-0.005);
      expect(diff, `${duration} s: picture ${r.seconds} s, sound ${r.audioSeconds} s (sound running on past the picture)`).toBeLessThanOrEqual(0.06);
    }
  }, 300_000);
  it('a key packet at the first frame, and never more than the keyframe interval (2 s = 60 frames) without one', async () => {
    const r = await framesOf('duration=5');
    expect(r.keyFrames[0]).toBe(0);
    const gaps = r.keyFrames.slice(1).map((k, i) => k - r.keyFrames[i]!);
    expect(Math.max(...gaps, r.frames - r.keyFrames[r.keyFrames.length - 1]!), `key packets at frames ${r.keyFrames.join(', ')} of ${r.frames}`).toBeLessThanOrEqual(60);
  }, 120_000);
  it('every format and codec writes the same number of frames: mp4 and mov (avc), webm (vp9)', async () => {
    for (const [format, codec] of [['mp4', 'avc'], ['mov', 'avc'], ['webm', 'vp9']] as const) {
      const r = await framesOf('duration=2', { format, video: { codec } });
      expect(r.frames, `${format} ${codec}`).toBe(60);
    }
  }, 300_000);
});
