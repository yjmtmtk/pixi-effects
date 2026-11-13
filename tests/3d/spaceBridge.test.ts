import { describe, it, expect } from 'vitest';
import { Camera3D, Matrix4, Vector3 } from '@pixi/3d';
import { applyCameraState } from '../../src/3d/spaceBridge';
import { cameraBasis, homeCamera, projectPoint, type CameraState } from '../../src/space/math';

const W = 960, H = 540;

/** Where PixiJS 3D's camera puts a scene point on a W × H picture (the arithmetic of View3D.worldToScreen, anchor 0, full viewport). */
function screenOf(camera: Camera3D, p: { x: number; y: number; z: number }): { x: number; y: number } {
  const view = new Matrix4();
  camera.getGlobalTransform(view);
  view.getInverse(view);
  const v = new Vector3(p.x, -p.y, p.z).applyAffineMatrix4(view);
  const proj = camera.computeProjection(W / H, new Matrix4());
  v.applyMatrix4(proj);
  return { x: (v.x * 0.5 + 0.5) * W, y: (0.5 - v.y * 0.5) * H };
}

describe('the composition camera, in PixiJS 3D: composition pixels, y flipped', () => {
  const cams: CameraState[] = [
    homeCamera(W, H),
    { x: 780, y: 150, z: 600, lookAtX: 480, lookAtY: 270, lookAtZ: 0, fov: 70 },
    { x: 100, y: 500, z: -200, lookAtX: 300, lookAtY: 100, lookAtZ: -900, fov: 25 },
    { x: 480, y: 270, z: 900, lookAtX: 480, lookAtY: 270, lookAtZ: 0, fov: 120 },
    { x: 480, y: 270, z: 900, lookAtX: 480, lookAtY: 270, lookAtZ: 900, fov: 40 },          // look-at = position: looks along -z
  ];
  const points = [{ x: 300, y: 270, z: 0 }, { x: 660, y: 270, z: -300 }, { x: 480, y: 330, z: 250 }, { x: 10, y: 20, z: -40 }, { x: 900, y: 500, z: 100 }];

  for (const [i, state] of cams.entries()) {
    it(`camera #${i}: a point lands on the same pixel as the composition's own projection (to 1e-3 px on screen: PixiJS 3D's matrices are 32-bit floats, so a point far off screen is off by about 1e-7 of its coordinate)`, () => {
      const camera = new Camera3D();
      applyCameraState(camera, state);
      const basis = cameraBasis(state, W, H);
      for (const p of points) {
        const ours = projectPoint(basis, p);
        if (!(ours.depth > 1)) continue;
        const px = screenOf(camera, p);
        const tol = (v: number) => 1e-3 + 1e-6 * Math.abs(v);                                   // float32: about 1e-7 of the value, plus a little
        expect(Math.abs(px.x - ours.x), `x of ${JSON.stringify(p)}: ${px.x} vs ${ours.x}`).toBeLessThan(tol(ours.x));
        expect(Math.abs(px.y - ours.y), `y of ${JSON.stringify(p)}: ${px.y} vs ${ours.y}`).toBeLessThan(tol(ours.y));
      }
    });
  }

  it('near 1 and far 20000 (composition px: far enough for the longest dolly), perspective, zoom 1', () => {
    const camera = new Camera3D();
    camera.zoom = 2; camera.mode = 'orthographic';
    applyCameraState(camera, homeCamera(W, H));
    expect(camera.near).toBe(1);
    expect(camera.far).toBe(20000);
    expect(camera.mode).toBe('perspective');
    expect(camera.zoom).toBe(1);
  });
});

import { AmbientLight, Container3D, DirectionalLight, PointLight, SpotLight } from '@pixi/3d';
import { FogMirror, LightMirror } from '../../src/3d/spaceBridge';
import type { LightState } from '../../src/space/lighting';

