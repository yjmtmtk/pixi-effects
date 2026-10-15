import { describe, it, expect } from 'vitest';
import { AmbientLight, DirectionalLight, PerspectiveCamera, PointLight, Scene, SpotLight, Vector3 } from 'three';
import { applyCameraState, LightMirror } from '../../src/three/spaceBridge';
import { cameraBasis, homeCamera, projectPoint, type CameraState } from '../../src/space/math';
import type { LightState } from '../../src/space/lighting';

const W = 960, H = 540;

describe('the composition camera, in three: composition pixels, y flipped', () => {
  const cams: CameraState[] = [
    homeCamera(W, H),
    { x: 780, y: 150, z: 600, lookAtX: 480, lookAtY: 270, lookAtZ: 0, fov: 70 },
    { x: 100, y: 500, z: -200, lookAtX: 300, lookAtY: 100, lookAtZ: -900, fov: 25 },
    { x: 480, y: 270, z: 900, lookAtX: 480, lookAtY: 270, lookAtZ: 0, fov: 120 },
  ];
  const points = [{ x: 300, y: 270, z: 0 }, { x: 660, y: 270, z: -300 }, { x: 480, y: 330, z: 250 }, { x: 10, y: 20, z: -40 }, { x: 900, y: 500, z: 100 }];

  for (const [i, state] of cams.entries()) {
    it(`camera #${i}: a point lands on the same pixel as the composition's own projection (to 1e-6 px)`, () => {
      const camera = new PerspectiveCamera(40, 1, 1, 1000);
      applyCameraState(camera, state, W / H);
      const basis = cameraBasis(state, W, H);
      for (const p of points) {
        const ours = projectPoint(basis, p);
        if (!(ours.depth > 1)) continue;                                      // behind the camera: no picture to compare
        const ndc = new Vector3(p.x, -p.y, p.z).project(camera);
        const px = ((ndc.x + 1) / 2) * W, py = ((1 - ndc.y) / 2) * H;
        expect(px, `x of ${JSON.stringify(p)}`).toBeCloseTo(ours.x, 6);
        expect(py, `y of ${JSON.stringify(p)}`).toBeCloseTo(ours.y, 6);
      }
    });
  }

  it('sets the aspect, near and far so a composition-sized scene is not clipped (units are px: far enough for the longest dolly)', () => {
    const camera = new PerspectiveCamera(40, 1, 0.1, 10);
    applyCameraState(camera, homeCamera(W, H), W / H);
    expect(camera.aspect).toBeCloseTo(W / H, 9);
    expect(camera.near).toBe(1);
    expect(camera.far).toBeGreaterThanOrEqual(20000);
  });
});

const light = (over: Partial<LightState>): LightState => ({
  kind: 'point', x: 300, y: 100, z: 700, lookAtX: 480, lookAtY: 270, lookAtZ: 0, r: 1, g: 1, b: 1, intensity: 1,
  coneAngle: 90, coneFeather: 0.5, falloff: 'none', radius: 500, falloffDistance: 500, castsShadows: false, shadowDarkness: 1, shadowDiffusion: 0, ...over,
});

describe('the composition lights, in three', () => {
  const made = (lights: LightState[]) => { const scene = new Scene(); const mirror = new LightMirror(scene); mirror.update(lights); return { scene, mirror }; };
  const lightsOf = (scene: Scene) => scene.children.filter((c) => (c as { isLight?: boolean }).isLight);

  it('each kind becomes its three light, at (x, -y, z), with the intensity times pi (three divides a diffuse surface by pi: intensity 1 is "as bright as the colour")', () => {
    const { scene } = made([
      light({ kind: 'ambient', intensity: 0.25 }), light({ kind: 'point' }),
      light({ kind: 'parallel', x: 100, y: 50, z: 500, intensity: 0.8 }), light({ kind: 'spot', coneAngle: 50, coneFeather: 0.5 }),
    ]);
    const [amb, pt, par, spot] = lightsOf(scene) as [AmbientLight, PointLight, DirectionalLight, SpotLight];
    expect(amb).toBeInstanceOf(AmbientLight); expect(amb.intensity).toBeCloseTo(0.25 * Math.PI, 9);
    expect(pt).toBeInstanceOf(PointLight); expect(pt.intensity).toBeCloseTo(Math.PI, 9); expect(pt.position.toArray()).toEqual([300, -100, 700]);
    expect(par).toBeInstanceOf(DirectionalLight); expect(par.intensity).toBeCloseTo(0.8 * Math.PI, 9); expect(par.position.toArray()).toEqual([100, -50, 500]);
    expect(par.target.position.toArray()).toEqual([480, -270, 0]);
    expect(spot).toBeInstanceOf(SpotLight); expect(spot.angle).toBeCloseTo((25 * Math.PI) / 180, 9); expect(spot.penumbra).toBeCloseTo(0.5, 9);
    expect(spot.target.position.toArray()).toEqual([480, -270, 0]);
  });

  it("falloff 'none' is no attenuation (distance 0, decay 0); 'inverseSquare' is decay 2 and full at `radius` (intensity x radius^2); 'smooth' reaches nothing at radius + falloffDistance", () => {
    const { scene } = made([light({ falloff: 'none' }), light({ falloff: 'inverseSquare', radius: 400 }), light({ falloff: 'smooth', radius: 300, falloffDistance: 200 })]);
    const [a, b, c] = lightsOf(scene) as PointLight[];
    expect([a!.distance, a!.decay]).toEqual([0, 0]);
    expect(b!.decay).toBe(2); expect(b!.intensity).toBeCloseTo(Math.PI * 400 * 400, 3);
    expect(c!.distance).toBe(500);
  });

  it('the colour of the light is the colour (a warm light is warm)', () => {
    const { scene } = made([light({ r: 1, g: 0.5, b: 0.25 })]);
    const [pt] = lightsOf(scene) as PointLight[];
    expect(pt!.color.r).toBeGreaterThan(pt!.color.g); expect(pt!.color.g).toBeGreaterThan(pt!.color.b);
  });

  it('a later frame moves the same light objects (no new objects per frame), and a light that is gone is off, not left behind', () => {
    const { scene, mirror } = made([light({}), light({ kind: 'ambient' })]);
    const first = lightsOf(scene);
    mirror.update([light({ x: 500, intensity: 0.5 })]);                      // the ambient light ended
    const [pt, amb] = lightsOf(scene) as [PointLight, AmbientLight];
    expect(pt).toBe(first[0]); expect(pt.position.x).toBe(500); expect(pt.intensity).toBeCloseTo(0.5 * Math.PI, 9); expect(pt.visible).toBe(true);
    expect(amb.visible).toBe(false);
    mirror.update([]);
    expect(pt.visible).toBe(false);
  });

  it('a light whose kind changes at that index is replaced by the right kind', () => {
    const { scene, mirror } = made([light({ kind: 'point' })]);
    mirror.update([light({ kind: 'ambient', intensity: 0.4 })]);
    const visible = lightsOf(scene).filter((l) => l.visible);
    expect(visible).toHaveLength(1);
    expect(visible[0]).toBeInstanceOf(AmbientLight);
  });

  it('dispose takes every light out of the scene', () => {
    const { scene, mirror } = made([light({}), light({ kind: 'spot' })]);
    mirror.dispose();
    expect(lightsOf(scene)).toHaveLength(0);
    expect(scene.children).toHaveLength(0);                                  // the spot light's target too
  });
});
