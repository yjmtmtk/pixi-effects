import type { SequenceSpec } from '../types';
import { collectPropKeys } from '../space/specKeys';
import { suggestName } from './options';
import { layerKeys, kindName, kindsWithKey, pictureKeysIgnored, PROP_KEYS, STYLE_KEYS } from './layerKeys';

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
  if (at >= parentDuration) return;                                          // never visible: said above, and its keyframes say nothing more
  const lives = spec.duration ?? Math.max(0, parentDuration - at);          // without a duration a layer lives until its composition ends
  const ms = (x: number) => Math.round(x * 1000) / 1000;
  (spec.keyframes ?? []).forEach((kf, i) => {
    const kat = kf.at ?? 0;
    if (kat >= lives) {
      warn(
        `pixi-effects: ${who}: keyframes[${i}] starts at ${kat}s, after the layer ends (duration ${ms(lives)}s), so it never plays. ` +
        `Keyframe \`at\` is measured from the start of this layer, not from the start of the composition.`,
        'late-keyframe',
      );
      return;
    }
    // Starts in time but is cut off by the layer's end: a FADE (to alpha 0 or 1, or from 0 / 1) that never finishes (a trial: a fade-out that stopped half way, a 1.2 s fade-in on a 0.6 s layer).
    // Not a drift, a fall, a zoom or a decaying glow (to 0.22) that is still going when its layer ends: those are common and on purpose. A `set` is instant, a repeating tween
    // (a blink) and a spring ('auto') are meant to run over, and a cut of under 0.2 s (a few frames: the last keyframe of a generated loop) is nothing.
    const length = kf.duration;
    // a fade ends (almost) opaque or (almost) clear: `to` alpha, or, when only `from` names alpha, the value it fades from (a fade-in `from: { alpha: 0 }` ends where it was)
    const toAlpha = (kf.to as Record<string, unknown> | undefined)?.alpha;
    const fromAlpha = (kf.from as Record<string, unknown> | undefined)?.alpha;
    const nearEnd = (v: unknown) => typeof v === 'number' && (v <= 0.1 || v >= 0.9);
    const fade = toAlpha !== undefined ? nearEnd(toAlpha) : nearEnd(fromAlpha);
    if (fade && typeof length === 'number' && length > 0 && !kf.repeat) {
      const start = kat < 0 ? lives + kat : kat;                              // a negative `at` counts back from the end of the layer
      const cut = (start + length - lives) / length;
      if (start >= 0 && cut > 0.25 && cut * length >= 0.2) {
        warn(
          `pixi-effects: ${who}: keyframes[${i}] runs from ${ms(start)}s to ${ms(start + length)}s but the layer ends at ${ms(lives)}s, so the last ${Math.round(cut * 100)}% of it never plays ` +
          `(a fade stops half way). Keyframe \`at\` is measured from the start of this layer: start it earlier, make it shorter, or make the layer longer.`,
          'late-keyframe',
        );
      }
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

const REMAPPABLE = new Set(['video', 'audio', 'composition']);
/** Top-level names that mean a time remap and have their own message. */
const REMAP_NAMES = new Set(['time', 'timeRemap', 'reverse']);
const TIME_BAGS = ['set', 'to', 'from'] as const;

/** The mistakes a time remap can make (`speed` / `time`), said once when the layer is built. Called from `lintKeys`. */
function lintRemap(spec: SequenceSpec, warn: Warn): void {
  const s = spec as unknown as Record<string, any>;
  const who = describeLayer(spec);
  const kfs: Array<Record<string, any>> = s.keyframes ?? [];
  const bags: Array<Record<string, any> | undefined> = [s.initial, ...kfs.flatMap(kf => TIME_BAGS.map(b => kf[b]))];
  const timeInInitial = !!s.initial && s.initial.time !== undefined;
  const timeInKeyframes = kfs.some(kf => TIME_BAGS.some(b => kf[b] && kf[b].time !== undefined));
  const timed = timeInInitial || timeInKeyframes;
  if (bags.some(bag => bag && bag.speed !== undefined)) {
    warn(`pixi-effects: ${who}: speed is a fixed setting, not an animatable property: write it on the layer (speed: 2); to change the speed over time, animate time (keyframes: [{ at: 0, from: { time: 0 }, to: { time: 4 }, duration: 2, ease: 'power2.in' }])`);
  }
  if (!REMAPPABLE.has(spec.type)) {
    if (timed) warn(`pixi-effects: ${who}: "time" only works on video, audio and composition layers; put this layer in a composition and remap that (it is ignored here)`);
    return;                                                       // a top-level speed here is the key warning's business ("not a ... key")
  }
  if (s.reverse !== undefined) warn(`pixi-effects: ${who}: "reverse" is not a key: write speed: -1 to play backward`);
  if (s.timeRemap !== undefined) warn(`pixi-effects: ${who}: "timeRemap" is not a key: animate time in keyframes (from / to / set), or write speed`);
  if (s.time !== undefined) warn(`pixi-effects: ${who}: "time" belongs in initial or keyframes (initial: { time: 2 }), not on the layer`);
  if (spec.type === 'audio' && (s.sfx !== undefined || s.music !== undefined) && (s.speed !== undefined || timed)) {
    warn(`pixi-effects: ${who}: speed and time do not apply to a synthesised sound (sfx, music); change an sfx's pitch with pitch (semitones), or put it in a composition and remap that`);
    return;
  }
  if (s.speed !== undefined && (typeof s.speed !== 'number' || !Number.isFinite(s.speed) || s.speed === 0)) {
    warn(`pixi-effects: ${who}: speed ${JSON.stringify(s.speed)} cannot be used: write a number other than 0 (negative plays backward); to hold a moment, key time to the same value twice`);
  }
  if (s.speed !== undefined && timeInKeyframes) {
    warn(`pixi-effects: ${who}: speed and keyframed time are both set; time wins and speed is ignored. Use one of them`);
  }
  if (timeInInitial && typeof s.initial.time !== 'number') {
    warn(`pixi-effects: ${who}: initial.time must be a number of seconds, got ${JSON.stringify(s.initial.time)}`);
  }
  kfs.forEach((kf, i) => {
    for (const b of TIME_BAGS) {
      const v = kf[b]?.time;
      if (v !== undefined && typeof v !== 'number' && typeof v !== 'string') warn(`pixi-effects: ${who}: keyframes[${i}].${b}.time must be a number of seconds, got ${JSON.stringify(v)}`);
    }
  });
}

/**
 * Keys that do not exist, which the library used to ignore without a word (a typo in a layer key, a mistyped property in a keyframe, a
 * style key Pixi does not know). Said once each, with what was probably meant. A warning, never an error. Not checked here: dotted
 * paths (`filters.g.amount`, `three.box.x`: their routers say what is wrong), the names `fillGradient` says itself (`gradientAngle`),
 * and a kind of layer registered elsewhere (`three`).
 */
/** Keys the library used to have: the sentence says what to write now. */
const REMOVED_KEYS: Record<string, string> = {
  maskInverted: 'a hole instead of a crop is `mask: { layer: <the mask layer>, invert: true }`',
};

/** The knobs of a sound effect: they are keys of `sfx: { … }`, not of the layer. */
const SFX_KNOBS = new Set(['pitch', 'brightness', 'seed']);

/** Where a layer is and how it is turned: always `initial` or a keyframe, even for a kind of layer that has such a name as a key of another meaning (`anchorX` on a shape). */
const TRANSFORM_KEYS = new Set(['x', 'y', 'z', 'alpha', 'rotation', 'rotationX', 'rotationY', 'scale', 'scaleX', 'scaleY', 'anchor', 'anchorX', 'anchorY',
  'pivot', 'pivotX', 'pivotY', 'skew', 'skewX', 'skewY', 'position', 'positionX', 'positionY', 'tint', 'visible', 'autoAlpha']);

export function lintKeys(spec: SequenceSpec, warn: Warn = defaultWarn): void {
  const who = describeLayer(spec);
  const valid = layerKeys(spec as { type: string; shape?: string });
  if (valid) {
    for (const key of Object.keys(spec)) {
      if (valid.includes(key) || (spec as unknown as Record<string, unknown>)[key] === undefined) continue;       // a spread that sets a key only when it applies leaves `undefined`
      if (REMAPPABLE.has(spec.type) && REMAP_NAMES.has(key)) continue;                                            // lintRemap has its own message for these
      if (REMOVED_KEYS[key]) { warn(`pixi-effects: ${who}: "${key}" is not a ${kindName(spec as { type: string; shape?: string })} key: ${REMOVED_KEYS[key]}`); continue; }
      // `pitch`, `brightness`, `seed` are knobs of the sound effect, they go inside `sfx` (a trial: three agents wrote them beside `sfx:`)
      if (spec.type === 'audio' && SFX_KNOBS.has(key) && (spec as { sfx?: unknown }).sfx !== undefined) {
        const sfx = (spec as { sfx?: unknown }).sfx;
        const v = (spec as unknown as Record<string, unknown>)[key];
        const shown = typeof v === 'number' || (typeof v === 'string' && v.length <= 24) ? JSON.stringify(v) : '…';
        const where = typeof sfx === 'string' ? `sfx: { preset: '${sfx}', ${key}: ${shown} }` : `inside the sfx object you have (sfx: { …, ${key}: ${shown} })`;
        warn(`pixi-effects: ${who}: "${key}" is a knob of the sound effect, so it is ignored beside \`sfx\`: write it ${where}${key === 'pitch' ? ' (pitch is in semitones, ±24: 12 is an octave up)' : key === 'brightness' ? ' (brightness is −1 dark … 1 bright)' : ''}`);
        continue;
      }
      // `z`, `x`, `alpha`, `rotationX` … are properties of the picture: they go in `initial` (or a keyframe), not on the layer. Say that, not a guess at another key.
      if (TRANSFORM_KEYS.has(key) || (PROP_KEYS.has(key) && kindsWithKey(key).length === 0)) {                 // (a key some other kind of layer owns, `radius` on a rect, keeps its "it belongs to" sentence below)
        const v = (spec as unknown as Record<string, unknown>)[key];
        const shown = typeof v === 'number' || (typeof v === 'string' && v.length <= 24) ? JSON.stringify(v) : '…';
        warn(`pixi-effects: ${who}: "${key}" is a property, not a ${kindName(spec as { type: string; shape?: string })} key, so it is ignored: write it in initial (initial: { ${key}: ${shown} }) or in a keyframe`);
        continue;
      }
      const guess = suggestName(key, valid.filter(k => k !== 'type'));
      const owners = kindsWithKey(key);
      const belongs = owners.length ? ` (it belongs to ${owners.slice(0, 3).join(', ')})` : '';
      const hint = guess ? ` — did you mean "${guess}"?${belongs}` : belongs;
      warn(`pixi-effects: ${who}: "${key}" is not a ${kindName(spec as { type: string; shape?: string })} key${hint}. Valid keys: ${valid.join(', ')}`);
    }
  }
  for (const { key, why } of pictureKeysIgnored(spec as unknown as { type: string } & Record<string, unknown>)) warn(`pixi-effects: ${who}: "${key}" does nothing on ${why}`);
  lintRemap(spec, warn);
  const said = new Set<string>();
  const bags: Array<Record<string, unknown> | undefined> = [spec.initial, ...(spec.keyframes ?? []).flatMap(kf => [kf.set, kf.to, kf.from])] as Array<Record<string, unknown> | undefined>;
  for (const bag of bags) {
    for (const key of Object.keys(bag ?? {})) {
      if (bag![key] === undefined) continue;
      if (PROP_KEYS.has(key) || key.includes('.') || /^gradient/i.test(key) || said.has(key) || key === 'speed') continue;     // (speed: lintRemap says what to write)
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
