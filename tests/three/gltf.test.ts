import { describe, it, expect, vi, beforeEach } from 'vitest';

// Real three maths and the real GLTFLoader parser (the fixtures: spin-box is a unit box that turns 360° about y in 2 s, clip "Spin"; long-box is a 0.5 x 0.5 x 3 box with no clip). Nothing is drawn.
const loaded: string[] = [];
vi.mock('three/addons/loaders/GLTFLoader.js', async () => {
  const real: any = await vi.importActual('three/addons/loaders/GLTFLoader.js');
  const { readFileSync } = await import('node:fs');
  const { resolve } = await import('node:path');
  class GLTFLoader extends real.GLTFLoader {
    async loadAsync(url: string) {
      loaded.push(url);
      if (/missing/.test(url)) throw new Error('404 Not Found');
      return this.parseAsync(readFileSync(resolve(__dirname, '../fixtures', /long/.test(url) ? 'long-box.gltf' : 'spin-box.gltf'), 'utf8'), '');
    }
  }
  return { GLTFLoader };
});

import { Box3, PerspectiveCamera, Vector3, type Object3D } from 'three';
import { threeGltf, threeFrameCamera } from '../../src/three/gltf';

beforeEach(() => { loaded.length = 0; });
const boxOf = (o: Object3D) => o.getObjectByName('box')!;
/** The rotation about y of the box, in turns of 0..1 (0.25 = 90°), from its quaternion. */
const turns = (o: Object3D) => { const q = boxOf(o).quaternion; return (2 * Math.atan2(Math.abs(q.y), Math.abs(q.w))) / (2 * Math.PI); };
const quat = (o: Object3D) => { const q = boxOf(o).quaternion; return [q.x, q.y, q.z, q.w].map((v) => +v.toFixed(6)); };

describe('threeGltf: loading', () => {
  it('loads the URL with GLTFLoader and gives back a group to add to the scene, the names of the clips, and the size of the model', async () => {
    const m = await threeGltf('models/spin-box.gltf');
    expect(loaded).toEqual(['models/spin-box.gltf']);
    expect(m.object.type).toBe('Group');
    expect(boxOf(m.object)).toBeTruthy();
    expect(m.clips).toEqual(['Spin']);
    expect(m.size.toArray().map((v) => +v.toFixed(6))).toEqual([1, 1, 1]);
  });

  it("the group's origin is the centre of the model's box (so a model can be placed and turned about its centre) and the size of the long fixture is 0.5 x 0.5 x 3", async () => {
    const m = await threeGltf('models/long-box.gltf');
    const b = new Box3().setFromObject(m.object);
    expect(b.getCenter(new Vector3()).length()).toBeLessThan(1e-6);
    expect(m.size.toArray().map((v) => +v.toFixed(6))).toEqual([0.5, 0.5, 3]);
    expect(m.clips).toEqual([]);
  });

  it('a failed load says which URL (a typo in it is the usual cause)', async () => {
    await expect(threeGltf('models/missing.glb')).rejects.toThrow(/models\/missing\.glb/);
  });

  it('an unknown clip name stops the load, listing the clips the file has; so does an index with no clip', async () => {
    await expect(threeGltf('models/spin-box.gltf', { animation: 'Run' })).rejects.toThrow(/"Run".*Spin/s);
    await expect(threeGltf('models/spin-box.gltf', { animation: 3 })).rejects.toThrow(/Spin/);
  });

  it('asks for the url, with a sentence, when there is none', async () => {
    await expect(threeGltf('' as string)).rejects.toThrow(/\.glb or \.gltf/);
  });
});

describe('threeGltf: the clip is posed by the time, never by a clock', () => {
  it('plays the first clip by default: the box has turned 90° at 0.5 s (the bind pose before pose() is called)', async () => {
    const m = await threeGltf('models/spin-box.gltf');
    expect(turns(m.object)).toBeCloseTo(0, 3);
    m.pose(0.5);
    expect(turns(m.object)).toBeCloseTo(0.25, 3);
  });

  it('a clip by name, by index, and animation: false (the bind pose: it does not turn)', async () => {
    for (const animation of ['Spin', 0] as const) {
      const m = await threeGltf('models/spin-box.gltf', { animation });
      m.pose(0.5);
      expect(turns(m.object), String(animation)).toBeCloseTo(0.25, 3);
    }
    const still = await threeGltf('models/spin-box.gltf', { animation: false });
    still.pose(0.5);
    expect(turns(still.object)).toBeCloseTo(0, 3);
  });

  it('clip time = t × speed + offset; the clip repeats (loop) or holds its last pose (loop: false)', async () => {
    const fast = await threeGltf('models/spin-box.gltf', { speed: 2 }); fast.pose(0.25);
    expect(turns(fast.object), 'speed 2 at 0.25 s = clip 0.5 s').toBeCloseTo(0.25, 3);
    const late = await threeGltf('models/spin-box.gltf', { offset: 0.5 }); late.pose(0);
    expect(turns(late.object), 'offset 0.5').toBeCloseTo(0.25, 3);
    const again = await threeGltf('models/spin-box.gltf'); again.pose(2.5);
    expect(turns(again.object), 'loop: 2.5 s = 0.5 s').toBeCloseTo(0.25, 3);
    const hold = await threeGltf('models/spin-box.gltf', { loop: false }); hold.pose(2.5);
    expect(turns(hold.object), 'loop: false holds the last key (a whole turn: back where it started), not the 0.25 of a repeat').toBeCloseTo(0, 3);
  });

  it('a seek forward, backward and a repeat give the same pose, and time passing in the real world changes nothing', async () => {
    const m = await threeGltf('models/spin-box.gltf');
    m.pose(0.5);
    const first = quat(m.object);
    m.pose(1.5); m.pose(0.2);
    m.pose(0.5);
    expect(quat(m.object)).toEqual(first);
    await new Promise((r) => setTimeout(r, 80));
    m.pose(0.5);
    expect(quat(m.object)).toEqual(first);
  });

  it('a model with no clip can be posed (nothing happens) and disposed', async () => {
    const m = await threeGltf('models/long-box.gltf');
    expect(() => { m.pose(1); m.dispose(); }).not.toThrow();
  });
});

