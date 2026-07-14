/**
 * pixi-effects/three — optional three.js integration.
 *
 * Import this entry only when you use `type: 'three'` sequences; the core
 * `pixi-effects` entry never touches three.js. Call `registerThree()` once
 * before Movie.init builds a composition containing a three sequence.
 */
import { registerSequenceType, type SequenceCtor } from '../core/Composition';
import { ThreeSequence } from './ThreeSequence';
import type { SequenceSpec } from '../types';
import type { ThreeSequenceSpec } from './types';

export { ThreeSequence } from './ThreeSequence';
export type { ThreeContext, ThreeSetupResult, ThreeSequenceSpec } from './types';

/** Register the 'three' sequence type. Idempotent; explicit call so `sideEffects: false` bundlers can't drop it. */
export function registerThree(): void {
  registerSequenceType('three', ThreeSequence as unknown as SequenceCtor);
}

/**
 * Typing helper: accepts a strongly-typed three spec and returns it as a
 * core SequenceSpec, keeping three.js types out of the core union.
 */
export function three(spec: ThreeSequenceSpec): SequenceSpec {
  return spec as unknown as SequenceSpec;
}
