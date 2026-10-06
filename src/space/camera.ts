/** A camera layer's lifespan on the global timeline, seconds. */
export interface CameraWindow { start: number; end: number }

/**
 * The active camera at time `t`: the last-listed (top-most) camera whose
 * lifespan covers `t`. Windows are [start, end), except that a camera running
 * to the end of its composition also covers the final instant `t === compEnd`.
 */
export function pickActiveCamera<T extends CameraWindow>(
  cams: readonly T[],
  t: number,
  compEnd: number,
): T | null {
  for (let i = cams.length - 1; i >= 0; i--) {
    const c = cams[i]!;
    const inside = t >= c.start && (t < c.end || (c.end >= compEnd && t <= compEnd));
    if (inside) return c;
  }
  return null;
}

/** First pair of camera indices whose lifespans strictly overlap, or null. */
export function findOverlap(cams: readonly CameraWindow[]): [number, number] | null {
  for (let i = 0; i < cams.length; i++) {
    for (let j = i + 1; j < cams.length; j++) {
      const a = cams[i]!;
      const b = cams[j]!;
      if (a.start < b.end && b.start < a.end) return [i, j];
    }
  }
  return null;
}
