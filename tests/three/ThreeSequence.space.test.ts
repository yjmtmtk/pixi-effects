import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockWebGLRenderer } from './mockRenderers';

// the real three (cameras, lights, maths), a stand-in renderer: this file is about what the layer hands to the scene, not about pixels (the film tests/films/three-space does those)
vi.mock('three', async (orig) => ({ ...(await orig<typeof import('three')>()), WebGLRenderer: (await import('./mockRenderers')).MockWebGLRenderer }));

import { BoxGeometry, Group, Mesh, MeshBasicMaterial, OrthographicCamera, PerspectiveCamera, PlaneGeometry, PointLight, Vector3 } from 'three';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import type { ThreeContext, ThreeSequenceSpec } from '../../src/three/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import type { LightState } from '../../src/space/lighting';
import type { CameraState } from '../../src/space/math';

const cam = (x: number): CameraState => ({ x, y: 150, z: 600, lookAtX: 480, lookAtY: 270, lookAtZ: 0, fov: 60 });
const lamp: LightState = { kind: 'point', x: 300, y: 100, z: 700, lookAtX: 480, lookAtY: 270, lookAtZ: 0, r: 1, g: 1, b: 1, intensity: 1, coneAngle: 90, coneFeather: 0.5, falloff: 'none', radius: 500, falloffDistance: 500, castsShadows: false, shadowDarkness: 1, shadowDiffusion: 0 };
let fogNow: { r: number; g: number; b: number; near: number; far: number; amount: number } | null = { r: 0.1, g: 0.2, b: 0.4, near: 300, far: 900, amount: 1 };
const spaceAt = vi.fn((t: number) => ({ camera: cam(480 + 100 * t), lights: [lamp], fog: fogNow }));
const shape: CompositionShape = { width: 960, height: 540, duration: 10, spaceAt };
const make = (over: Partial<ThreeSequenceSpec> = {}) => {
  const seen: { ctx?: ThreeContext; camAtUpdate?: number[] } = {};
  const seq = new ThreeSequence({ type: 'three', setup: vi.fn(), update: (_t: number, c: ThreeContext) => { seen.ctx = c; seen.camAtUpdate = c.camera.position.toArray(); }, ...over } as unknown as SequenceSpec, shape, shape);
  return { seq, seen };
};
const sceneOf = (seq: ThreeSequence) => (seq as any)._scene;
const lightsIn = (seq: ThreeSequence) => (sceneOf(seq).children as any[]).filter((c) => c.isLight);
beforeEach(() => { spaceAt.mockClear(); vi.restoreAllMocks(); fogNow = { r: 0.1, g: 0.2, b: 0.4, near: 300, far: 900, amount: 1 }; });

describe('followCamera', () => {
  it("puts the layer's camera where the composition camera is at this moment (the layer's time + where the layer starts), before the layer's own update runs", async () => {
    const { seq, seen } = make({ followCamera: true });
    seq.absoluteStart = 2;
    await seq.build();
    await seq.awaitFrameAt(1);
    expect(spaceAt).toHaveBeenLastCalledWith(3);
    expect(seen.camAtUpdate).toEqual([780, -150, 600]);                       // x = 480 + 100 * 3, y flipped; update() already sees it
    const camera = seen.ctx!.camera as PerspectiveCamera;
    expect(camera.fov).toBe(60);
    expect(camera.aspect).toBeCloseTo(960 / 540, 9);
  });

  it('follows a seek: the same time twice gives the same camera, an earlier time moves it back', async () => {
    const { seq, seen } = make({ followCamera: true });
    await seq.build();
    await seq.awaitFrameAt(2); await seq.awaitFrameAt(0.5); await seq.awaitFrameAt(2);
    expect(seen.camAtUpdate![0]).toBe(680);
    await seq.awaitFrameAt(0.5);
    expect(seen.camAtUpdate![0]).toBe(530);
  });

  it('is off unless asked: without it the camera is the layer\'s own and the composition is never asked', async () => {
    const { seq, seen } = make();
    await seq.build();
    await seq.awaitFrameAt(1);
    expect(spaceAt).not.toHaveBeenCalled();
    expect(seen.ctx!.space).toBeUndefined();
    expect(seen.camAtUpdate).toEqual([0, 0, 0]);
  });

  it('hands the composition state to the layer as ctx.space (the camera and the lights alive), for what a layer does with them itself', async () => {
    const { seq, seen } = make({ followCamera: true });
    await seq.build();
    await seq.awaitFrameAt(1);
    expect(seen.ctx!.space!.camera.x).toBe(580);
    expect(seen.ctx!.space!.lights).toEqual([lamp]);
  });

  it('says once, with the fix, that the layer is not the composition\'s shape (the camera shows the whole composition)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { seq } = make({ followCamera: true, width: 300, height: 300, name: 'box' });
    await seq.build();
    await seq.awaitFrameAt(1); await seq.awaitFrameAt(2);
    const said = warn.mock.calls.map((c) => String(c[0])).filter((m) => /followCamera/.test(m));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/"box"/);
    expect(said[0]).toMatch(/960.*540|aspect/);
  });

  it('a camera that is not a PerspectiveCamera is left alone, with one warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ortho = new OrthographicCamera(-1, 1, 1, -1);
    const { seq } = make({ followCamera: true, setup: () => ({ camera: ortho }) });
    await seq.build();
    await seq.awaitFrameAt(1); await seq.awaitFrameAt(2);
    expect(ortho.position.toArray()).toEqual([0, 0, 0]);
    expect(warn.mock.calls.filter((c) => /followCamera.*PerspectiveCamera/.test(String(c[0])))).toHaveLength(1);
  });

  it('a layer whose parent cannot say (no composition space) warns once and keeps its own camera', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bare: CompositionShape = { width: 960, height: 540, duration: 10 };
    const seq = new ThreeSequence({ type: 'three', setup: vi.fn(), followCamera: true } as unknown as SequenceSpec, bare, bare);
    await seq.build();
    await seq.awaitFrameAt(1); await seq.awaitFrameAt(2);
    expect(warn.mock.calls.filter((c) => /followCamera/.test(String(c[0])))).toHaveLength(1);
  });
});

