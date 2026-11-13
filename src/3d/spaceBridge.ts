/**
 * What lets a `scene3d` layer live in the composition's space (`followCamera`, `followLights`, `followFog`): the composition's camera, lights and fog, in PixiJS 3D.
 *
 * The scene is in composition pixels with y flipped: a point the composition calls (x, y, z) is (x, -y, z) here (the composition's y runs down, PixiJS 3D's up; +z is toward
 * the viewer in both). A camera with the composition camera's position, look-at point and vertical fov then projects that point to the pixel the composition's own projection
 * gives it (tests/3d/spaceBridge.test.ts checks it to 1e-3 px: PixiJS 3D computes in 32-bit floats).
 */
import type { Camera3D } from '@pixi/3d';
import type { CameraState } from '../space/math';

/** The camera's near plane and far plane in composition pixels: the home camera sits about 740 px from the picture, a long dolly can be several thousand. */
const NEAR = 1;
const FAR = 20000;

/** Put a PixiJS 3D camera where the composition camera is. The aspect is the view's (it must be the composition's: see `followCamera`). */
export function applyCameraState(camera: Camera3D, s: CameraState): void {
  camera.mode = 'perspective';
  camera.zoom = 1;
  camera.fov = s.fov;
  camera.near = NEAR;
  camera.far = FAR;
  camera.position.set(s.x, -s.y, s.z);
  const same = Math.hypot(s.lookAtX - s.x, s.lookAtY - s.y, s.lookAtZ - s.z) < 1e-9;       // the composition then looks along -z
  camera.lookAt(same ? { x: s.x, y: -s.y, z: s.z - 1 } : { x: s.lookAtX, y: -s.lookAtY, z: s.lookAtZ });
}
