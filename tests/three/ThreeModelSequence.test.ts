import { describe, it, expect, vi, beforeEach } from 'vitest';

// Real three maths and the real GLTFLoader parser (the fixture is a box that turns 360° about y in 2 s: clip "Spin"); only the renderers are mocks.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  const { MockWebGLRenderer } = await import('./mockRenderers');
  return { ...actual, WebGLRenderer: MockWebGLRenderer };
});
vi.mock('three/webgpu', async () => { const { MockWebGPURenderer } = await import('./mockRenderers'); return { WebGPURenderer: MockWebGPURenderer }; });
const loaded: string[] = [];
vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const real: any = await vi.importActual('three/addons/loaders/GLTFLoader.js');
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  class GLTFLoader extends real.GLTFLoader {
    async loadAsync(url: string) {
      loaded.push(url);
      if (/missing/.test(url)) throw new Error('404 Not Found');
      return this.parseAsync(readFileSync(resolve(__dirname, '../fixtures/spin-box.gltf'), 'utf8'), '');
    }
  }
  return { GLTFLoader };
});

import { Box3, Frustum, Matrix4, Sphere, Vector3, type Object3D, type PerspectiveCamera, type DirectionalLight, type AmbientLight } from 'three';
import { ThreeModelSequence } from '../../src/three/ThreeModelSequence';
import { MockWebGLRenderer, MockWebGPURenderer } from './mockRenderers';
import type { ModelSequenceSpec } from '../../src/types';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10, frameRate: 30 };
const make = (over: Partial<ModelSequenceSpec> = {}) =>
  new ThreeModelSequence({ type: 'model', asset: 'models/spin-box.gltf', ...over } as unknown as SequenceSpec, shape, shape);
const objects = (seq: ThreeModelSequence) => (seq as any)._objects as Record<string, any>;
const box = (seq: ThreeModelSequence) => (objects(seq).model as Object3D).getObjectByName('box')!;
/** The rotation about y of the box, in turns of 0..1 (0.25 = 90°), from its quaternion. */
const turns = (seq: ThreeModelSequence) => { const q = box(seq).quaternion; return (2 * Math.atan2(Math.abs(q.y), Math.abs(q.w))) / (2 * Math.PI); };

beforeEach(() => { loaded.length = 0; });

describe('model layer: loading', () => {
  it('loads the asset URL with GLTFLoader, puts the model in the scene, draws it with the WebGL renderer, and exposes what keyframes can address', async () => {
    const seq = make();
    await seq.build();
    expect(loaded).toEqual(['models/spin-box.gltf']);
    expect((seq as any)._renderer).toBeInstanceOf(MockWebGLRenderer);
    expect(Object.keys(objects(seq)).sort()).toEqual(['ambient', 'camera', 'fill', 'key', 'model']);
    expect(box(seq)).toBeTruthy();
    expect(seq.target).toBeTruthy();
  });

  it("a failed load says which asset (a typo in the URL is the usual cause) and releases the renderer", async () => {
    const seq = make({ asset: 'models/missing.glb' });
    await expect(seq.build()).rejects.toThrow(/models\/missing\.glb/);
    expect((seq as any)._renderer).toBeNull();
  });

  it("the engine's own options are in the `three` block: three: { renderer: 'webgpu', antialias } reaches the renderer, as on a three layer", async () => {
    const seq = make({ three: { renderer: 'webgpu', antialias: false } });
    await seq.build();
    expect((seq as any)._renderer).toBeInstanceOf(MockWebGPURenderer);
    expect(((seq as any)._renderer as MockWebGPURenderer).opts).toMatchObject({ antialias: false });
    const gl = make({ three: { antialias: false } }); await gl.build();
    expect(((gl as any)._renderer as MockWebGLRenderer).opts).toMatchObject({ antialias: false });
  });
});

