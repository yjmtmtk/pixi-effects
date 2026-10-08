import type { SequenceSpec } from '../types';
import { collectPropKeys } from '../space/specKeys';
import { suggestName } from './options';
import { layerKeys, kindName, kindsWithKey, PROP_KEYS, STYLE_KEYS } from './layerKeys';

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
  // An sfx or a piece of music without a duration is as long as its sound, which only the audio layer knows (it checks its own keyframes).
  if (spec.type === 'audio' && ((spec as { sfx?: unknown }).sfx !== undefined || (spec as { music?: unknown }).music !== undefined) && spec.duration === undefined) return;
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
  // Every string the layer ever shows: its `text` and any `set: { text }` swap.
  const strings = [spec.text ?? '', ...(spec.keyframes ?? []).map(kf => String((kf.set as Record<string, unknown> | undefined)?.text ?? ''))];
  const hasPlaceholder = strings.some(t => t.includes('{value}'));
  if (hasPlaceholder && !collectPropKeys(spec).has('value')) {
    warn(`pixi-effects: ${describeLayer(spec)}: the text has a {value} placeholder but nothing sets or animates \`value\`, so it prints 0. Set initial: { value: … } or animate it; {value} is reserved for counters (there is no way to print a literal "{value}").`);
  }
  if (collectPropKeys(spec).has('value') && !hasPlaceholder) {
    warn(`pixi-effects: ${describeLayer(spec)}: \`value\` is set or animated but the text has no {value} placeholder, so nothing shows it. Use text: '{value}' (or e.g. '{value} users').`);
  }
}

/**
 * Keys that do not exist, which the library used to ignore without a word (a typo in a layer key, a mistyped property in a keyframe, a
 * style key Pixi does not know). Said once each, with what was probably meant. A warning, never an error. Not checked here: dotted
 * paths (`filters.g.amount`, `three.box.x`: their routers say what is wrong), the names `fillGradient` says itself (`gradientAngle`),
 * and a kind of layer registered elsewhere (`three`).
 */
export function lintKeys(spec: SequenceSpec, warn: Warn = defaultWarn): void {
  const who = describeLayer(spec);
  const valid = layerKeys(spec as { type: string; shape?: string });
  if (valid) {
    for (const key of Object.keys(spec)) {
      if (valid.includes(key) || (spec as unknown as Record<string, unknown>)[key] === undefined) continue;       // a spread that sets a key only when it applies leaves `undefined`
      const guess = suggestName(key, valid.filter(k => k !== 'type'));
      const owners = kindsWithKey(key);
      const belongs = owners.length ? ` (it belongs to ${owners.slice(0, 3).join(', ')})` : '';
      const hint = guess ? ` — did you mean "${guess}"?${belongs}` : belongs;
      warn(`pixi-effects: ${who}: "${key}" is not a ${kindName(spec as { type: string; shape?: string })} key${hint}. Valid keys: ${valid.join(', ')}`);
    }
  }
  const said = new Set<string>();
  const bags: Array<Record<string, unknown> | undefined> = [spec.initial, ...(spec.keyframes ?? []).flatMap(kf => [kf.set, kf.to, kf.from])] as Array<Record<string, unknown> | undefined>;
  for (const bag of bags) {
    for (const key of Object.keys(bag ?? {})) {
      if (bag![key] === undefined) continue;
      if (PROP_KEYS.has(key) || key.includes('.') || /^gradient/i.test(key) || said.has(key)) continue;
      said.add(key);
      const guess = suggestName(key, [...PROP_KEYS]);
      warn(`pixi-effects: ${who}: "${key}" is not an animatable property${guess ? ` — did you mean "${guess}"?` : ''} (in initial, set, to or from). See the cheatsheet for the properties of this kind of layer`);
    }
  }
  if (spec.type === 'text' && spec.style && typeof spec.style === 'object') {
    for (const key of Object.keys(spec.style)) {
      if (STYLE_KEYS.includes(key) || (spec.style as Record<string, unknown>)[key] === undefined) continue;
      const guess = suggestName(key, STYLE_KEYS);
      warn(`pixi-effects: ${who}: style.${key} is not a text style key${guess ? ` — did you mean "${guess}"?` : ''} (it is ignored). Keys: ${STYLE_KEYS.join(', ')}`);
    }
  }
}