const light = (over: Partial<LightState>): LightState => ({
  kind: 'point', x: 300, y: 100, z: 700, lookAtX: 480, lookAtY: 270, lookAtZ: 0, r: 1, g: 1, b: 1, intensity: 1,
  coneAngle: 90, coneFeather: 0.5, falloff: 'none', radius: 500, falloffDistance: 500, castsShadows: false, shadowDarkness: 1, shadowDiffusion: 0, ...over,
});

describe('the composition lights, in PixiJS 3D', () => {
  const made = (lights: LightState[], said: string[] = []) => { const root = new Container3D(); const mirror = new LightMirror(root, 1000, (m) => said.push(m)); mirror.update(lights); return { root, mirror, said }; };
  const lightsOf = (root: Container3D) => root.children.filter((c) => c instanceof AmbientLight || c instanceof DirectionalLight || c instanceof PointLight || c instanceof SpotLight);

  it('each kind becomes its PixiJS 3D light, at (x, -y, z), with the intensity times pi (PixiJS 3D divides direct and ambient light by pi)', () => {
    const { root } = made([light({ kind: 'ambient', intensity: 0.25 }), light({ kind: 'point', falloff: 'none' }), light({ kind: 'parallel', x: 100, y: 50, z: 500, intensity: 0.8 }), light({ kind: 'spot', coneAngle: 50, coneFeather: 0.4 })]);
    const [amb, pt, par, spot] = lightsOf(root) as [AmbientLight, PointLight, DirectionalLight, SpotLight];
    expect(amb).toBeInstanceOf(AmbientLight); expect(amb.intensity).toBeCloseTo(0.25 * Math.PI, 6);
    expect(pt).toBeInstanceOf(PointLight); expect([pt.position.x, pt.position.y, pt.position.z]).toEqual([300, -100, 700]);
    expect(par).toBeInstanceOf(DirectionalLight); expect(par.intensity).toBeCloseTo(0.8 * Math.PI, 6);
    expect(spot).toBeInstanceOf(SpotLight); expect(spot.coneAngle).toBeCloseTo(25, 6); expect(spot.penumbra).toBeCloseTo(0.4, 6);
  });

  it("falloff 'none': a bulb far larger than the scene, its intensity scaled by radius squared, so the light is the same everywhere in the scene", () => {
    const { root } = made([light({ kind: 'point', falloff: 'none', intensity: 1 })]);
    const [pt] = lightsOf(root) as [PointLight];
    const at = (d: number) => pt.intensity / Math.sqrt(d ** 4 + pt.radius ** 4);           // PixiJS 3D's attenuation, range 0
    expect(at(1) / Math.PI).toBeCloseTo(1, 6);
    expect(at(2000) / Math.PI).toBeCloseTo(1, 6);
  });

  it("falloff 'inverseSquare': the bulb is the radius, so the light is (radius / d)^2 far out", () => {
    const { root } = made([light({ kind: 'point', falloff: 'inverseSquare', radius: 200 })]);
    const [pt] = lightsOf(root) as [PointLight];
    expect(pt.radius).toBe(200);
    const at = (d: number) => pt.intensity / Math.sqrt(d ** 4 + pt.radius ** 4) / Math.PI;
    expect(at(2000)).toBeCloseTo((200 / 2000) ** 2, 4);
  });

  it('a light that has ended is switched off, not removed; a point light that casts shadows says once that it cannot', () => {
    const said: string[] = [];
    const { root, mirror } = made([light({ kind: 'point' }), light({ kind: 'point', castsShadows: true })], said);
    mirror.update([light({ kind: 'point' })]);
    const all = lightsOf(root);
    expect(all.length).toBe(2);
    expect(all[1]!.visible).toBe(false);
    expect(said.join('\n')).toMatch(/a point light casts no shadow in PixiJS 3D; use a spot light/);
  });

  it('a spot light that casts reaches far enough for a scene in pixels (PixiJS 3D: a spot shadow without a range stops at 1000 units)', () => {
    const { root } = made([light({ kind: 'spot', castsShadows: true })]);
    const [spot] = lightsOf(root) as [SpotLight];
    expect(spot.castShadow).toBe(true);
    expect(spot.range).toBeGreaterThan(5000);
  });
});

