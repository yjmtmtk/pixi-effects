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
