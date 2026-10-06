import type { SequenceSpec } from '../types';
import { collectPropKeys } from '../space/specKeys';

type Warn = (message: string, kind?: 'late-keyframe') => void;
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
  // An sfx without a duration is as long as its sound, which only the audio layer knows (it checks its own keyframes).
  if (spec.type === 'audio' && (spec as { sfx?: unknown }).sfx !== undefined && spec.duration === undefined) return;
  const duration = spec.duration ?? parentDuration;
  (spec.keyframes ?? []).forEach((kf, i) => {
    const kat = kf.at ?? 0;
    if (kat >= duration) {
      warn(
        `pixi-effects: ${who}: keyframes[${i}] starts at ${kat}s, after the layer ends (duration ${duration}s), so it never plays. ` +
        `Keyframe \`at\` is measured from the start of this layer, not from the start of the composition.`,
        'late-keyframe',
      );
    }
  });
}

/**
 * A loop that builds a hundred layers makes the same mistake a hundred times. Print the first few in full and
 * say how many more there are: the rest are the same loop.
 */
export function summarizeWarnings(messages: string[], shown = 3): string[] {
  if (messages.length <= shown) return messages;
  return [...messages.slice(0, shown), `pixi-effects: ${messages.length - shown} more layers with the same problem (the same loop or helper is probably building them): fix the ones above and these go away.`];
}

/** A text layer that animates `value` but has nowhere to print it. */
export function lintText(spec: SequenceSpec, warn: Warn = defaultWarn): void {
  if (spec.type !== 'text') return;
  if ((spec.text ?? '').includes('{value}') && !collectPropKeys(spec).has('value')) {
    warn(`pixi-effects: ${describeLayer(spec)}: the text has a {value} placeholder but nothing sets or animates \`value\`, so it prints 0. Set initial: { value: … } or animate it; {value} is reserved for counters (there is no way to print a literal "{value}").`);
  }
  if (collectPropKeys(spec).has('value') && !(spec.text ?? '').includes('{value}')) {
    warn(`pixi-effects: ${describeLayer(spec)}: \`value\` is set or animated but the text has no {value} placeholder, so nothing shows it. Use text: '{value}' (or e.g. '{value} users').`);
  }
}
