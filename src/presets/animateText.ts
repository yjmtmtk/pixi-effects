import type { Keyframe, TextSequenceSpec } from '../types';
import { warnUnknownOptions, suggestName } from '../core/options';
import { measureText, splitText, type MeasureStyle, type TextPiece } from '../text/measure';
import { stagger, type StaggerOptions } from './stagger';
import { wiggle } from './wiggle';

const KEYS = ['by', 'x', 'y', 'align', 'name', 'at', 'duration', 'in', 'out', 'stagger', 'idle', 'styleFor'] as const;

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
  /** The hidden state: `x` / `y` are offsets from the resting place, everything else (`alpha`, `scale`, `rotation`, …) is absolute. */
  from?: Record<string, number>;
  /** The resting state, for properties that have none of their own (`alpha` 1, `scale` 1, `rotation` 0 and the place are known). */
  to?: Record<string, number>;
  /** Seconds each piece takes. */
  duration?: number;
  /** GSAP ease. */
  ease?: string;
}

export interface AnimateTextOptions {
  /** What a piece is: a character (default), a word or a line. */
  by?: 'chars' | 'words' | 'lines';
  /** Where the text goes: `x` is its left edge, or its centre / right edge with `align`. */
  x?: number;
  /** Top of the first line. */
  y?: number;
  align?: 'left' | 'center' | 'right';
  /** Layers are named `<name>-0`, `<name>-1`, … (default `'text'`). */
  name?: string;
  /** When the first piece starts, in composition seconds. Default 0. */
  at?: number;
  /** Seconds from `at` until every piece is gone, the last one included. Required. */
  duration: number;
  /** How a piece arrives: a preset (`'rise'` default, `'drop'`, `'fade'`, `'pop'`, `'zoom'`, `'slide'`, `'spin'`), your own tween, or `false` for none. */
  in?: TextPreset | AnimateTextTween | false;
  /** How a piece leaves, in the same wave (the entrance backwards, eased the other way). Default none. */
  out?: TextPreset | AnimateTextTween | false;
  /** The wave: see {@link stagger}. Default `{ each: 0.04 }`. */
  stagger?: StaggerOptions;
  /** A seeded drift between the entrance and the exit, each piece its own: `{ y: 4, rotation: 1 }` (amounts), `freq` (default 1 target per second), `seed`. */
  idle?: { x?: number; y?: number; rotation?: number; scale?: number; freq?: number; seed?: number };
  /** Style changes for one piece (a colour for the first letter): merged over `style`. */
  styleFor?: (piece: TextPiece) => MeasureStyle;
}

