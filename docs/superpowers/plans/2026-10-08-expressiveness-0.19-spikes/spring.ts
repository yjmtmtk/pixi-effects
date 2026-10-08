import { gsap } from 'gsap';

/**
 * Spring easing (prototype). A unit step response of a damped mass-spring system:
 *   m x'' + c x' + k x = k   with x(0) = 0, x'(0) = 0, target 1.
 * Closed form, so it is a pure function of time: seek-safe in both directions, no state, no integration.
 *
 * An ease only sees progress p (0..1), not seconds, so the spring is stretched in time: p = 1 is the moment the spring
 * has settled (|x - 1| <= SETTLE_TOL), and the result is divided by x(T) so it ends exactly on 1.
 * With `duration: 'auto'` (springDuration) the keyframe lasts exactly T seconds, and then the timing is the real physics.
 */
export interface SpringParams { mass?: number; stiffness?: number; damping?: number }

export const SETTLE_TOL = 0.005;
const DEFAULTS = { mass: 1, stiffness: 100, damping: 10 };

/** Unit step response at t seconds. */
export function springResponse(t: number, { mass: m, stiffness: k, damping: c }: Required<SpringParams>): number {
  if (t <= 0) return 0;
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  if (Math.abs(zeta - 1) < 1e-6) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);                 // critically damped
  if (zeta < 1) {                                                                              // under-damped: overshoots, rings
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + (zeta * w0 / wd) * Math.sin(wd * t));
  }
  const s = w0 * Math.sqrt(zeta * zeta - 1);                                                   // over-damped: slow, no overshoot
  const r1 = -zeta * w0 + s, r2 = -zeta * w0 - s;                                              // both negative
  return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
}

function complete(p: SpringParams): Required<SpringParams> {
  return { mass: p.mass ?? DEFAULTS.mass, stiffness: p.stiffness ?? DEFAULTS.stiffness, damping: p.damping ?? DEFAULTS.damping };
}

/** Seconds until the spring stays within `tol` (0.5 %) of its target for good. Exact (bisection on the last crossing), not an envelope bound. */
export function springDuration(params: SpringParams = {}, tol = SETTLE_TOL): number {
  const p = complete(params);
  const w0 = Math.sqrt(p.stiffness / p.mass);
  const zeta = p.damping / (2 * Math.sqrt(p.stiffness * p.mass));
  const bad = (t: number) => Math.abs(1 - springResponse(t, p)) > tol;
  let lo: number, hi: number;                                    // bad(lo) true, bad(hi) false, and bad stays false after hi
  if (zeta < 1 - 1e-6) {
    // extrema are at n*pi/wd with error exp(-n*pi*zeta/sqrt(1-zeta^2)); find the first one inside the tolerance
    const wd = w0 * Math.sqrt(1 - zeta * zeta);
    const decay = Math.PI * zeta / Math.sqrt(1 - zeta * zeta);
    const n = Math.max(1, Math.ceil(Math.log(1 / tol) / decay));
    lo = ((n - 1) * Math.PI) / wd; hi = (n * Math.PI) / wd;
  } else {                                                       // error only shrinks: grow until inside
    lo = 0; hi = 1 / w0;
    while (bad(hi)) { lo = hi; hi *= 2; }
  }
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (bad(mid)) lo = mid; else hi = mid; }
  return hi;
}

/** The ease: progress 0..1 -> 0..1 (overshoots above 1 when under-damped), exactly 0 at 0 and exactly 1 at 1. */
export function springEase(params: SpringParams = {}): (p: number) => number {
  const sp = complete(params);
  const T = springDuration(sp);
  const end = springResponse(T, sp);
  return (p) => (p <= 0 ? 0 : p >= 1 ? 1 : springResponse(p * T, sp) / end);
}

export const SPRING_PRESETS: Record<string, Required<SpringParams>> = {
  gentle: { mass: 1, stiffness: 100, damping: 15 },   // zeta .75, one soft overshoot
  snappy: { mass: 1, stiffness: 300, damping: 28 },   // zeta .81, quick, barely rings
  bouncy: { mass: 1, stiffness: 170, damping: 10 },   // zeta .38
  wobbly: { mass: 1, stiffness: 120, damping: 6 },    // zeta .27, rings several times
  slow:   { mass: 1, stiffness: 60,  damping: 18 },   // zeta 1.16, no overshoot
};

