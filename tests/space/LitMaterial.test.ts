import { describe, it, expect, vi } from 'vitest';
vi.mock('pixi.js', async () => (await import('./mockPixi')).createPixiMock());
import { LitMaterial } from '../../src/space/LitMaterial';
import { packLights, type LightState } from '../../src/space/lighting';

const light: LightState = {
  kind: 'spot', x: 10, y: 20, z: 300, lookAtX: 10, lookAtY: 20, lookAtZ: 0, r: 1, g: 0.5, b: 0.25, intensity: 2,
  coneAngle: 60, coneFeather: 0.5, falloff: 'smooth', radius: 400, falloffDistance: 100, castsShadows: false, shadowDarkness: 1, shadowDiffusion: 0,
};
const frame = { o: { x: 1, y: 2, z: 3 }, u: { x: 100, y: 0, z: 0 }, v: { x: 0, y: 50, z: 0 } };
const cam = { x: 160, y: 90, z: 247, fx: 0, fy: 0, fz: -1 };
const uniforms = (m: LitMaterial) => ((m.shader.resources.lightUniforms as { uniforms: Record<string, Float32Array> }).uniforms);

describe('LitMaterial.update writes the frame into the uniforms', () => {
  it('the plane, the camera, the light count, the colour × intensity and the cone', () => {
    const m = new LitMaterial();
    m.update(frame, cam, packLights([light]), null, []);
    const u = uniforms(m);
    expect(Array.from(u.uOrigin!)).toEqual([1, 2, 3, 1]);                 // origin, number of lights
    expect(Array.from(u.uAxisU!)).toEqual([100, 0, 0, 0]);                // axis u, number of shadow casters
    expect(Array.from(u.uAxisV!)).toEqual([0, 50, 0, 0]);
    expect(Array.from(u.uCam!)).toEqual([160, 90, 247, 1]);               // camera, lit on
    expect(Array.from(u.uCamFwd!)).toEqual([0, 0, -1, 0]);
    expect(Array.from(u.uLPos!.slice(0, 4))).toEqual([10, 20, 300, 2]);   // position, kind (spot = 2)
    expect(Array.from(u.uLCol!.slice(0, 3))).toEqual([2, 1, 0.5]);
    expect(u.uLCol![3]).toBeGreaterThan(u.uLDir![3]!);                    // cos inner > cos outer
  });

  it('no lights: shading off (uCam.w = 0) and no light count; no fog: the fog switch is off', () => {
    const m = new LitMaterial();
    m.update(frame, cam, null, null, []);
    const u = uniforms(m);
    expect(u.uOrigin![3]).toBe(0);
    expect(u.uCam![3]).toBe(0);
    expect(u.uFogRange![3]).toBe(0);
  });

  it('fog: colour with its amount, the range, and the switch on', () => {
    const m = new LitMaterial();
    m.update(frame, cam, null, { r: 0.1, g: 0.2, b: 0.3, near: 500, far: 1500, amount: 0.75 }, []);
    const u = uniforms(m);
    expect(Array.from(u.uFogColor!).map(v => Math.round(v * 100) / 100)).toEqual([0.1, 0.2, 0.3, 0.75]);
    expect(Array.from(u.uFogRange!)).toEqual([500, 1500, 0, 1]);
  });

  it('a new light list replaces the old one in place (no stale lights from the frame before)', () => {
    const m = new LitMaterial();
    m.update(frame, cam, packLights([light, { ...light, x: 99 }]), null, []);
    m.update(frame, cam, packLights([{ ...light, x: 5 }]), null, []);
    const u = uniforms(m);
    expect(u.uOrigin![3]).toBe(1);
    expect(u.uLPos![0]).toBe(5);
  });
});
