import { describe, it, expect } from 'vitest';
import { fogAmount, packLights, shadeReference, shadowReference, smoothstep, coneCos, MAX_LIGHTS, LIGHT_KINDS, FALLOFFS, type LightState } from '../../src/space/lighting';

const base: LightState = {
  kind: 'point', x: 0, y: 0, z: 100, lookAtX: 0, lookAtY: 0, lookAtZ: 0, r: 1, g: 1, b: 1, intensity: 1,
  coneAngle: 90, coneFeather: 0.5, falloff: 'none', radius: 500, falloffDistance: 500, castsShadows: false, shadowDarkness: 1, shadowDiffusion: 0,
};
const L = (o: Partial<LightState>): LightState => ({ ...base, ...o });
const plane = { p: { x: 0, y: 0, z: 0 }, n: { x: 0, y: 0, z: 1 }, cam: { x: 0, y: 0, z: 500 } };
const shade = (lights: LightState[], p = plane.p, n = plane.n, cam = plane.cam) => shadeReference(p, n, cam, lights);

describe('names', () => {
  it('the kinds and falloffs the DSL speaks', () => {
    expect(LIGHT_KINDS).toEqual(['ambient', 'point', 'spot', 'parallel']);
    expect(FALLOFFS).toEqual(['none', 'smooth', 'inverseSquare']);
  });
});

describe('shading a flat plane (worked by hand)', () => {
  it('white ambient at 1 is no light at all: the multiplier is 1', () => {
    expect(shade([L({ kind: 'ambient', intensity: 1 })])).toEqual([1, 1, 1]);
  });
  it('ambient adds its colour × intensity everywhere', () => {
    expect(shade([L({ kind: 'ambient', intensity: 0.25, r: 1, g: 0.5, b: 0 })])).toEqual([0.25, 0.125, 0]);
  });
  it('a point light straight above, no falloff: N·L = 1, so its colour × intensity', () => {
    expect(shade([L({ intensity: 0.5 })])).toEqual([0.5, 0.5, 0.5]);
  });
  it('a point light at 60° from the normal gives N·L = cos 60° = 0.5', () => {
    // light at (100·sin60°·… ) : place it so that the angle is exactly 60°: (x, 0, z) with x = d·sin60°, z = d·cos60°, d = 100
    const d = 100, ang = Math.PI / 3;
    const out = shade([L({ x: d * Math.sin(ang), z: d * Math.cos(ang) })]);
    expect(out[0]).toBeCloseTo(0.5, 12);
  });
  it('a light behind the plane does not light the side the camera sees (the normal turns toward the camera)', () => {
    expect(shade([L({ z: -100 })])).toEqual([0, 0, 0]);
    // and when the camera is behind too, the plane is seen from the back and that side is lit
    expect(shade([L({ z: -100 })], plane.p, plane.n, { x: 0, y: 0, z: -500 })).toEqual([1, 1, 1]);
  });
  it('inverseSquare: full intensity at the radius, a quarter at twice the radius, never above 1', () => {
    expect(shade([L({ z: 200, falloff: 'inverseSquare', radius: 200 })])[0]).toBeCloseTo(1, 12);
    expect(shade([L({ z: 400, falloff: 'inverseSquare', radius: 200 })])[0]).toBeCloseTo(0.25, 12);
    expect(shade([L({ z: 100, falloff: 'inverseSquare', radius: 200 })])[0]).toBeCloseTo(1, 12);
  });
  it('smooth: full inside the radius, zero past radius + falloffDistance, halfway between at the middle of the band', () => {
    const f = (z: number) => shade([L({ z, falloff: 'smooth', radius: 100, falloffDistance: 200 })])[0]!;
    expect(f(100)).toBeCloseTo(1, 12);
    expect(f(300)).toBeCloseTo(0, 12);
    expect(f(200)).toBeCloseTo(0.5, 12);                            // smoothstep(0.5) = 0.5
  });
  it('a spot: inside the inner cone full, outside the outer cone zero, the feather between', () => {
    // pointing straight down -z from (0,0,100) to (0,0,0); a plane point at (x, 0, 0) is at angle atan(x/100) from the axis
    const s = (x: number) => shade([L({ kind: 'spot', coneAngle: 60, coneFeather: 0.5 })], { x, y: 0, z: 0 })[0]!;
    // half angle 30°, inner 15°: on the axis full (the plane is lit at N·L = 1 straight below)
    expect(s(0)).toBeCloseTo(1, 12);
    const x20 = 100 * Math.tan(10 * Math.PI / 180);                   // 10° off axis: inside the inner cone; N·L = cos 10°
    expect(s(x20)).toBeCloseTo(Math.cos(10 * Math.PI / 180), 6);
    expect(s(100 * Math.tan(40 * Math.PI / 180))).toBe(0);             // 40° off axis: outside
  });
  it('a parallel light ignores its position: only the direction from the position toward the look-at point', () => {
    // the light travels along -z (from z = 100 toward z = 0), so it lights a +z-facing plane head-on, at any distance
    expect(shade([L({ kind: 'parallel', z: 100 })])).toEqual([1, 1, 1]);
    expect(shade([L({ kind: 'parallel', z: 100000 })])).toEqual([1, 1, 1]);
  });
  it('two lights add', () => {
    expect(shade([L({ intensity: 0.25 }), L({ intensity: 0.5 })])[0]).toBeCloseTo(0.75, 12);
  });
});

