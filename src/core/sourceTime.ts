/**
 * A time that should be a frame boundary (k / 30) can reach the decoder a hair under it, which picks the frame before. This many
 * seconds (a twentieth of a thousandth) is added to every lookup: far below any frame length, far above float noise.
 */
export const FRAME_EPS = 5e-5;

/**
 * The time to ask the decoder for, given the playhead value `v` of a video layer (seconds in the file). With `loop` the file repeats
 * (a negative value too); without it the value stays inside the file. `sourceDuration` 0 means the length is unknown.
 */
export function sourceLookup(v: number, sourceDuration: number, loop: boolean): number {
  if (!(sourceDuration > 0)) return Math.max(0, v);
  const w = v + FRAME_EPS;
  if (loop) return ((w % sourceDuration) + sourceDuration) % sourceDuration;
  return Math.min(Math.max(w, 0), sourceDuration);
}
