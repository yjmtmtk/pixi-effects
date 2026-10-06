import type { SequenceSpec } from '../types';
import { collectPropKeys } from '../space/specKeys';

type Warn = (message: string) => void;
const defaultWarn: Warn = m => console.warn(m);

/** "layer "name"" or "unnamed text layer" — how warnings refer to a sequence. */
export function describeLayer(spec: { name?: string; type: string }): string {
  return spec.name ? `layer "${spec.name}"` : `unnamed ${spec.type} layer`;
}

/**
 * Timing mistakes that otherwise fail silently: a layer that starts after its
 * composition has ended, or a keyframe that starts after its own layer has
 * ended (the usual cause: writing keyframe `at` in composition time instead of
 * time since the start of the layer).
 */
export function lintTiming(spec: SequenceSpec, parentDuration: number, warn: Warn = defaultWarn): void {
  const who = describeLayer(spec);
  const at = spec.at ?? 0;
  if (at >= parentDuration) {
    warn(`pixi-effects: ${who} starts at ${at}s, after its composition ends (${parentDuration}s), so it is never visible`);
  }
  const duration = spec.duration ?? parentDuration;
  (spec.keyframes ?? []).forEach((kf, i) => {
    const kat = kf.at ?? 0;
    if (kat >= duration) {
      warn(
        `pixi-effects: ${who}: keyframes[${i}] starts at ${kat}s, after the layer ends (duration ${duration}s), so it never plays. ` +
        `Keyframe \`at\` is measured from the start of this layer, not from the start of the composition.`,
      );
    }
  });
}

/** A text layer that animates `value` but has nowhere to print it. */
export function lintText(spec: SequenceSpec, warn: Warn = defaultWarn): void {
  if (spec.type !== 'text') return;
  if (collectPropKeys(spec).has('value') && !(spec.text ?? '').includes('{value}')) {
    warn(`pixi-effects: ${describeLayer(spec)}: \`value\` is set or animated but the text has no {value} placeholder, so nothing shows it. Use text: '{value}' (or e.g. '{value} users').`);
  }
}
