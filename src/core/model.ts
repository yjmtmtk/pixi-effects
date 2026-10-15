import type { ModelSequenceSpec, SequenceSpec } from '../types';

/**
 * Typing helper for a glTF model layer (`{ type: 'model', asset, animation, ... }`): accepts a strongly-typed spec and returns it as a `SequenceSpec`.
 * The spec language owns the name `model`; the engine that draws it is the one registered (`registerThree()` from `pixi-effects/three`).
 */
export function model(spec: ModelSequenceSpec): SequenceSpec {
  return spec as SequenceSpec;
}
