import type { Keyframe, TextSequenceSpec } from '../types';
import { warnUnknownOptions, suggestName } from '../core/options';
import { measureText, splitText, type MeasureStyle, type TextPiece } from '../text/measure';
import { stagger, type StaggerOptions } from './stagger';
import { wiggle } from './wiggle';

const TWEEN_KEYS = ['preset', 'from', 'to', 'duration', 'ease'] as const;      // (`stagger` is read for `out` only, below)
const TIME_KEYS = ['at', 'delay', 'start', 'begin', 'time'];
const KEYS = ['by', 'x', 'y', 'align', 'vertical', 'name', 'at', 'duration', 'in', 'out', 'stagger', 'idle', 'styleFor'] as const;

/** Where a piece starts (`from`), as offsets in x / y and absolute values for the rest, and how it gets to its resting place. */
const PRESETS = {
  rise: { from: { y: 40, alpha: 0 }, duration: 0.5, ease: 'back.out(2)' },
  drop: { from: { y: -50, alpha: 0 }, duration: 0.7, ease: 'bounce.out' },
  fade: { from: { alpha: 0 }, duration: 0.5, ease: 'power1.out' },
  pop: { from: { scale: 0, alpha: 0 }, duration: 0.45, ease: 'back.out(2.4)' },
  zoom: { from: { scale: 2.5, alpha: 0 }, duration: 0.6, ease: 'power3.out' },
  slide: { from: { x: -60, alpha: 0 }, duration: 0.5, ease: 'power3.out' },
  spin: { from: { rotation: -90, scale: 0, alpha: 0 }, duration: 0.6, ease: 'back.out(1.7)' },
} as const;
export type TextPreset = keyof typeof PRESETS;
const PRESET_NAMES = Object.keys(PRESETS);

export interface AnimateTextTween {
  /** Start from this preset and change what you give below. */
  preset?: TextPreset;
  /** The hidden state: `x` / `y` are offsets from the resting place, everything else (`alpha`, `scale`, …) is absolute; `rotation` too, from the resting rotation (0, except the turned glyphs of vertical text, which rest at 90°). */
  from?: Record<string, number>;
  /** The resting state, for properties that have none of their own (`alpha` 1, `scale` 1, `rotation` 0 and the place are known). */
  to?: Record<string, number>;
  /** Seconds each piece takes. */
  duration?: number;
  /** Ease name. */
  ease?: string;
  /** `out` only: the composition second the exit starts at (every piece leaves in the same wave from then on, and holds its exit state until the layer ends). Without it the exit is the end of the layer run backwards. Not for `in` (an entrance starts with its piece: the options' `at`). */
  at?: number;
  /** `out` only: the wave of the exit, when it should not be the entrance's: `0` (all pieces leave at once), or `{ each: 0.1 }` and the other {@link stagger} options. Default: the same wave as the entrance (the options' `stagger`). */
  stagger?: StaggerOptions | number;
}

export interface AnimateTextOptions {
  /** What a piece is: a character (default), a word or a line. */
  by?: 'chars' | 'words' | 'lines';
  /** Where the text goes: `x` is its left edge, or its centre / right edge with `align`. */
  x?: number;
  /** Top of the first line. */
  y?: number;
  align?: 'left' | 'center' | 'right';
  /** Vertical writing: characters go down a column, a new line is a new column to the left, and `x` is the RIGHT edge of the first column (see `splitText`). Punctuation and the long vowel mark are placed and turned the way tategaki wants. */
  vertical?: boolean;
  /** Layers are named `<name>-0`, `<name>-1`, … (default `'text'`). */
  name?: string;
  /** When the first piece starts, in composition seconds. Default 0. */
  at?: number;
  /** Seconds from `at` until every piece is gone, the last one included. Required. */
  duration: number;
  /** How a piece arrives: a preset (`'rise'` default, `'drop'`, `'fade'`, `'pop'`, `'zoom'`, `'slide'`, `'spin'`), your own tween, or `false` for none. */
  in?: TextPreset | AnimateTextTween | false;
  /** How a piece leaves, in the same wave (the entrance backwards, eased the other way). With `{ preset, at: T }` the exit starts at composition second T; without `at` it leaves from the END of the layer (`at + duration`), the last piece finishing exactly then. Default none. */
  out?: TextPreset | AnimateTextTween | false;
  /** The wave: see {@link stagger}. Default `{ each: 0.04 }`. */
  stagger?: StaggerOptions | number;
  /** A seeded drift between the entrance and the exit, each piece its own: `{ y: 4, rotation: 1 }` (amounts), `freq` (default 1 target per second), `seed`. */
  idle?: { x?: number; y?: number; rotation?: number; scale?: number; freq?: number; seed?: number };
  /** Style changes for one piece (a colour for the first letter): merged over `style`. */
  styleFor?: (piece: TextPiece) => MeasureStyle;
}

