/**
 * The eases of a timeline of our own: Penner's equations as GSAP names them (`power2.out`, `back.out(1.7)`, `elastic.out(1, 0.3)`, `steps(5)`),
 * plus our `spring(...)` and `cubic-bezier(...)`. Checked against `gsap.parseEase` point by point (tests/core/pure/ease.test.ts).
 */
import { parseSpring, springEase } from '../spring';
import { parseCubicBezier, cubicBezierEase } from '../cubicBezier';

export type EaseFn = (p: number) => number;

const PI = Math.PI;
const power = (strength: number) => ({
  in: (p: number) => Math.pow(p, strength),
  out: (p: number) => 1 - Math.pow(1 - p, strength),
  inOut: (p: number) => (p < 0.5 ? 0.5 * Math.pow(2 * p, strength) : 1 - 0.5 * Math.pow(2 * (1 - p), strength)),
});

type Trio = { in: EaseFn; out: EaseFn; inOut: EaseFn };
const fromOut = (out: EaseFn): Trio => ({
  in: (p) => 1 - out(1 - p),
  out,
  inOut: (p) => (p < 0.5 ? 0.5 * (1 - out(1 - 2 * p)) : 0.5 + 0.5 * out(2 * p - 1)),
});

/** GSAP defines only the `in` of these and mirrors the others from it, which is what keeps the ends exactly 0 and 1. */
const mirrored = (easeIn: EaseFn): Trio => ({
  in: easeIn,
  out: (p) => 1 - easeIn(1 - p),
  inOut: (p) => (p < 0.5 ? easeIn(p * 2) / 2 : 1 - easeIn((1 - p) * 2) / 2),
});
const sine = mirrored((p) => (p === 1 ? 1 : -Math.cos(p * PI / 2) + 1));
const circ = mirrored((p) => -(Math.sqrt(1 - p * p) - 1));
// GSAP blends the textbook 2^(10(p-1)) with p^6(1-p) so that the curve lands exactly on 1; out and inOut are mirrored from it.
const expoIn: EaseFn = (p) => Math.pow(2, 10 * (p - 1)) * p + p * p * p * p * p * p * (1 - p);
const expo: Trio = {
  in: expoIn,
  out: (p) => 1 - expoIn(1 - p),
  inOut: (p) => (p < 0.5 ? expoIn(p * 2) / 2 : 1 - expoIn((1 - p) * 2) / 2),
};
const bounceOut: EaseFn = (p) => {
  if (p < 1 / 2.75) return 7.5625 * p * p;
  if (p < 2 / 2.75) { p -= 1.5 / 2.75; return 7.5625 * p * p + 0.75; }
  if (p < 2.5 / 2.75) { p -= 2.25 / 2.75; return 7.5625 * p * p + 0.9375; }
  p -= 2.625 / 2.75;
  return 7.5625 * p * p + 0.984375;
};
const bounce = fromOut(bounceOut);

function back(s = 1.70158): Trio {
  const out: EaseFn = (p) => (p ? (p -= 1, p * p * ((s + 1) * p + s) + 1) : 0);   // exactly 0 at 0, as GSAP's: a colour is cut towards zero, so 2e-16 would change it
  return fromOut(out);
}

function elastic(amplitude?: number, period?: number): Trio {
  const make = (per0: number): Trio => {
    // an amplitude below 1 does not shrink the wave: it stretches the period (GSAP's rule, found by sampling it)
    const amp = amplitude ?? 1;
    const a = amp >= 1 ? amp : 1;
    const per = per0 / (amp < 1 ? amp : 1);
    const s = (per / (2 * PI)) * Math.asin(1 / a);
    const k = (2 * PI) / per;
    return fromOut((p) => (p === 0 ? 0 : p === 1 ? 1 : a * Math.pow(2, -10 * p) * Math.sin((p - s) * k) + 1));
  };
  const usual = make(period ?? 0.3);
  // `inOut` with no period runs a longer one (0.45), as GSAP does
  return { in: usual.in, out: usual.out, inOut: period === undefined ? make(0.45).inOut : usual.inOut };
}

/** GSAP's `steps(n)`: n steps that reach 1, the first one a (n+1)th of the way in (found by sampling it). */
function steps(n: number): EaseFn {
  const count = Math.max(1, Math.floor(n) || 1);
  return (p) => (p <= 0 ? 0 : p >= 1 ? 1 : Math.min(1, Math.floor(p * (count + 1)) / count));
}

const FAMILY: Record<string, (args: number[]) => Trio> = {
  power1: () => power(2), power2: () => power(3), power3: () => power(4), power4: () => power(5),
  quad: () => power(2), cubic: () => power(3), quart: () => power(4), quint: () => power(5), strong: () => power(5),
  sine: () => sine, circ: () => circ, expo: () => expo, bounce: () => bounce,
  back: (a) => back(a[0]), elastic: (a) => elastic(a[0], a[1]),
};

const LINEAR: EaseFn = (p) => p;
const DEFAULT: EaseFn = power(2).out;                            // power1.out: what a name nobody knows runs as

const cache = new Map<string, EaseFn | null>();

function lookup(name: string): EaseFn | null {
  let hit = cache.get(name);
  if (hit === undefined) { hit = parse(name.trim()); cache.set(name, hit); }
  return hit;
}

/** The ease function for an ease name; a name it does not know runs as `power1.out` (`checkEase` has said so). */
export function pureEase(name: unknown): EaseFn {
  return (typeof name === 'string' ? lookup(name) : null) ?? DEFAULT;
}

/** Whether `name` is an ease this library runs (`checkEase` warns about the others). */
export function isEaseName(name: unknown): boolean {
  return typeof name === 'string' && lookup(name) !== null;
}

function parse(raw: string): EaseFn | null {
  const s = raw.toLowerCase();
  if (s === 'none' || s === 'linear' || s === 'linear.easenone') return LINEAR;
  if (/^spring/.test(s)) { const sp = parseSpring(raw); return sp ? springEase(sp) : null; }
  if (/^cubic-bezier/.test(s)) { const c = parseCubicBezier(raw); return c ? cubicBezierEase(...c) : null; }
  const st = /^steps\(\s*([^)]*)\)$/.exec(s);
  if (st) return steps(Number(st[1]));
  const m = /^([a-z0-9]+)\.(?:ease)?(in|out|inout)(?:\(([^)]*)\))?$/.exec(s);
  if (!m) return null;
  const make = FAMILY[m[1]!];
  if (!make) return null;
  const args = (m[3] ?? '').split(',').map(x => x.trim()).filter(Boolean).map(Number).filter(n => Number.isFinite(n));
  const trio = make(args);
  return m[2] === 'in' ? trio.in : m[2] === 'out' ? trio.out : trio.inOut;
}