const SPRING_RE = /^spring(?:\.(\w+)|\(([^)]*)\))?$/;

/** Why a spring ease string is malformed, or null. (Used by the "unknown ease" warning.) */
export function springProblem(name: string): string | null {
  const m = SPRING_RE.exec(name.trim());
  if (!m) return 'expected "spring(mass, stiffness, damping)" or "spring.<preset>"';
  if (m[1] && !SPRING_PRESETS[m[1]]) return `no preset "${m[1]}" (presets: ${Object.keys(SPRING_PRESETS).join(', ')})`;
  if (m[2] !== undefined && m[2].trim() !== '') {
    const nums = m[2].split(',').map(s => Number(s.trim()));
    if (nums.length > 3 || nums.some(n => !Number.isFinite(n) || n <= 0)) return 'mass, stiffness and damping must be 1 to 3 numbers greater than 0';
  }
  return null;
}

/** Parse the spring parameters out of an ease string ('spring(1,170,12)', 'spring.bouncy', 'spring'), or null if it is not a (valid) spring. */
export function parseSpring(name: unknown): Required<SpringParams> | null {
  if (typeof name !== 'string' || !/^\s*spring/.test(name) || springProblem(name)) return null;
  const m = SPRING_RE.exec(name.trim())!;
  if (m[1]) return SPRING_PRESETS[m[1]]!;
  const [mass, stiffness, damping] = (m[2] ?? '').split(',').map(s => s.trim()).filter(Boolean).map(Number);
  return complete({ mass, stiffness, damping });
}

let registered = false;
/** Register 'spring', 'spring(m,k,c)' (GSAP calls .config with the numbers) and 'spring.<preset>' with GSAP. Idempotent. */
export function registerSpringEases(): void {
  if (registered) return;
  registered = true;
  const base = springEase();
  const ease: any = (p: number) => base(p);
  ease.config = (mass?: number, stiffness?: number, damping?: number) => {
    const bad = [mass, stiffness, damping].some(v => v !== undefined && !(typeof v === 'number' && v > 0 && Number.isFinite(v)));
    if (bad) console.warn(`pixi-effects: ease "spring(${[mass, stiffness, damping].filter(v => v !== undefined).join(', ')})": mass, stiffness and damping must be numbers greater than 0 — using the defaults (1, 100, 10).`);
    return springEase(bad ? {} : { mass, stiffness, damping });
  };
  gsap.registerEase('spring', ease);
  for (const [name, p] of Object.entries(SPRING_PRESETS)) gsap.registerEase(`spring.${name}`, springEase(p));
}

/** A keyframe's length in seconds: a number, or 'auto' = the time its spring ease takes to settle (0.5 %). */
export function kfDuration(kf: { duration?: number | 'auto'; ease?: string }): number {
  if (kf.duration !== 'auto') return kf.duration ?? 0;
  const sp = parseSpring(kf.ease);
  if (!sp) {
    console.warn(`pixi-effects: keyframe duration 'auto' needs a spring ease (ease: 'spring(1, 170, 12)' or 'spring.bouncy'), got ease ${JSON.stringify(kf.ease ?? 'none')} — using 0.5 s.`);
    return 0.5;
  }
  return Math.round(springDuration(sp) * 1000) / 1000;
}

const warned = new Set<string>();
/** Warn (once per name) about an ease GSAP cannot resolve: it would silently fall back to power1.out. */
export function checkEase(name: string | undefined): void {
  if (!name || warned.has(name)) return;
  const problem = /^\s*spring/.test(name) ? springProblem(name) : (gsap.parseEase(name) ? null : 'not a GSAP ease name (examples: power3.out, back.out(1.7), expo.inOut, none)');
  if (!problem) return;
  warned.add(name);
  console.warn(`pixi-effects: unknown ease "${name}" — ${problem}. GSAP would silently use power1.out.`);
}