describe('followLights', () => {
  it("adds the composition's lights to the scene and moves them every frame; the layer's own lights are not touched", async () => {
    const { seq } = make({ followLights: true, setup: (ctx: ThreeContext) => { ctx.scene.add(Object.assign(new PointLight(0xff0000, 3), { name: 'mine' })); } });
    await seq.build();
    await seq.awaitFrameAt(1);
    const lights = lightsIn(seq) as any[];
    expect(lights.map((l) => l.name)).toEqual(['mine', 'pixi-effects:composition-light']);
    expect(lights[1].position.toArray()).toEqual([300, -100, 700]);
    expect(lights[0].intensity).toBe(3);
  });

  it('is off unless asked, and the lights go with the layer', async () => {
    const off = make();
    await off.seq.build(); await off.seq.awaitFrameAt(1);
    expect(lightsIn(off.seq)).toHaveLength(0);
    const on = make({ followLights: true });
    await on.seq.build(); await on.seq.awaitFrameAt(1);
    const scene = sceneOf(on.seq);
    expect(lightsIn(on.seq)).toHaveLength(1);
    on.seq.destroy();
    expect(scene.children.filter((c: any) => c.isLight)).toHaveLength(0);
  });

  it('followCamera and followLights are independent', async () => {
    const { seq, seen } = make({ followLights: true });
    await seq.build(); await seq.awaitFrameAt(1);
    expect(seen.camAtUpdate).toEqual([0, 0, 0]);                              // the camera is still the layer's own
    expect(lightsIn(seq)).toHaveLength(1);
  });
});

describe("followLights and an inverse-square light with objects inside its radius", () => {
  const box = (ctx: ThreeContext) => { ctx.scene.add(new Mesh(new BoxGeometry(100, 100, 100), new MeshBasicMaterial())); };
  const inverse = (radius: number, falloff: 'inverseSquare' | 'smooth' | 'none' = 'inverseSquare') => { spaceAt.mockImplementation((t: number) => ({ camera: cam(480 + 100 * t), lights: [{ ...lamp, falloff, radius }], fog: fogNow })); };
  const said = (warn: ReturnType<typeof vi.spyOn>) => warn.mock.calls.map((c) => String(c[0])).filter((m) => /inverseSquare/.test(m));
  const restore = () => spaceAt.mockImplementation((t: number) => ({ camera: cam(480 + 100 * t), lights: [lamp], fog: fogNow }));

  it("the composition holds an inverse-square light at full strength inside its radius, three's keeps rising: said once, naming the layer, the light, how close and the way out", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    inverse(2000);                                                            // the lamp is ~770 px from the box: well inside 2000
    const { seq } = make({ followLights: true, name: 'world', setup: box });
    await seq.build(); await seq.awaitFrameAt(1); await seq.awaitFrameAt(2);
    const m = said(warn);
    expect(m).toHaveLength(1);
    expect(m[0]).toMatch(/"world"/);
    expect(m[0]).toMatch(/radius 2000/);
    expect(m[0]).toMatch(/smooth|radius/);
    restore();
  });

  it("an object beyond the radius is matched exactly: no warning; neither for 'smooth' nor with no falloff", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const [falloff, radius] of [['inverseSquare', 300], ['smooth', 2000], ['none', 2000]] as const) {
      inverse(radius, falloff);
      const { seq } = make({ followLights: true, setup: box });
      await seq.build(); await seq.awaitFrameAt(1);
    }
    expect(said(warn)).toHaveLength(0);
    restore();
  });
});

