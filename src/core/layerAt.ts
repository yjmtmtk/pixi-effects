/**
 * A layer's (or a keyframe's) `at` as a number. A moment by name (`at: 'host@in'`) is made seconds before anything is built (core/moments.ts), so what is
 * built always has a number; anything else (a spec that skipped that pass) starts at 0.
 */
export function layerAt(spec: { at?: unknown }): number {
  return typeof spec.at === 'number' ? spec.at : 0;
}
