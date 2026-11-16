/**
 * A preset's `at` as seconds. These presets compute many times from `at` (a keyframe a frame, a piece a letter), so a moment by name
 * (`'host@in'`, which layers and keyframes take) cannot be added to; it is refused with what to write instead (it used to become NaN).
 */
export function secondsAt(fn: string, at: unknown, returns: 'layers' | 'keyframes'): number {
  if (at === undefined) return 0;
  if (typeof at === 'number' && Number.isFinite(at)) return at;
  if (typeof at === 'string' && at.includes('@')) {
    throw new Error(returns === 'layers'
      ? `pixi-effects: ${fn}(): at "${at}" is a moment by name: give seconds here, and start the whole of it at the moment by putting what ${fn}() returns in a composition: { type: 'composition', at: '${at}', layers: ${fn}({ …, at: 0 }) }`
      : `pixi-effects: ${fn}(): at "${at}" is a moment by name: give seconds from the start of the layer here (a keyframe of your own may name a moment: { at: '${at}', to: { … } })`);
  }
  throw new Error(`pixi-effects: ${fn}(): at must be a number of seconds, got ${JSON.stringify(at)}`);
}
