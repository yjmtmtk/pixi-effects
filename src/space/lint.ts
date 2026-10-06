import { collectPropKeys } from './specKeys';
import type { SequenceSpec } from '../types';

type Warn = (message: string) => void;
const defaultWarn: Warn = m => console.warn(m);

/** Keys that are never valid for any layer, with the property the author probably meant. */
const LAYER_ALIASES: Record<string, string> = {
  rotateX: 'rotationX',
  rotateY: 'rotationY',
  rotateZ: 'rotation',
  translateZ: 'z',
  depth: 'z',
  posZ: 'z',
};

/** Camera-only mistakes. */
const CAMERA_ALIASES: Record<string, string> = {
  perspective: 'fov',
  zoom: 'fov',
  pointOfInterest: 'lookAtX / lookAtY / lookAtZ',
  lookAt: 'lookAtX / lookAtY / lookAtZ',
};

const CAMERA_PROPS = ['x', 'y', 'z', 'fov', 'lookAtX', 'lookAtY', 'lookAtZ'];
const NEEDS_THREE_D = ['z', 'rotationX', 'rotationY'];

function label(spec: SequenceSpec): string {
  return spec.name ? `layer "${spec.name}"` : `unnamed ${spec.type} layer`;
}

/**
 * Warn (never throw) about the inputs an AI author is most likely to get wrong,
 * with a message that says what to change. One call per layer, at build time.
 */
export function lintSequence(spec: SequenceSpec, warn: Warn = defaultWarn): void {
  const who = label(spec);
  const keys = collectPropKeys(spec);

  for (const k of keys) {
    const fix = LAYER_ALIASES[k] ?? (spec.type === 'camera' ? CAMERA_ALIASES[k] : undefined);
    if (fix) warn(`pixi-effects: ${who}: "${k}" is not a property — did you mean "${fix}"?`);
  }

  if (spec.type === 'camera') {
    const raw = spec as unknown as Record<string, unknown>;
    for (const p of CAMERA_PROPS) {
      if (p in raw) warn(`pixi-effects: ${who}: "${p}" must go inside initial / keyframes, not on the camera itself`);
    }
    for (const k of Object.keys(raw)) {
      const fix = CAMERA_ALIASES[k];
      if (fix) warn(`pixi-effects: ${who}: "${k}" is not a property — did you mean "${fix}" (inside initial)?`);
    }
    return;
  }

  if (spec.type === 'audio') {
    if (spec.threeD) warn(`pixi-effects: ${who}: threeD has no effect on audio`);
    return;
  }

  if (!spec.threeD) {
    for (const k of NEEDS_THREE_D) {
      if (keys.has(k)) warn(`pixi-effects: ${who}: "${k}" needs threeD: true (it is ignored otherwise)`);
    }
  }
}
