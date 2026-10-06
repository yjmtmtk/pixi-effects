/**
 * Seeded randomness. Everything here is a pure function of its inputs (no
 * wall clock, no `Math.random`), so playback, seeking and export always
 * produce the same pixels.
 */

/** 32-bit integer mix (a murmur3-style finaliser). */
function mix(h: number): number {
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Fold a number (any real, fractions included) into a 32-bit integer. */
function fold(n: number): number {
  if (!Number.isFinite(n)) return 0;
  const i = Math.floor(n);
  const f = n - i;
  return (i | 0) ^ Math.imul(Math.floor(f * 0x100000), 0x9e3779b1);
}

/** The same seed always gives the same number in [0, 1). */
export function rand(seed: number): number {
  return mix(fold(seed) + 0x9e3779b9) / 4294967296;
}

/** A repeatable stream of numbers in [0, 1): `const r = random(7); r(); r(); …` */
export function random(seed: number): () => number {
  let a = (fold(seed) + 0x6d2b79f5) | 0;                 // mulberry32
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth 1-D noise in [-1, 1]: continuous in `x`, a different curve for every `seed`. */
export function noise(x: number, seed = 0): number {
  if (!Number.isFinite(x)) return 0;
  const i = Math.floor(x);
  const f = x - i;
  const s = fold(seed) * 0x27d4eb2d;
  const a = mix((i | 0) + s) / 2147483648 - 1;
  const b = mix(((i + 1) | 0) + s) / 2147483648 - 1;
  const u = f * f * f * (f * (f * 6 - 15) + 10);          // quintic fade
  return a + (b - a) * u;
}