describe('cone, packing, fog', () => {
  it('coneCos: a feather of 0 is a hard edge one hair wide, never an empty smoothstep', () => {
    const { cosOuter, cosInner } = coneCos(L({ kind: 'spot', coneAngle: 60, coneFeather: 0 }));
    expect(cosOuter).toBeCloseTo(Math.cos(Math.PI / 6), 12);
    expect(cosInner - cosOuter).toBeGreaterThan(0);
  });
  it('smoothstep is 0 below, 1 above and 0.5 in the middle', () => {
    expect([smoothstep(0, 1, -1), smoothstep(0, 1, 2), smoothstep(0, 1, 0.5)]).toEqual([0, 1, 0.5]);
  });
  it('packLights: ambient lights are summed, not listed; the list holds at most MAX_LIGHTS and says how many', () => {
    const many = Array.from({ length: MAX_LIGHTS + 3 }, () => L({}));
    const p = packLights([L({ kind: 'ambient', intensity: 0.2 }), L({ kind: 'ambient', intensity: 0.1 }), ...many]);
    expect(p.ambient[0]).toBeCloseTo(0.3, 12);
    expect(p.count).toBe(MAX_LIGHTS);
    expect(packLights([]).count).toBe(0);
  });
  it('fogAmount: 0 at near, 1 at far, linear between, scaled by the maximum; far <= near is a step', () => {
    expect([fogAmount(100, 100, 300), fogAmount(300, 100, 300), fogAmount(200, 100, 300)]).toEqual([0, 1, 0.5]);
    expect(fogAmount(200, 100, 300, 0.4)).toBeCloseTo(0.2, 12);
    expect([fogAmount(99, 100, 100), fogAmount(100, 100, 100)]).toEqual([0, 1]);
  });
});

describe('shadowReference (a hard shadow, worked by hand)', () => {
  // the light at (0, 0, 200); the caster is a 100 x 100 plane at z = 100 centred on the axis: o = (-50, -50, 100), u = (100, 0, 0), v = (0, 100, 0)
  const caster = { o: { x: -50, y: -50, z: 100 }, u: { x: 100, y: 0, z: 0 }, v: { x: 0, y: 100, z: 0 } };
  const solid = () => 1;
  const light = L({ x: 0, y: 0, z: 200 });
  const at = (x: number, y: number, z = 0, l = light, c = caster, a: (u: number, v: number) => number = solid) => shadowReference({ x, y, z }, l, c, a);

  it('a point straight under the caster is in its shadow; one far to the side is not', () => {
    expect(at(0, 0)).toBe(1);                       // the ray to the light crosses the caster's plane at (0, 0, 100): halfway up, t = 0.5
    expect(at(300, 0)).toBe(0);                     // it crosses at (150, 0, 100): outside the 100 x 100 plane
  });
  it('the edge of the shadow is where the ray meets the edge of the caster: halfway up, so the shadow is twice as wide as the caster', () => {
    expect(at(99, 0)).toBe(1);                      // crosses at x = 49.5
    expect(at(101, 0)).toBe(0);                     // crosses at x = 50.5
  });
  it('the caster\'s own alpha is the shadow: a half-transparent caster casts half a shadow, a hole in it lets the light through', () => {
    expect(at(0, 0, 0, light, caster, () => 0.5)).toBe(0.5);
    expect(at(0, 0, 0, light, caster, (u, v) => (u > 0.4 && u < 0.6 && v > 0.4 && v < 0.6 ? 0 : 1))).toBe(0);
  });
  it('a caster that is not between the point and the light casts nothing: below the point, or past the light', () => {
    expect(at(0, 0, 0, light, { ...caster, o: { x: -50, y: -50, z: -100 } })).toBe(0);
    expect(at(0, 0, 0, light, { ...caster, o: { x: -50, y: -50, z: 300 } })).toBe(0);
  });
  it('a caster seen edge-on casts nothing (no division by zero)', () => {
    const edgeOn = { o: { x: -50, y: -50, z: 100 }, u: { x: 100, y: 0, z: 0 }, v: { x: 0, y: 0, z: 100 } };
    expect(Number.isFinite(at(0, 0, 0, light, edgeOn))).toBe(true);
  });
  it('a parallel light casts along its direction, whatever its position: the shadow of the caster falls straight down for a light looking down -z', () => {
    const sun = L({ kind: 'parallel', x: 500, y: 500, z: 200, lookAtX: 500, lookAtY: 500, lookAtZ: 0 });
    expect(at(0, 0, 0, sun)).toBe(1);
    expect(at(49, 0, 0, sun)).toBe(1);
    expect(at(51, 0, 0, sun)).toBe(0);
  });
});
