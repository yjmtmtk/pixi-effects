import type { SequenceCommon, Keyframe } from '../types';

export interface WithFadeOptions {
  /** Fade-in duration (seconds), at the start of the sequence. */
  in?: number;
  /** Fade-out duration (seconds), ending at the end of the sequence. Requires `duration` to be set on the spec. */
  out?: number;
}

/**
 * Add alpha fade-in / fade-out keyframes to a sequence spec. Mutates and
 * returns the spec so the result can be dropped straight into `sequences[]`.
 *
 * ```ts
 * sequences: [
 *   withFade(
 *     kenBurns({ asset: 'p', at: 0, duration: 6, motion: 'scale' }),
 *     { in: 0.5, out: 0.5 },
 *   ),
 *
 *   withFade(
 *     { type: 'text', text: 'hi', at: 5, duration: 3, initial: { x: 'GW/2' } },
 *     { in: 0.4 },
 *   ),
 * ]
 * ```
 *
 * The added keyframes are layered on top of any keyframes the spec already
 * has — kenBurns's scale / position / rotation tweens keep working.
 *
 * Keyframe `at` is sequence-local: the fade-in starts at 0 and the fade-out
 * at `duration - out`, whatever the sequence's own `at` is. Works the same
 * whether the spec sits directly under the root composition or nested inside
 * another.
 */
export function withFade<T extends SequenceCommon>(spec: T, opts: WithFadeOptions): T {
  if (opts.in != null && opts.in > 0) {
    spec.initial = { ...(spec.initial ?? {}), alpha: 0 };
    const kf: Keyframe = { at: 0, to: { alpha: 1 }, duration: opts.in };
    spec.keyframes = [...(spec.keyframes ?? []), kf];
  }
  if (opts.out != null && opts.out > 0) {
    if (spec.duration == null) {
      throw new Error(
        'withFade(spec, { out }) requires spec.duration to be set so the ' +
        'fade-out can be anchored to the sequence end. Set spec.duration ' +
        'before passing the spec in.',
      );
    }
    const kf: Keyframe = { at: spec.duration - opts.out, to: { alpha: 0 }, duration: opts.out };
    spec.keyframes = [...(spec.keyframes ?? []), kf];
  }
  return spec;
}