interface Resolved { from: Record<string, number>; to: Record<string, number>; duration: number; ease: string }

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
  const { by = 'chars', x = 0, y = 0, align = 'left', name = 'text', at = 0, duration, idle, styleFor } = options;
  for (const [n, v] of [['x', x], ['y', y]] as const) {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      throw new Error(`animateText(): ${n} must be a number of pixels (e.g. ${n}: 640), got ${JSON.stringify(v)}. The letters are measured once, when the layers are made, so an expression such as 'GW/2' cannot be used here: compute the number (W / 2) yourself. \`y\` is the TOP of the line.`);
    }
  }
  if (!(Number.isFinite(duration) && duration > 0)) throw new Error(`animateText(): duration must be a positive number of seconds (how long until the last piece is gone), got ${duration}`);
  const pieces = splitText(text, style, { by, x, y, align });
  if (pieces.length === 0) return [];

  const lineHeight = measureText('M', style).height;
  const inTween = options.in === false ? null : resolveTween(options.in ?? 'rise', 'in');
  const outTween = options.out === undefined || options.out === false ? null : resolveTween(options.out, 'out');
  const delays = stagger(pieces.length, options.stagger ?? { each: 0.04 });
  const wave = Math.max(...delays);
  const need = (inTween?.duration ?? 0) + (outTween?.duration ?? 0) + wave;
  if (duration < need - 1e-9) {
    throw new Error(`animateText(): duration ${duration} is too short for this wave: the entrance${outTween ? ', the exit' : ''} and the stagger need at least ${+need.toFixed(3)} s`);
  }

  const end = at + duration;
  return pieces.map((p, i) => {
    const cx = p.x + p.width / 2, cy = p.y + lineHeight / 2;
    const rest: Record<string, number> = { x: cx, y: cy, alpha: 1, scale: 1, scaleX: 1, scaleY: 1, rotation: 0 };
    const start = at + delays[i]!;
    const len = end - start;
    const keyframes: Keyframe[] = [];
    const place = (key: string, v: number) => (key === 'x' || key === 'y' ? rest[key]! + v : v);
    if (inTween) {
      keyframes.push({
        at: 0, duration: inTween.duration, ease: inTween.ease,
        from: Object.fromEntries(Object.entries(inTween.from).map(([k, v]) => [k, place(k, v)])),
        to: Object.fromEntries(Object.keys(inTween.from).map(k => [k, inTween.to[k] ?? rest[k]!])),
      });
    }
    let idleEnd = len;
    if (outTween) {
      const begin = outTween.duration + (wave - delays[i]!);                        // seconds before this piece's end
      idleEnd = len - begin;
      keyframes.push({
        at: -begin, duration: outTween.duration, ease: outTween.ease,
        from: Object.fromEntries(Object.keys(outTween.from).map(k => [k, outTween.to[k] ?? rest[k]!])),
        to: Object.fromEntries(Object.entries(outTween.from).map(([k, v]) => [k, place(k, v)])),
      });
    }
    if (idle) {
      const props: Record<string, { around: number; amp: number }> = {};
      for (const k of ['x', 'y', 'rotation', 'scale'] as const) if (idle[k] !== undefined) props[k] = { around: rest[k]!, amp: idle[k]! };
      const freq = idle.freq ?? 1;
      const from = inTween?.duration ?? 0;
      if (Object.keys(props).length > 0 && idleEnd - from >= 1 / freq) {
        keyframes.push(...wiggle({ at: from, duration: idleEnd - from, freq, seed: (idle.seed ?? 0) * 1000 + i, props }));
      }
    }
    return {
      type: 'text', name: `${name}-${i}`, text: p.text, style: styleFor ? { ...style, ...styleFor(p) } : style,
      at: start, duration: len,
      initial: { x: cx, y: cy, anchorX: 0.5, anchorY: 0.5 },
      keyframes,
    } as TextSequenceSpec;
  });
}

function resolveTween(spec: TextPreset | AnimateTextTween, which: 'in' | 'out'): Resolved {
  const t: AnimateTextTween = typeof spec === 'string' ? { preset: spec } : spec;
  if (t.preset !== undefined && !(t.preset in PRESETS)) {
    const guess = suggestName(String(t.preset), PRESET_NAMES);
    throw new Error(`animateText(): ${which} "${t.preset}" is not a preset${guess ? `; did you mean "${guess}"?` : ''} (presets: ${PRESET_NAMES.map(n => `"${n}"`).join(', ')})`);
  }
  const base = t.preset ? PRESETS[t.preset] : undefined;
  const from: Record<string, number> = { ...(base?.from ?? {}), ...(t.from ?? {}) };
  const to = t.to ?? {};
  const known = new Set(['x', 'y', 'alpha', 'scale', 'scaleX', 'scaleY', 'rotation']);
  for (const k of Object.keys(from)) {
    if (!known.has(k) && to[k] === undefined) throw new Error(`animateText(): ${which}.from has "${k}", which has no resting value; give ${which}.to: { ${k}: … }`);
  }
  if (Object.keys(from).length === 0) throw new Error(`animateText(): ${which} needs a preset or a from`);
  let ease = t.ease ?? base?.ease ?? 'power2.out';
  if (which === 'out' && t.ease === undefined) ease = ease.replace('.out', '.in');
  return { from, to: { ...to }, duration: t.duration ?? base?.duration ?? 0.5, ease };
}