interface Resolved { from: Record<string, number>; to: Record<string, number>; duration: number; ease: string; /** `out` only: the composition second the exit starts at. */ at?: number; /** `out` only: its own wave. */ stagger?: StaggerOptions }

/**
 * Per-character, per-word or per-line text animation in one call: one text layer per piece, laid out exactly like the
 * whole text, each entering (and optionally leaving) in a wave. It is `splitText` + `stagger` + a preset, so the result
 * is plain layers you can spread into `sequences`, add to, or change.
 *
 * ```js
 * ...animateText('Hello world', style, { x: 640, y: 300, align: 'center', at: 0.5, duration: 5,
 *                                        in: 'rise', out: 'fade', stagger: { each: 0.05, from: 'center' } })
 * ```
 *
 * Pieces rotate and scale about their own centre. All pieces are gone at `at + duration`.
 */
export function animateText(text: string, style: MeasureStyle, options: AnimateTextOptions): TextSequenceSpec[] {
  warnUnknownOptions('animateText()', options, KEYS);
  const { by = 'chars', x = 0, y = 0, align = 'left', vertical = false, name = 'text', at = 0, duration, idle, styleFor } = options;
  for (const [n, v] of [['x', x], ['y', y]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`animateText(): ${n} must be a number of pixels (e.g. ${n}: 640), got ${JSON.stringify(v)}. The letters are measured once, when the layers are made, so an expression such as 'GW/2' cannot be used here: compute the number (W / 2) yourself. \`y\` is the TOP of the line.`);
    }
  }
  if (!(Number.isFinite(duration) && duration > 0)) throw new Error(`animateText(): duration must be a positive number of seconds (how long until the last piece is gone), got ${duration}`);
  const pieces = splitText(text, style, { by, x, y, align, ...(vertical ? { vertical } : {}) });
  if (pieces.length === 0) return [];

  const lineHeight = measureText('M', style).height;
  const given = <T>(v: T | false | 'none' | undefined): T | undefined => (v === false || v === 'none' ? undefined : v);        // (an agent wrote out: 'none': it means what false means)
  const inSpec = options.in === undefined ? 'rise' : given(options.in), outSpec = given(options.out);
  const inTween = inSpec === undefined ? null : resolveTween(inSpec, 'in');
  const outTween = outSpec === undefined ? null : resolveTween(outSpec, 'out');
  const delays = stagger(pieces.length, options.stagger ?? { each: 0.04 });
  const wave = Math.max(...delays);
  const outDelays = outTween?.stagger ? stagger(pieces.length, outTween.stagger) : delays;           // the exit's own wave, or the entrance's
  const outWave = Math.max(...outDelays);
  const lead = Math.max(...delays.map((d, i) => d - outDelays[i]!));                                 // how much later a piece enters than it leaves, after the exit's start
  const need = (inTween?.duration ?? 0) + (outTween ? outTween.duration + outWave + lead : wave);
  if (duration < need - 1e-9) {
    throw new Error(`animateText(): duration ${duration} is too short for this wave: the entrance${outTween ? ', the exit' : ''} and the stagger need at least ${+need.toFixed(3)} s`);
  }

  const end = at + duration;
  if (outTween?.at !== undefined) {
    if (outTween.at < at - 1e-9) console.warn(`pixi-effects: animateText(): out.at ${outTween.at} is before the layer starts (at ${at}): the exit starts with the piece; use out.at ≥ ${at}`);
    const latest = end - outTween.duration - outWave;
    if (outTween.at > latest + 1e-9) console.warn(`pixi-effects: animateText(): out.at ${outTween.at} leaves after the layer ends (the exit and the wave take ${+(outTween.duration + outWave).toFixed(3)} s and the layer ends at ${+end.toFixed(3)} s): use out.at ≤ ${+latest.toFixed(3)}, or a longer duration`);
    if (inTween && outTween.at - at < inTween.duration + lead - 1e-9) console.warn(`pixi-effects: animateText(): out.at ${outTween.at} is before the entrance has finished (it takes ${inTween.duration} s from at ${at}): use out.at ≥ ${+(at + inTween.duration + lead).toFixed(3)}`);
  }
  return pieces.map((p, i) => {
    const cx = p.cx ?? p.x + p.width / 2, cy = p.cy ?? p.y + lineHeight / 2;                   // vertical pieces come with their centre and a turn
    const rest: Record<string, number> = { x: cx, y: cy, alpha: 1, scale: 1, scaleX: 1, scaleY: 1, rotation: p.rotation ?? 0 };
    const start = at + delays[i]!;
    const len = end - start;
    const keyframes: Keyframe[] = [];
    const place = (key: string, v: number) => (key === 'x' || key === 'y' || key === 'rotation' ? rest[key]! + v : v);        // (a turned glyph of vertical text rests at 90°: a spin from -90 is a quarter turn for it too)
    if (inTween) {
      keyframes.push({
        at: 0, duration: inTween.duration, ease: inTween.ease,
        from: Object.fromEntries(Object.entries(inTween.from).map(([k, v]) => [k, place(k, v)])),
        to: Object.fromEntries(Object.keys(inTween.from).map(k => [k, inTween.to[k] ?? rest[k]!])),
      });
    }
    let idleEnd = len;
    if (outTween) {
      // `out.at` (composition seconds) starts every piece's exit at the same local time (their own starts shift by their delays, so does the wave);
      // without it the exit is the end of the layer run backwards: the last piece finishes exactly at the end
      const begin = outTween.at !== undefined ? undefined : outTween.duration + (outWave - outDelays[i]!);      // seconds before this piece's end
      const local = outTween.at !== undefined ? Math.max(0, (outTween.at - at) + (outDelays[i]! - delays[i]!)) : -begin!;       // (a negative keyframe time means "from the end", so an `out.at` before the start is held at 0)
      idleEnd = outTween.at !== undefined ? local : len - begin!;
      keyframes.push({
        at: local, duration: outTween.duration, ease: outTween.ease,
        from: Object.fromEntries(Object.keys(outTween.from).map(k => [k, outTween.to[k] ?? rest[k]!])),
        to: Object.fromEntries(Object.entries(outTween.from).map(([k, v]) => [k, place(k, v)])),
      });
    }
    if (idle) {
      const props: Record<string, { around: number; amp: number }> = {};
      for (const k of ['x', 'y', 'rotation', 'scale'] as const) if (idle[k] !== undefined) props[k] = { around: rest[k]!, amp: idle[k]! };
      const freq = idle.freq ?? 1;
      const from = inTween?.duration ?? 0;
      if (Object.keys(props).length > 0 && idleEnd - from >= 1 / freq - 1e-9) {
        keyframes.push(...wiggle({ at: from, duration: idleEnd - from, freq, seed: (idle.seed ?? 0) * 1000 + i, props }));
      }
    }
    return {
      type: 'text', name: `${name}-${i}`, text: p.text, style: styleFor ? { ...style, ...styleFor(p) } : style,
      at: start, duration: len,
      initial: { x: cx, y: cy, anchorX: 0.5, anchorY: 0.5, ...(rest.rotation !== 0 ? { rotation: rest.rotation } : {}) },
      keyframes,
    } as TextSequenceSpec;
  });
}

