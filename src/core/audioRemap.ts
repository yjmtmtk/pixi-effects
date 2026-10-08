import type { AudioDescriptor } from '../types';

type RemapFields = Pick<AudioDescriptor, 'start' | 'end' | 'loop' | 'initialVolume' | 'volumeKeyframes' | 'warp' | 'sourceMap'>;

/** The gain of a sound at its own time `u`: `initialVolume` from `start`, then straight lines to each point (what the Web Audio ramps did). */
function gainAt(a: RemapFields, u: number): number {
  let prevT = a.start, prevV = a.initialVolume ?? 1;
  if (u <= prevT) return prevV;
  for (const kf of a.volumeKeyframes ?? []) {
    if (u <= kf.time) return kf.time === prevT ? kf.value : prevV + (kf.value - prevV) * ((u - prevT) / (kf.time - prevT));
    prevT = kf.time; prevV = kf.value;
  }
  return prevV;
}

const CELL = 1 / 1000;

/**
 * Render a sound through its time maps. For every output sample T: u = warp(T) (sampled every millisecond, interpolated), the position
 * in the sound is sourceMap(u) (or u - start), and the sample is read with linear interpolation. Where the position hardly moves (a
 * freeze) it fades to silence rather than hold one sample as a DC offset. Returns null when it is never audible. `at` is where in the
 * mix the returned samples begin. Pitch follows speed (a resample, like a tape).
 */
export function resampleThrough(
  a: RemapFields, left: Float32Array, right: Float32Array, srcRate: number, outRate: number, total: number,
): { L: Float32Array; R: Float32Array; at: number } | null {
  const nCell = Math.ceil(total / CELL) + 2;
  const U = new Float64Array(nCell);
  let first = -1, last = -1;
  for (let k = 0; k < nCell; k++) {
    const u = a.warp ? a.warp(k * CELL) : k * CELL;
    U[k] = u;
    if (Number.isFinite(u) && u >= a.start && u < a.end) { if (first < 0) first = k; last = k; }
  }
  if (first < 0) return null;
  const lo = Math.max(0, (first - 1) * CELL), hi = Math.min(total, (last + 2) * CELL);
  const n = Math.max(1, Math.ceil((hi - lo) * outRate));
  const L = new Float32Array(n), R = new Float32Array(n);
  const dur = left.length / srcRate;
  let prevPos = NaN;
  for (let i = 0; i < n; i++) {
    const T = lo + i / outRate;
    const x = T / CELL, k = Math.min(Math.floor(x), nCell - 2), f = x - k;
    const u0 = U[k]!, u1 = U[k + 1]!;
    if (!(Number.isFinite(u0) && Number.isFinite(u1))) { prevPos = NaN; continue; }
    const u = u0 * (1 - f) + u1 * f;
    if (u < a.start || u >= a.end) { prevPos = NaN; continue; }
    const raw = a.sourceMap ? a.sourceMap(u) : u - a.start;
    let pos = raw;
    if (a.loop) pos = ((pos % dur) + dur) % dur;
    const rate = Number.isNaN(prevPos) ? 1 : Math.abs(raw - prevPos) * outRate;
    prevPos = raw;
    if (pos < 0 || pos >= dur) continue;
    const g = gainAt(a, u) * Math.min(1, rate / 0.02);
    const sp = pos * srcRate, j = Math.floor(sp), fr = sp - j, j1 = Math.min(j + 1, left.length - 1);
    L[i] = (left[j]! * (1 - fr) + left[j1]! * fr) * g;
    R[i] = (right[j]! * (1 - fr) + right[j1]! * fr) * g;
  }
  return { L, R, at: lo };
}

/**
 * When a sound plays, in the MOVIE's time. Without a `warp` that is `start`..`end`; with one (the sound sits in a remapped composition)
 * `start` / `end` are the composition's local times, so the span is where the warp lands inside them. `total` is the movie's length.
 */
export function playSpan(a: Pick<AudioDescriptor, 'start' | 'end' | 'warp'>, total: number): { start: number; end: number } {
  if (!a.warp) return { start: a.start, end: a.end };
  let first = -1, last = -1;
  const n = Math.ceil(total / CELL) + 1;
  for (let k = 0; k <= n; k++) {
    const u = a.warp(k * CELL);
    if (Number.isFinite(u) && u >= a.start && u < a.end) { if (first < 0) first = k; last = k; }
  }
  return first < 0 ? { start: total, end: total } : { start: first * CELL, end: (last + 1) * CELL };
}

/**
 * The farthest local time the warp (the clock of the composition the sound sits in) reaches during the movie. A sound whose local `end` is
 * beyond it is cut short by that clock (it stops or stands still) — a different cause than the end of the movie.
 */
export function clockReach(a: Pick<AudioDescriptor, 'warp'>, total: number): number {
  let reach = -Infinity;
  const n = Math.ceil(total / CELL) + 1;
  for (let k = 0; k <= n; k++) {
    const u = a.warp ? a.warp(k * CELL) : k * CELL;
    if (Number.isFinite(u) && u > reach) reach = u;
  }
  return reach;
}
