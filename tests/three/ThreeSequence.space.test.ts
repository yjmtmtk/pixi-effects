import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MockWebGLRenderer } from './mockRenderers';

// the real three (cameras, lights, maths), a stand-in renderer: this file is about what the layer hands to the scene, not about pixels (the film tests/films/three-space does those)
vi.mock('three', async (orig) => ({ ...(await orig<typeof import('three')>()), WebGLRenderer: (await import('./mockRenderers')).MockWebGLRenderer }));

import { OrthographicCamera, PerspectiveCamera, PointLight } from 'three';
import { ThreeSequence } from '../../src/three/ThreeSequence';
import type { ThreeContext, ThreeSequenceSpec } from '../../src/three/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import type { LightState } from '../../src/space/lighting';
import type { CameraState } from '../../src/space/math';

const cam = (x: number): CameraState => ({ x, y: 150, z: 600, lookAtX: 480, lookAtY: 270, lookAtZ: 0, fov: 60 });
const lamp: LightState = { kind: 'point', x: 300, y: 100, z: 700, lookAtX: 480, lookAtY: 270, lookAtZ: 0, r: 1, g: 1, b: 1, intensity: 1, coneAngle: 90, coneFeather: 0.5, falloff: 'none', radius: 500, falloffDistance: 500, castsShadows: false, shadowDarkness: 1, shadowDiffusion: 0 };
const spaceAt = vi.fn((t: number) => ({ camera: cam(480 + 100 * t), lights: [lamp] }));
const shape: CompositionShape = { width: 960, height: 540, duration: 10, spaceAt };
const make = (over: Partial<ThreeSequenceSpec> = {}) => {
  const seen: { ctx?: ThreeContext; camAtUpdate?: number[] } = {};
  const seq = new ThreeSequence({ type: 'three', setup: vi.fn(), update: (_t: number, c: ThreeContext) => { seen.ctx = c; seen.camAtUpdate = c.camera.position.toArray(); }, ...over } as unknown as SequenceSpec, shape, shape);
  return { seq, seen };
};
const sceneOf = (seq: ThreeSequence) => (seq as any)._scene;
const lightsIn = (seq: ThreeSequence) => (sceneOf(seq).children as any[]).filter((c) => c.isLight);
beforeEach(() => { spaceAt.mockClear(); vi.restoreAllMocks(); });

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

void MockWebGLRenderer;
