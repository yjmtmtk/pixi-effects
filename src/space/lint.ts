import { collectPropKeys } from './specKeys';
import { describeLayer } from '../core/lint';
import type { SequenceSpec } from '../types';

type Warn = (message: string) => void;
const defaultWarn: Warn = m => console.warn(m);

const FOV_HINT = 'perspective is the camera\'s "fov" — add a { type: "camera" } layer and set fov in its initial / keyframes';

/** Keys that are never valid for any layer, with a hint at what the author probably meant. */
const LAYER_ALIASES: Record<string, string> = {
  rotateX: 'did you mean "rotationX"?',
  rotateY: 'did you mean "rotationY"?',
  rotateZ: 'did you mean "rotation"?',
  rotationZ: 'did you mean "rotation" (it is the Z rotation)?',
  translateZ: 'did you mean "z"?',
  depth: 'did you mean "z"?',
  posZ: 'did you mean "z"?',
  perspective: FOV_HINT,
  zoom: FOV_HINT,
};

/** Camera-only mistakes. */
const CAMERA_ALIASES: Record<string, string> = {
  pointOfInterest: 'did you mean "lookAtX / lookAtY / lookAtZ"?',
  lookAt: 'did you mean "lookAtX / lookAtY / lookAtZ"?',
};

const CAMERA_PROPS = ['x', 'y', 'z', 'fov', 'lookAtX', 'lookAtY', 'lookAtZ', 'offsetX', 'offsetY', 'offsetZ', 'lookOffsetX', 'lookOffsetY', 'lookOffsetZ'];
const NEEDS_THREE_D = ['z', 'rotationX', 'rotationY'];
const SKEW_KEYS = ['skew', 'skewX', 'skewY'];

/**
 * Warn (never throw) about the inputs an AI author is most likely to get wrong,
 * with a message that says what to change. One call per layer, at build time.
 */
export function lintSequence(spec: SequenceSpec, warn: Warn = defaultWarn): void {
  const who = describeLayer(spec);
  const keys = collectPropKeys(spec);
  const explained = new Set<string>();

  for (const k of keys) {
    const hint = LAYER_ALIASES[k] ?? (spec.type === 'camera' ? CAMERA_ALIASES[k] : undefined);
    if (hint) {
      explained.add(k);
      warn(`pixi-effects: ${who}: "${k}" is not a property — ${hint}`);
    }
  }

  if (spec.type === 'camera') {
    const raw = spec as unknown as Record<string, unknown>;
    for (const p of CAMERA_PROPS) {
      if (p in raw) warn(`pixi-effects: ${who}: "${p}" must go inside initial / keyframes, not on the camera itself`);
    }
    for (const k of Object.keys(raw)) {
      const hint = CAMERA_ALIASES[k] ?? LAYER_ALIASES[k];
      if (hint) warn(`pixi-effects: ${who}: "${k}" is not a property — ${hint} (inside initial)`);
    }
    for (const k of keys) {
      if (!explained.has(k) && !CAMERA_PROPS.includes(k)) {
        warn(`pixi-effects: ${who}: "${k}" has no effect on a camera (use ${CAMERA_PROPS.join(', ')})`);
      }
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
  } else {
    for (const k of SKEW_KEYS) {
      if (keys.has(k)) warn(`pixi-effects: ${who}: "${k}" is ignored on threeD layers`);
    }
  }
}
