import { collectPropKeys } from './specKeys';
import { describeLayer } from '../core/lint';
import { focusProblems } from './focus';
import { fogProblems, lightLayerProblems } from './lightChecks';
import type { SequenceSpec } from '../types';

type Warn = (message: string) => void;
const defaultWarn: Warn = m => console.warn(m);

const FOV_HINT = 'perspective is the camera\'s "fov" — add a { type: "camera" } layer and set fov in its initial / keyframes';

const DOF_HINT = 'depth of field is the camera\'s "focus" (the plane that is sharp: a layer name or a z) and "aperture" (how shallow: 0 = off, 30 = default) — put them in the camera\'s initial / keyframes';

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
  depthOfField: DOF_HINT, dof: DOF_HINT, focalDistance: DOF_HINT, focusDistance: DOF_HINT, fStop: DOF_HINT, blurAmount: DOF_HINT,
};

const CAMERA_PROPS = ['x', 'y', 'z', 'fov', 'focus', 'aperture', 'lookAtX', 'lookAtY', 'lookAtZ', 'offsetX', 'offsetY', 'offsetZ', 'lookOffsetX', 'lookOffsetY', 'lookOffsetZ', 'fogNear', 'fogFar', 'fogColor', 'fogAmount'];
const NEEDS_THREE_D = ['z', 'rotationX', 'rotationY'];
/** Camera-only names that the animatable-property check lets through on any layer. */
const CAMERA_ONLY = ['focus', 'aperture', 'fogNear', 'fogFar', 'fogColor', 'fogAmount'];
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

  if (spec.type === 'light') {
    for (const m of lightLayerProblems(spec)) warn(`pixi-effects: ${who}: ${m}`);
    return;
  }

  if (spec.type === 'camera') {
    for (const m of fogProblems(spec)) warn(`pixi-effects: ${who}: ${m}`);
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

  for (const k of CAMERA_ONLY) {
    if (keys.has(k)) warn(`pixi-effects: ${who}: "${k}" is a camera property and does nothing on this layer: write it in the initial / keyframes of a { type: 'camera' } layer`);
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

/** The layer names a camera's `focus` points at: missing, not threeD, or with a z that moves later. One call per camera, at build time. */
export function lintFocus(camera: SequenceSpec, siblings: readonly SequenceSpec[], warn: Warn = defaultWarn): void {
  if (camera.type !== 'camera') return;
  const who = describeLayer(camera);
  for (const p of focusProblems(camera, siblings)) {
    if (p.kind === 'missing') {
      warn(`pixi-effects: ${who}: focus: no layer named "${p.name}"${p.hint ? `; did you mean "${p.hint}"?` : ''} (the z = 0 plane is used). Write a threeD layer's name or a z number`);
    } else if (p.kind === 'not-threeD') {
      warn(`pixi-effects: ${who}: focus "${p.name}" is not a threeD layer, so it has no depth (the z = 0 plane is used). Write a threeD layer's name or a z number`);
    } else if (p.kind === 'duplicate') {
      warn(`pixi-effects: ${who}: focus "${p.name}": ${p.count} layers are named "${p.name}"; the first threeD one is used. Give the layers different names`);
    } else {
      warn(`pixi-effects: ${who}: focus "${p.name}" reads only the first z of that layer; its z moves later and the focus does not follow. Animate focus itself with numbers to follow it`);
    }
  }
}