describe('model layer: the clip is posed by the time, never by a clock', () => {
  it('plays the first clip by default: the box has turned 90° at 0.5 s', async () => {
    const seq = make(); await seq.build();
    await seq.awaitFrameAt(0.5);
    expect(turns(seq)).toBeCloseTo(0.25, 3);
  });

  it('a clip by name, by index, and animation: false (the bind pose: it does not turn)', async () => {
    for (const animation of ['Spin', 0] as const) {
      const seq = make({ animation }); await seq.build();
      await seq.awaitFrameAt(0.5);
      expect(turns(seq), String(animation)).toBeCloseTo(0.25, 3);
    }
    const still = make({ animation: false }); await still.build();
    await still.awaitFrameAt(0.5);
    expect(turns(still)).toBeCloseTo(0, 3);
  });

  it('an unknown clip name stops the build, listing the clips the file has', async () => {
    await expect(make({ animation: 'Run' }).build()).rejects.toThrow(/"Run".*Spin/s);
    await expect(make({ animation: 3 }).build()).rejects.toThrow(/Spin/);
  });

  it('clip time = t × animationSpeed + animationOffset; the clip repeats (loop) or holds its last pose (loop: false)', async () => {
    const fast = make({ animationSpeed: 2 }); await fast.build(); await fast.awaitFrameAt(0.25);
    expect(turns(fast), 'speed 2 at 0.25 s = clip 0.5 s').toBeCloseTo(0.25, 3);
    const late = make({ animationOffset: 0.5 }); await late.build(); await late.awaitFrameAt(0);
    expect(turns(late), 'offset 0.5').toBeCloseTo(0.25, 3);
    const again = make(); await again.build(); await again.awaitFrameAt(2.5);
    expect(turns(again), 'loop: 2.5 s = 0.5 s').toBeCloseTo(0.25, 3);
    const hold = make({ loop: false }); await hold.build(); await hold.awaitFrameAt(2.5);
    expect(turns(hold), 'loop: false holds the last key (a whole turn: back where it started), not the 0.25 of a repeat').toBeCloseTo(0, 3);
  });

  it('a seek forward, backward and a repeat give the same pose, and time passing in the real world changes nothing', async () => {
    const seq = make(); await seq.build();
    const at = async (t: number) => { await seq.awaitFrameAt(t); const q = box(seq).quaternion; return [q.x, q.y, q.z, q.w].map((v) => +v.toFixed(6)); };
    const first = await at(0.5);
    await at(1.5);
    await at(0.2);
    expect(await at(0.5)).toEqual(first);
    await new Promise((r) => setTimeout(r, 80));
    await seq.awaitFrameAt(0.5);
    expect([box(seq).quaternion.x, box(seq).quaternion.y, box(seq).quaternion.z, box(seq).quaternion.w].map((v) => +v.toFixed(6))).toEqual(first);
  });
});

describe('model layer: the camera and the lights', () => {
  it('fit: the whole model is inside the camera frustum, and the camera looks at its centre from the distance that just holds its bounding sphere (with a 10 % margin)', async () => {
    const seq = make(); await seq.build();
    const cam = objects(seq).camera as PerspectiveCamera;
    cam.updateMatrixWorld(true);
    const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    const bounds = new Box3().setFromObject(objects(seq).model);
    expect(frustum.intersectsBox(bounds)).toBe(true);
    for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
      expect(frustum.containsPoint(new Vector3(x, y, z)), `corner ${x},${y},${z}`).toBe(true);
    }
    const radius = bounds.getBoundingSphere(new Sphere()).radius;
    const centre = bounds.getCenter(new Vector3());
    expect(cam.position.distanceTo(centre)).toBeCloseTo((radius / Math.sin((cam.fov * Math.PI) / 360)) * 1.1, 2);
    const forward = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(forward.dot(centre.clone().sub(cam.position).normalize())).toBeGreaterThan(0.9999);
  });

  it('camera: { fov, position, lookAt } overrides the automatic one; fit: false with no camera is a camera at (0, 0, 5)', async () => {
    const set = make({ camera: { fov: 30, position: [0, 1, 6], lookAt: [0, 0, 0] } }); await set.build();
    const cam = objects(set).camera as PerspectiveCamera;
    expect(cam.fov).toBe(30);
    expect(cam.position.toArray()).toEqual([0, 1, 6]);
    const plain = make({ fit: false }); await plain.build();
    expect((objects(plain).camera as PerspectiveCamera).position.toArray()).toEqual([0, 0, 5]);
  });

  it("light: 'studio' (the default) adds a key and a fill directional light and an ambient light; 'none' adds none", async () => {
    const studio = make(); await studio.build();
    expect((objects(studio).key as DirectionalLight).isDirectionalLight).toBe(true);
    expect((objects(studio).fill as DirectionalLight).isDirectionalLight).toBe(true);
    expect((objects(studio).ambient as AmbientLight).isAmbientLight).toBe(true);
    const none = make({ light: 'none' }); await none.build();
    expect(Object.keys(objects(none)).sort()).toEqual(['camera', 'model']);
  });
});

describe('model layer: a bad option says what is allowed', () => {
  it('light, fit and loop are checked', async () => {
    await expect(make({ light: 'sun' as any }).build()).rejects.toThrow(/light.*'studio' or 'none'/);
    await expect(make({ fit: 'cover' as any }).build()).rejects.toThrow(/fit.*'contain' or false/);
  });
});
