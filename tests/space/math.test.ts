import { describe, it, expect } from 'vitest';
import {
  DEG, DEFAULT_FOV, NEAR, clampFov, homeDistance, homeCamera, cameraBasis,
  layerToWorld, projectLayer, type LayerTransform, type CameraState,
} from '../../src/space/math';

const W = 1280;
const H = 720;

function T(o: Partial<LayerTransform> = {}): LayerTransform {
  return { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0, ...o };
}
const frame = { x: 0, y: 0, width: 200, height: 100 };
const home = () => cameraBasis(homeCamera(W, H), W, H);

describe('homeDistance / clampFov', () => {
  it('home distance makes the z=0 plane 1:1', () => {
    expect(homeDistance(720, 40)).toBeCloseTo(360 / Math.tan(20 * DEG), 9);
  });
  it('clamps fov to [1, 179] and falls back on non-finite', () => {
    expect(clampFov(0)).toBe(1);
    expect(clampFov(500)).toBe(179);
    expect(clampFov(NaN)).toBe(DEFAULT_FOV);
    expect(clampFov(55)).toBe(55);
  });
});

describe('layerToWorld', () => {
  it('rotationY +90deg sends the right edge away from the viewer (CSS sign)', () => {
    const p = layerToWorld(T({ rotationY: Math.PI / 2 }), 100, 0);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(-100, 9);
  });
  it('rotationX +90deg brings the bottom edge toward the viewer (CSS sign)', () => {
    const p = layerToWorld(T({ rotationX: Math.PI / 2 }), 0, 100);
    expect(p.y).toBeCloseTo(0, 9);
    expect(p.z).toBeCloseTo(100, 9);
  });
  it('rotationZ +90deg turns the right point downward (y-down, clockwise)', () => {
    const p = layerToWorld(T({ rotationZ: Math.PI / 2 }), 100, 0);
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(100, 9);
  });
  it('matches the 2D Pixi transform: T(x,y) R S T(-pivot)', () => {
    const a = 30 * DEG;
    const t = T({ x: 500, y: 300, pivotX: 10, pivotY: 20, scaleX: 2, scaleY: 3, rotationZ: a });
    const p = layerToWorld(t, 50, 60);
    const lx = (50 - 10) * 2;
    const ly = (60 - 20) * 3;
    expect(p.x).toBeCloseTo(500 + lx * Math.cos(a) - ly * Math.sin(a), 9);
    expect(p.y).toBeCloseTo(300 + lx * Math.sin(a) + ly * Math.cos(a), 9);
    expect(p.z).toBeCloseTo(0, 9);
  });
});

describe('projectLayer', () => {
  it('identity: z=0 + default camera reproduces the 2D corners', () => {
    const r = projectLayer(T({ x: 100, y: 50 }), frame, home());
    const want = [100, 50, 300, 50, 300, 150, 100, 150];
    r.corners.forEach((c, i) => expect(c).toBeCloseTo(want[i]!, 6));
    expect(r.visible).toBe(true);
  });

  it('nearer layers (+z) are larger, farther (-z) are smaller', () => {
    const D = homeDistance(H, DEFAULT_FOV);
    const near = projectLayer(T({ x: 100, y: 50, z: 300 }), frame, home());
    const far = projectLayer(T({ x: 100, y: 50, z: -300 }), frame, home());
    expect(near.corners[2]! - near.corners[0]!).toBeCloseTo((200 * D) / (D - 300), 6);
    expect(far.corners[2]! - far.corners[0]!).toBeCloseTo((200 * D) / (D + 300), 6);
    expect(near.depth).toBeLessThan(far.depth);
  });

  it('changing fov (with auto z) leaves the z=0 plane fixed but changes perspective strength', () => {
    const at = (fov: number, z: number) => {
      const b = cameraBasis(homeCamera(W, H, fov), W, H);
      const r = projectLayer(T({ x: 100, y: 50, z }), frame, b);
      return r.corners[2]! - r.corners[0]!;
    };
    expect(at(20, 0)).toBeCloseTo(200, 6);
    expect(at(80, 0)).toBeCloseTo(200, 6);
    expect(at(80, 200)).toBeGreaterThan(at(20, 200));
  });

  it('truck: moving camera and lookAt by +100 shifts z=0 content by -100px', () => {
    const cam: CameraState = { ...homeCamera(W, H) };
    cam.x += 100;
    cam.lookAtX += 100;
    const r = projectLayer(T({ x: 100, y: 50 }), frame, cameraBasis(cam, W, H));
    expect(r.corners[0]).toBeCloseTo(0, 6);
    expect(r.corners[1]).toBeCloseTo(50, 6);
  });

  it('looking right (lookAtX up) moves z=0 content left', () => {
    const cam: CameraState = { ...homeCamera(W, H) };
    cam.lookAtX = W / 2 + 200;
    const r = projectLayer(T({ x: 640, y: 360 }), frame, cameraBasis(cam, W, H));
    expect(r.corners[0]!).toBeLessThan(640);
  });

  it('hides a layer at or behind the camera plane', () => {
    const D = homeDistance(H, DEFAULT_FOV);
    const tiny = { x: 0, y: 0, width: 10, height: 10 };
    expect(projectLayer(T({ z: D + 10 }), tiny, home()).visible).toBe(false);
    expect(projectLayer(T({ z: D - NEAR }), tiny, home()).visible).toBe(false);
    expect(projectLayer(T({ z: D - 50 }), tiny, home()).visible).toBe(true);
  });
});

describe('cameraBasis degenerate cases', () => {
  it('lookAt equal to the position falls back to looking along -z (no NaN)', () => {
    const cam: CameraState = { ...homeCamera(W, H) };
    cam.lookAtX = cam.x; cam.lookAtY = cam.y; cam.lookAtZ = cam.z;
    const b = cameraBasis(cam, W, H);
    expect(b.fz).toBe(-1);
    expect(Object.values(b).some(Number.isNaN)).toBe(false);
  });
  it('looking straight down has no NaN (right-vector fallback)', () => {
    const cam: CameraState = { x: 640, y: -500, z: 0, lookAtX: 640, lookAtY: 360, lookAtZ: 0, fov: 40 };
    const b = cameraBasis(cam, W, H);
    expect(Object.values(b).some(Number.isNaN)).toBe(false);
  });
});