function resolveTween(spec: TextPreset | AnimateTextTween, which: 'in' | 'out'): Resolved {
  const t: AnimateTextTween = typeof spec === 'string' ? { preset: spec } : spec;
  if (typeof spec === 'object' && spec) {
    for (const key of Object.keys(spec)) {
      if ((TWEEN_KEYS as readonly string[]).includes(key)) continue;
      if (key === 'stagger') {
        if (which === 'in') console.warn('pixi-effects: animateText(): in.stagger is ignored: the entrance wave is the options\' `stagger` (only `out` can have a wave of its own: out: { stagger: 0 } leaves all at once)');
        continue;
      }
      if (which === 'out' && key === 'at') {
        if (typeof (spec as AnimateTextTween & { at?: unknown }).at !== 'number' || !Number.isFinite((spec as { at?: number }).at)) console.warn(`pixi-effects: animateText(): out.at must be a number of seconds (the composition second the exit starts at), got ${JSON.stringify((spec as { at?: unknown }).at)}; ignored`);
        continue;
      }
      if (TIME_KEYS.includes(key)) {
        // a time is never read here: the piece's own time comes from the options' `at` and `duration`; an `out` starts at its own `at`, or runs backwards from the END of the layer
        console.warn(`pixi-effects: animateText(): ${which}.${key} ("${key}") is ignored: ${which === 'out' ? 'an exit starts at out.at (composition seconds); without it it leaves from the END of the layer (at + duration)' : 'the entrance starts when the piece starts (the options\' `at`, plus the stagger), and the layer lasts `duration`'}`);
      } else warnUnknownOptions(`animateText() ${which}`, { [key]: 1 }, TWEEN_KEYS);
    }
  }
  if (t.preset !== undefined && !(t.preset in PRESETS)) {
    const guess = suggestName(String(t.preset), PRESET_NAMES);
    throw new Error(`animateText(): ${which} "${t.preset}" is not a preset${guess ? `; did you mean "${guess}"?` : ''} (presets: ${PRESET_NAMES.map(n => `"${n}"`).join(', ')}; for no ${which === 'out' ? 'exit: omit `out` or write out: false (the pieces stay until the layer ends)' : 'entrance: in: false'})`);
  }
  const base = t.preset ? PRESETS[t.preset] : undefined;
  const from: Record<string, number> = { ...(base?.from ?? {}), ...(t.from ?? {}) };
  const to = t.to ?? {};
  const known = new Set(['x', 'y', 'alpha', 'scale', 'scaleX', 'scaleY', 'rotation']);
  for (const k of Object.keys(from)) {
    if (!known.has(k) && to[k] === undefined) throw new Error(`animateText(): ${which}.from has "${k}", which has no resting value; give ${which}.to: { ${k}: … }`);
  }
  if (Object.keys(from).length === 0) {
    throw new Error(`animateText(): ${which} needs a preset or a from${which === 'out' && Object.keys(to).length ? ` — ${which} takes \`from\`: the state the piece leaves to (out: { from: { y: 18, alpha: 0 } }); \`to\` is only the resting value of a property that has none` : ''}`);
  }
  let ease = t.ease ?? base?.ease ?? 'power2.out';
  if (which === 'out' && t.ease === undefined) ease = ease.replace('.out', '.in');
  const at = which === 'out' && typeof t.at === 'number' && Number.isFinite(t.at) ? t.at : undefined;
  const wave = which === 'out' && t.stagger !== undefined ? (typeof t.stagger === 'number' ? { each: t.stagger } : t.stagger) : undefined;
  return { from, to: { ...to }, duration: t.duration ?? base?.duration ?? 0.5, ease, ...(at !== undefined ? { at } : {}), ...(wave ? { stagger: wave } : {}) };
}
