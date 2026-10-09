/**
 * Lighting math for lit threeD layers. Pure: no Pixi, no DOM (the shader in LitMaterial.ts computes the same formulas; shadeReference is the
 * independent JS twin the tests compare the picture against).
 *
 * A light is one of: ambient (a flat colour added everywhere), point (from a position, all directions), spot (a point limited to a
 * cone around the direction to its look-at point), parallel (a direction only: from the position toward the look-at point, the sun).
 * Shading of a flat plane: albedo × (ambient + Σ color × intensity × max(0, N·L) × falloff × cone × shadow). N is the plane's normal,
 * turned toward the camera (the side we see is the side that is lit: a light behind the plane does not light it).
 */
import type { Vec3 } from './math';

export const LIGHT_KINDS = ['ambient', 'point', 'spot', 'parallel'] as const;
export const FALLOFFS = ['none', 'smooth', 'inverseSquare'] as const;
export type LightKind = (typeof LIGHT_KINDS)[number];
export type Falloff = (typeof FALLOFFS)[number];

export interface LightState {
  kind: LightKind;
  x: number; y: number; z: number;
  lookAtX: number; lookAtY: number; lookAtZ: number;
  /** linear rgb 0..1 */
  r: number; g: number; b: number;
  intensity: number;
  /** full cone angle in degrees (spot) */
  coneAngle: number;
  /** 0..1: the soft part of the cone edge, as a fraction of the half-angle */
  coneFeather: number;
  falloff: Falloff;
  /** falloff starts (smooth) / the distance of full intensity (inverseSquare) */
  radius: number;
  falloffDistance: number;
  castsShadows: boolean;
  /** 0..1 */
  shadowDarkness: number;
  /** world px: the light's size, which makes the penumbra (0 = hard) */
  shadowDiffusion: number;
}

/** The numbers a light layer animates (in `initial` / `keyframes`). */
export const LIGHT_PROPS = ['x', 'y', 'z', 'lookAtX', 'lookAtY', 'lookAtZ', 'intensity', 'color', 'coneAngle', 'coneFeather', 'radius', 'falloffDistance', 'shadowDarkness', 'shadowDiffusion'] as const;

export const MAX_LIGHTS = 8;
export const MAX_CASTERS = 2;
export const SHADOW_TAPS = 16;

const FALLOFF_ID: Record<Falloff, number> = { none: 0, smooth: 1, inverseSquare: 2 };
const KIND_ID: Record<Exclude<LightKind, 'ambient'>, number> = { point: 1, spot: 2, parallel: 3 };

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

const DEG = Math.PI / 180;
function norm(v: Vec3): Vec3 { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; }
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

export function coneCos(l: LightState): { cosOuter: number; cosInner: number } {
  const half = Math.min(179, Math.max(0, l.coneAngle)) * DEG / 2;
  const inner = half * (1 - Math.min(1, Math.max(0, l.coneFeather)));
  const cosOuter = Math.cos(half);
  // smoothstep needs e0 < e1: a feather of 0 is a hard edge one hair wide
  const cosInner = Math.max(Math.cos(inner), cosOuter + 1e-4);
  return { cosOuter, cosInner };
}

export interface PlaneFrame { o: Vec3; u: Vec3; v: Vec3 }

/** The 32+ floats of light uniforms a lit layer needs this frame (every layer gets the same light list; only the plane differs). */
export interface PackedLights {
  count: number;
  ambient: [number, number, number];
  pos: Float32Array; dir: Float32Array; col: Float32Array; fall: Float32Array; shadow: Float32Array;
}

export function packLights(lights: readonly LightState[]): PackedLights {
  const pos = new Float32Array(4 * MAX_LIGHTS), dir = new Float32Array(4 * MAX_LIGHTS), col = new Float32Array(4 * MAX_LIGHTS), fall = new Float32Array(4 * MAX_LIGHTS), shadow = new Float32Array(4 * MAX_LIGHTS);
  const ambient: [number, number, number] = [0, 0, 0];
  let n = 0;
  for (const l of lights) {
    if (l.kind === 'ambient') { ambient[0] += l.r * l.intensity; ambient[1] += l.g * l.intensity; ambient[2] += l.b * l.intensity; continue; }
    if (n >= MAX_LIGHTS) continue;
    const d = norm({ x: l.lookAtX - l.x, y: l.lookAtY - l.y, z: l.lookAtZ - l.z });
    const { cosOuter, cosInner } = coneCos(l);
    pos.set([l.x, l.y, l.z, KIND_ID[l.kind]], 4 * n);
    dir.set([d.x, d.y, d.z, cosOuter], 4 * n);
    col.set([l.r * l.intensity, l.g * l.intensity, l.b * l.intensity, cosInner], 4 * n);
    fall.set([FALLOFF_ID[l.falloff], l.radius, l.falloffDistance, l.castsShadows ? 1 : 0], 4 * n);
    shadow.set([l.castsShadows ? l.shadowDarkness : 0, l.shadowDiffusion, 0, 0], 4 * n);
    n++;
  }
  return { count: n, ambient, pos, dir, col, fall, shadow };
}

/**
 * The independent JS reference of the shader (no shadows): the light multiplier (rgb) at world point `p` of a plane with normal `n`,
 * seen from `cam`. The test compares the GPU picture against albedo × this.
 */
export function shadeReference(p: Vec3, n: Vec3, cam: Vec3, lights: readonly LightState[]): [number, number, number] {
  let N = norm(n);
  if (dot(N, sub(cam, p)) < 0) N = { x: -N.x, y: -N.y, z: -N.z };
  const out: [number, number, number] = [0, 0, 0];
  for (const l of lights) {
    if (l.kind === 'ambient') { out[0] += l.r * l.intensity; out[1] += l.g * l.intensity; out[2] += l.b * l.intensity; continue; }
    const dirLA = norm({ x: l.lookAtX - l.x, y: l.lookAtY - l.y, z: l.lookAtZ - l.z });
    let L: Vec3; let dist = 0;
    if (l.kind === 'parallel') L = { x: -dirLA.x, y: -dirLA.y, z: -dirLA.z };
    else { const d = sub({ x: l.x, y: l.y, z: l.z }, p); dist = Math.hypot(d.x, d.y, d.z); L = { x: d.x / dist, y: d.y / dist, z: d.z / dist }; }
    const ndl = Math.max(0, dot(N, L));
    let att = 1;
    if (l.kind !== 'parallel') {
      if (l.falloff === 'smooth') att = 1 - smoothstep(l.radius, l.radius + Math.max(l.falloffDistance, 1e-3), dist);
      else if (l.falloff === 'inverseSquare') att = Math.min(1, (l.radius * l.radius) / Math.max(dist * dist, 1e-6));
    }
    let cone = 1;
    if (l.kind === 'spot') { const { cosOuter, cosInner } = coneCos(l); cone = smoothstep(cosOuter, cosInner, -dot(L, dirLA)); }
    const k = l.intensity * ndl * att * cone;
    out[0] += l.r * k; out[1] += l.g * k; out[2] += l.b * k;
  }
  return out;
}

/** Fog amount 0..1 at camera depth `depth`. */
export function fogAmount(depth: number, near: number, far: number, max = 1): number {
  if (!(far > near)) return depth >= near ? max : 0;
  return Math.min(1, Math.max(0, (depth - near) / (far - near))) * max;
}