describe('pickAt: a ray through a point of the layer\'s picture', () => {
  const cube = (ctx: ThreeContext) => {
    const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); m.name = 'cube'; ctx.scene.add(m);
    (ctx.camera as PerspectiveCamera).position.z = 5;
  };

  it("hits the object in the middle of the picture (its name, where, how far from the camera) and nothing at the corner", async () => {
    const { seq } = make({ setup: cube });
    await seq.build();
    const hit = seq.pickAt(0.5, 0.5)!;
    expect(hit.object).toBe('cube');
    expect(hit.distance).toBeCloseTo(4.5, 3);                                 // the front face of a unit box at the origin, seen from z = 5
    expect(hit.point[2]).toBeCloseTo(0.5, 3);
    expect((hit.object3d as { name: string }).name).toBe('cube');
    expect(seq.pickAt(0.02, 0.02)).toBeNull();
  });

  it('an object with no name of its own is named by its nearest ancestor that has one (a glTF mesh part is "Object_5" inside the node you know)', async () => {
    const { seq } = make({ setup: (ctx: ThreeContext) => {
      const group = new Group(); group.name = 'fox';
      group.add(new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())); ctx.scene.add(group);
      (ctx.camera as PerspectiveCamera).position.z = 5;
    } });
    await seq.build();
    expect(seq.pickAt(0.5, 0.5)!.object).toBe('fox');
  });

  it('an invisible object, or one inside an invisible group, is not hit', async () => {
    const { seq } = make({ setup: cube });
    await seq.build();
    (sceneOf(seq).children[0] as { visible: boolean }).visible = false;
    expect(seq.pickAt(0.5, 0.5)).toBeNull();
  });

  it("with followCamera the ray goes through the composition's camera: the point where a plane at (x, y, 0) is drawn finds it", async () => {
    const home = { x: 480, y: 270, z: 270 / Math.tan((40 * Math.PI) / 360), lookAtX: 480, lookAtY: 270, lookAtZ: 0, fov: 40 };
    spaceAt.mockImplementation(() => ({ camera: home, lights: [], fog: null }));
    const { seq } = make({ followCamera: true, width: 960, height: 540, setup: (ctx: ThreeContext) => {
      const plane = new Mesh(new PlaneGeometry(100, 100), new MeshBasicMaterial()); plane.name = 'card'; plane.position.set(300, -270, 0); ctx.scene.add(plane);
    } });
    await seq.build(); await seq.awaitFrameAt(0);
    expect(seq.pickAt(300 / 960, 270 / 540)!.object).toBe('card');
    expect(seq.pickAt(340 / 960, 270 / 540)!.object, '40 px right of its middle: still on the 100 px card').toBe('card');
    expect(seq.pickAt(400 / 960, 270 / 540), '100 px right: off it').toBeNull();
    spaceAt.mockImplementation((t: number) => ({ camera: cam(480 + 100 * t), lights: [lamp], fog: fogNow }));
  });
});

