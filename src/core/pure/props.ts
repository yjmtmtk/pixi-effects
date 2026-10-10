/**
 * What a key of a keyframe means for a target: a plain property, or one of the shorthands the Pixi plugin of GSAP offers
 * (`scale`, `anchor`, `rotation` in degrees, `tint`, `autoAlpha` ...), as accessors the timeline can read and write.
 * One key can be several accessors (`scale: 2` is `scale.x` and `scale.y`); two keys can meet in one (`scale` and `scaleX`).
 */

export type Target = Record<string, unknown>;

export interface Accessor {
  /** Identity inside the target: segments on the same id belong to one channel. */
  id: string;
  get(): any;
  set(value: any): void;
  /**
   * `'color'` is a packed 0xrrggbb number that is tweened per channel; `'css'` is a CSS colour string (`'#ff0000'`, `'rgb(…)'`) tweened as rgba strings; `'raw'` is anything that is not a number (a boolean, a
   * string): it switches when its segment starts; `'fn'` is a value of any kind that a function of the caller moves between
   * two values; the rest are plain numbers.
   */
  kind: 'num' | 'color' | 'css' | 'raw' | 'fn';
  /** `'fn'`: the interpolator between two values. */
  make?(a: any, b: any): (p: number) => any;
  /** Multiplies the value a key gives (degrees to radians). */
  unit: number;
  /** The written number is rounded to 1 / `round`: GSAP keeps six decimals, five for a rotation. */
  round: number;
  /** At the end of a tween (and in a `set`) the exact value is written, not the rounded one: a rotation. */
  exactEnd?: boolean;
  /** `get` is not what `set` writes (autoAlpha's `visible` reads the alpha): every write is made. */
  always?: boolean;
}

const DEG = Math.PI / 180;

const num = (obj: () => Record<string, unknown> | undefined, key: string, id: string, unit = 1): Accessor => ({
  id, kind: 'num', unit, round: 1e6,
  get: () => Number(obj()?.[key]),
  set: (v) => { const o = obj(); if (o) o[key] = v; },
});

function xy(target: Target, base: string, which: 'x' | 'y' | 'both', unit = 1): Accessor[] {
  const o = () => target[base] as Record<string, unknown> | undefined;
  const ax = num(o, 'x', `${base}.x`, unit), ay = num(o, 'y', `${base}.y`, unit);
  return which === 'x' ? [ax] : which === 'y' ? [ay] : [ax, ay];
}

const VEC: [string, string, number][] = [
  ['scale', 'scale', 1], ['anchor', 'anchor', 1], ['pivot', 'pivot', 1], ['skew', 'skew', DEG],
  ['position', 'position', 1], ['tilePosition', 'tilePosition', 1], ['tileScale', 'tileScale', 1],
];

/**
 * `fillColor` and `fillAlpha` reach the timeline as shorthands too; a shape keeps its own colours (live state, redrawn), so a write on the
 * Graphics object is not what is seen: the timeline leaves these alone.
 */
export const PIXI_INERT = new Set(['fillColor', 'fillAlpha']);

/** Accessors for a key under `pixi: { ... }`; `null` when the plugin has no such shorthand. */
export function pixiAccessors(target: Target, key: string): Accessor[] | null {
  for (const [name, base, unit] of VEC) {
    if (key === name) return xy(target, base, 'both', unit);
    if (key === `${name}X`) return xy(target, base, 'x', unit);
    if (key === `${name}Y`) return xy(target, base, 'y', unit);
  }
  switch (key) {
    case 'rotation': return [{ id: 'rotation', kind: 'num', unit: DEG, round: 1e5, exactEnd: true, get: () => Number(target.rotation), set: (v) => { target.rotation = v; } }];
    case 'tint': return [{ id: 'tint', kind: 'color', unit: 1, round: 1, get: () => Number(target.tint), set: (v) => { target.tint = v; } }];
    case 'autoAlpha': return [
      { id: 'alpha', kind: 'num', unit: 1, round: 1e6, get: () => Number(target.alpha), set: (v) => { target.alpha = v; } },
      // `visible` follows the autoAlpha tweens only, not a plain `alpha` tween on the same layer: a channel of its own
      { id: 'visible#auto', kind: 'num', unit: 1, round: 1e6, always: true, get: () => Number(target.alpha), set: (v) => { target.visible = v !== 0; } },
    ];
    default: return null;
  }
}

export function rawAccessor(target: Target, key: string): Accessor {
  return { id: key, kind: 'raw', unit: 1, round: 1, get: () => target[key], set: (v) => { target[key] = v; } };
}

export function cssAccessor(target: Target, key: string): Accessor {
  return { id: key, kind: 'css', unit: 1, round: 1, get: () => target[key], set: (v) => { target[key] = v; } };
}

export function plainAccessor(target: Target, key: string): Accessor {
  return { id: key, kind: 'num', unit: 1, round: 1e6, get: () => Number(target[key]), set: (v) => { target[key] = v; } };
}

/** `'#ff0000'`, `'#f00'`, `'rgb(255,0,0)'` or a number to 0xrrggbb; `null` if it is none of them. */
export function parseColor(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) { const h = m[1]!; return parseInt(h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!, 16); }
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(s);                 // the alpha of #rrggbbaa is not a tint
  if (m) return parseInt(m[1]!, 16);
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i.exec(s);
  if (m) return (Number(m[1]) << 16) | (Number(m[2]) << 8) | Number(m[3]);
  return null;
}

/** A packed colour moved towards another, per channel (cut towards zero), the way the Pixi plugin does it; an overshoot is not clamped. */
export function lerpColor(from: number, to: number, p: number): number {
  const r = lerpByte((from >> 16) & 255, (to >> 16) & 255, p);
  const g = lerpByte((from >> 8) & 255, (to >> 8) & 255, p);
  const b = lerpByte(from & 255, to & 255, p);
  return (r << 16) | (g << 8) | b;   // bitwise, as GSAP does: a channel below zero fills the bytes above it with ones
}

function lerpByte(a: number, b: number, p: number): number {
  return Math.trunc(a + (b - a) * p);
}