describe('threeGltf: fit(px)', () => {
  it("scales the group so the model's longest side is `px` (a model in metres to a scene in pixels), about its centre", async () => {
    const m = await threeGltf('models/long-box.gltf');
    m.fit(600);
    const b = new Box3().setFromObject(m.object);
    expect(b.getSize(new Vector3()).toArray().map((v) => +v.toFixed(4))).toEqual([100, 100, 600]);
    expect(b.getCenter(new Vector3()).length()).toBeLessThan(1e-6);
    m.object.position.set(300, -270, 0);                                      // placed like any object: the centre goes there
    expect(new Box3().setFromObject(m.object).getCenter(new Vector3()).toArray().map((v) => +v.toFixed(4))).toEqual([300, -270, 0]);
  });
});

describe('threeFrameCamera', () => {
  const aspect = 16 / 9;
  /** The model's 8 bounding-box corners in the camera's normalised device coordinates. */
  const corners = (o: Object3D, cam: PerspectiveCamera) => {
    cam.updateMatrixWorld(true);
    const b = new Box3().setFromObject(o);
    const out: Vector3[] = [];
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) out.push(new Vector3(x, y, z).project(cam));
    return out;
  };

  it('the whole model is inside the frame, and it FILLS the frame (the limiting side of the bounding box lands at 85-100 % of the way to the edge: a 10 % margin, not a sphere that leaves a long model small)', async () => {
    for (const url of ['models/spin-box.gltf', 'models/long-box.gltf']) {
      const m = await threeGltf(url);
      const cam = new PerspectiveCamera(40, aspect, 0.1, 100);
      threeFrameCamera(cam, m.object);
      const c = corners(m.object, cam);
      const reach = Math.max(...c.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
      expect(reach, `${url}: reach (1 = the edge of the frame)`).toBeLessThanOrEqual(1);
      expect(reach, `${url}: reach`).toBeGreaterThan(0.85);
      expect(c.every((p) => p.z < 1 && p.z > -1), `${url}: in front of the camera, inside near and far`).toBe(true);
    }
  });

  it('works for a model in pixels too (scaled by fit and placed away from the origin): the same framing, near and far follow the distance', async () => {
    const m = await threeGltf('models/long-box.gltf');
    m.fit(600); m.object.position.set(300, -270, -400);
    const cam = new PerspectiveCamera(50, aspect, 0.1, 100);
    threeFrameCamera(cam, m.object);
    const c = corners(m.object, cam);
    const reach = Math.max(...c.flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
    expect(reach).toBeLessThanOrEqual(1); expect(reach).toBeGreaterThan(0.85);
    expect(c.every((p) => p.z < 1 && p.z > -1)).toBe(true);
  });

  it('the camera looks at the centre of the model from a three-quarter view (a little from the side and above), not head-on', async () => {
    const m = await threeGltf('models/long-box.gltf');
    const cam = new PerspectiveCamera(40, aspect, 0.1, 100);
    threeFrameCamera(cam, m.object);
    const centre = new Box3().setFromObject(m.object).getCenter(new Vector3());
    const forward = new Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    expect(forward.dot(centre.clone().sub(cam.position).normalize())).toBeGreaterThan(0.9999);
    const away = cam.position.clone().sub(centre).normalize();
    expect(away.x, 'from the side').toBeGreaterThan(0.2);
    expect(away.y, 'from above').toBeGreaterThan(0.1);
    expect(away.z, 'still mostly in front').toBeGreaterThan(0.6);
  });

  it('{ direction, margin } change the view: from straight ahead with a bigger margin the model is smaller in the frame', async () => {
    const m = await threeGltf('models/spin-box.gltf');
    const a = new PerspectiveCamera(40, aspect, 0.1, 100), b = new PerspectiveCamera(40, aspect, 0.1, 100);
    threeFrameCamera(a, m.object);
    threeFrameCamera(b, m.object, { direction: [0, 0, 1], margin: 1.5 });
    expect(b.position.x).toBeCloseTo(0, 6);
    expect(b.position.y).toBeCloseTo(0, 6);
    const reach = Math.max(...corners(m.object, b).flatMap((p) => [Math.abs(p.x), Math.abs(p.y)]));
    expect(reach).toBeLessThan(Math.max(...corners(m.object, a).flatMap((p) => [Math.abs(p.x), Math.abs(p.y)])));
  });
});