describe('the composition fog, in PixiJS 3D', () => {
  it('becomes a linear fog of the view, follows it, goes when the camera has none, and leaves a fog the author set alone', () => {
    const view = { fog: null as unknown } as { fog: unknown };
    const mirror = new FogMirror(view as never);
    mirror.update({ near: 100, far: 600, r: 1, g: 0, b: 0, amount: 1 });
    expect(view.fog).toMatchObject({ type: 'linear', near: 100, far: 600 });
    mirror.update(null);
    expect(view.fog).toBeNull();
    const own = { type: 'exp2', color: 0, density: 0.1 };
    view.fog = own;
    mirror.update({ near: 100, far: 600, r: 1, g: 0, b: 0, amount: 1 });
    expect(view.fog).toBe(own);
  });
});

describe('shadows in a scene of pixels', () => {
  it('a parallel light that casts covers the whole scene with its shadow box (PixiJS 3D fits the casters only: a wall behind them fell outside); a spot light gets a tiny bias and a far range', () => {
    const root = new Container3D();
    const mirror = new LightMirror(root, 1920, () => {}, { x: 480, y: -270, z: 0 });
    mirror.update([light({ kind: 'parallel', castsShadows: true }), light({ kind: 'spot', castsShadows: true })]);
    const sun = root.children.find((c) => c instanceof DirectionalLight) as DirectionalLight;
    const spot = root.children.find((c) => c instanceof SpotLight) as SpotLight;
    const b = sun.shadow.bounds!;
    expect(b.min.x).toBeLessThanOrEqual(480 - 960 + 1e-6); expect(b.max.x).toBeGreaterThanOrEqual(480 + 960 - 1e-6);
    expect(b.min.z).toBeLessThanOrEqual(-960 + 1e-6); expect(b.max.z).toBeGreaterThanOrEqual(960 - 1e-6);
    expect(spot.shadow.bias).toBeLessThanOrEqual(1e-5);
    expect(spot.range).toBeGreaterThan(10 * 1920);
  });
});

describe("falloff 'smooth': the window fitted to the composition's smoothstep", () => {
  // composition: 1 inside radius, smoothstep down to 0 at radius + falloffDistance; PixiJS 3D: flat bulb x window(range) x gain
  const comp = (d: number, r: number, f: number) => { if (d <= r) return 1; if (d >= r + f) return 0; const x = 1 - (d - r) / f; return x * x * (3 - 2 * x); };
  // measured 2026-11-13: 0.095 (300/300), 0.116 (100/600), 0.123 (50/500); a fall that is steep against its radius cannot follow the composition's
  // curve with PixiJS 3D's window (the same shape as three's cut-off): 0.202 (500/200), 0.28 (400/100). A grid search for other coefficients only moved the error around.
  for (const [r, f, bound] of [[300, 300, 0.13], [100, 600, 0.15], [50, 500, 0.16], [500, 200, 0.25]] as const) {
    it(`radius ${r}, falloffDistance ${f}: the largest difference over the whole range stays under ${bound} of full light`, () => {
      const root = new Container3D();
      const mirror = new LightMirror(root, 1000);
      mirror.update([light({ kind: 'point', falloff: 'smooth', radius: r, falloffDistance: f })]);
      const pt = root.children.find((c) => c instanceof PointLight) as PointLight;
      let worst = 0;
      for (let d = 0; d <= (r + f) * 1.3; d += 5) {
        const ratio = (d * d) / (pt.range * pt.range);
        const win = pt.range > 0 ? (d >= pt.range ? 0 : Math.max(0, 1 - ratio * ratio) ** 2) : 1;
        const ours = (pt.intensity / Math.PI) * win / Math.sqrt(d ** 4 + pt.radius ** 4);
        worst = Math.max(worst, Math.abs(ours - comp(d, r, f)));
      }
      console.log(`smooth fit r ${r} f ${f}: largest difference ${worst.toFixed(3)}`);
      expect(worst).toBeLessThan(bound);
    });
  }
});