describe('dragPlane: a point of the picture on a plane through the grabbed point', () => {
  const NDC = (u: number, v: number) => [u * 2 - 1, -(v * 2 - 1)] as const;
  const scene = (ctx: ThreeContext) => {
    const m = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial()); m.name = 'cube'; ctx.scene.add(m);
    const cam = ctx.camera as PerspectiveCamera; cam.position.set(0, 3, 5); cam.lookAt(0, 0, 0);
  };
  const build = async () => { const { seq } = make({ setup: scene }); await seq.build(); return seq; };

  it('whatever the plane, the new point seen through the camera is exactly where the pointer is (the property that makes a drag follow the pointer)', async () => {
    const seq = await build();
    const cam = (seq as any)._camera as PerspectiveCamera;
    const grab = seq.pickAt(0.5, 0.5)!;
    for (const plane of ['screen', 'floor', 'wall', [1, 1, 0]] as const) {
      const move = seq.dragPlane(grab.point, plane as never);
      for (const [u, v] of [[0.5, 0.5], [0.62, 0.41], [0.4, 0.7]] as const) {
        const r = move(u, v)!;
        expect(r, `${plane}`).not.toBeNull();
        const ndc = new Vector3(...r.point).project(cam);
        expect(ndc.x, `${plane} x at ${u},${v}`).toBeCloseTo(NDC(u, v)[0], 6);
        expect(ndc.y, `${plane} y at ${u},${v}`).toBeCloseTo(NDC(u, v)[1], 6);
      }
    }
  });

  it("the delta is from the grabbed point and stays on the plane: 'floor' keeps y, 'wall' keeps z, 'screen' keeps the distance from the camera", async () => {
    const seq = await build();
    const cam = (seq as any)._camera as PerspectiveCamera;
    const grab = seq.pickAt(0.5, 0.5)!;
    const atRest = seq.dragPlane(grab.point, 'floor')(0.5, 0.5)!;
    expect(atRest.delta.map((d) => Math.abs(d) < 1e-9)).toEqual([true, true, true]);          // the pointer has not moved: nothing moves
    const floor = seq.dragPlane(grab.point, 'floor')(0.7, 0.6)!;
    expect(floor.delta[1]).toBeCloseTo(0, 9);
    expect(Math.hypot(floor.delta[0], floor.delta[2])).toBeGreaterThan(0.1);
    expect(seq.dragPlane(grab.point, 'wall')(0.7, 0.4)!.delta[2]).toBeCloseTo(0, 9);
    const screen = seq.dragPlane(grab.point, 'screen')(0.7, 0.4)!;
    const toCamera = (p: number[]) => new Vector3(...p).sub(cam.position).dot(new Vector3(0, 0, -1).applyQuaternion(cam.quaternion));
    expect(toCamera(screen.point)).toBeCloseTo(toCamera(grab.point), 6);                       // the same depth along the view
  });

  it('a pointer whose ray never meets the plane (a floor seen edge-on, or behind the camera) gives null, not a far-away number', async () => {
    const { seq } = make({ setup: (ctx: ThreeContext) => { const cam = ctx.camera as PerspectiveCamera; cam.position.set(0, 3, 5); cam.lookAt(0, 3, 0); } });     // looking along the horizon
    await seq.build();
    const floor = seq.dragPlane([0, 0, 0], 'floor');
    expect(floor(0.5, 0.0), 'a ray above the horizon never reaches the floor').toBeNull();
    expect(floor(0.5, 1.0), 'a ray below it does').not.toBeNull();
  });
});

describe('shadows of followed lights', () => {
  it("switch the layer's shadow map on when a light alive casts, and leave it off otherwise (the meshes that cast and receive are the layer's own: castShadow / receiveShadow)", async () => {
    const on = make({ followLights: true });
    await on.seq.build(); await on.seq.awaitFrameAt(1);
    expect((on.seq as any)._renderer.shadowMap.enabled).toBe(false);
    spaceAt.mockImplementation((t: number) => ({ camera: cam(480 + 100 * t), lights: [{ ...lamp, kind: 'spot' as const, castsShadows: true }], fog: fogNow }));
    await on.seq.awaitFrameAt(2);
    expect((on.seq as any)._renderer.shadowMap.enabled).toBe(true);
    spaceAt.mockImplementation((t: number) => ({ camera: cam(480 + 100 * t), lights: [lamp], fog: fogNow }));
  });
});

describe('followFog', () => {
  it("the composition camera's fog is the scene's Fog, every frame; the camera is not touched; it follows the camera going over", async () => {
    const { seq, seen } = make({ followFog: true });
    await seq.build(); await seq.awaitFrameAt(1);
    const fog = sceneOf(seq).fog;
    expect([fog.near, fog.far]).toEqual([300, 900]);
    expect(seen.camAtUpdate).toEqual([0, 0, 0]);
    fogNow = null;
    await seq.awaitFrameAt(2);
    expect(sceneOf(seq).fog).toBeNull();
  });

  it('is off unless asked', async () => {
    const { seq } = make();
    await seq.build(); await seq.awaitFrameAt(1);
    expect(sceneOf(seq).fog).toBeNull();
  });

  it("fogAmount below 1 has no equivalent in three's Fog: said once, naming the layer, and the full amount is used", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fogNow = { ...fogNow!, amount: 0.5 };
    const { seq } = make({ followFog: true, name: 'world' });
    await seq.build(); await seq.awaitFrameAt(1); await seq.awaitFrameAt(2);
    const said = warn.mock.calls.map((c) => String(c[0])).filter((m) => /fogAmount/.test(m));
    expect(said).toHaveLength(1);
    expect(said[0]).toMatch(/"world"/);
  });
});

void MockWebGLRenderer;
