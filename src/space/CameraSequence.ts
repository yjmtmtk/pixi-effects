import { Container } from 'pixi.js';
import { Sequence } from '../sequences/Base';
import { MAX_FOV, MIN_FOV, clampFov, homeCamera, homeDistance, type CameraState } from './math';
import { collectPropKeys } from './specKeys';
import type { CameraWindow } from './camera';
import type { CameraSequenceSpec } from '../types';

type Carrier = Container & {
  z: number; lookAtX: number; lookAtY: number; lookAtZ: number; fov: number;
};

/**
 * `type: 'camera'`. Has no display object: `target` is a detached carrier whose
 * numeric props GSAP tweens exactly like any other layer, so the camera reuses
 * the whole `initial` / `keyframes` / expression pipeline. It is never added to
 * the scene graph.
 */
export class CameraSequence extends Sequence {
  declare spec: CameraSequenceSpec;
  /** True when `z` is never specified anywhere: z then follows `fov`. */
  autoZ = true;
  private compH = 0;
  private warnedFov = false;
  private warnedLookAt = false;

  async build(): Promise<void> {
    const compW = this.parent?.width ?? this.root.width;
    this.compH = this.parent?.height ?? this.root.height;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }
    const home = homeCamera(compW, this.compH);
    const carrier = new Container() as unknown as Carrier;
    carrier.x = home.x;
    carrier.y = home.y;
    carrier.z = home.z;
    carrier.lookAtX = home.lookAtX;
    carrier.lookAtY = home.lookAtY;
    carrier.lookAtZ = home.lookAtZ;
    carrier.fov = home.fov;
    this.target = carrier as unknown as Container;
    this.autoZ = !collectPropKeys(this.spec).has('z');
  }

  /** The camera's state at the current timeline position. */
  state(): CameraState {
    const c = this.target as unknown as Carrier;
    if (!this.warnedFov && !(c.fov >= MIN_FOV && c.fov <= MAX_FOV)) {
      this.warnedFov = true;
      const who = this.spec.name ? ` "${this.spec.name}"` : '';
      console.warn(`pixi-effects: camera${who}: fov ${c.fov} is outside [${MIN_FOV}, ${MAX_FOV}]; clamped`);
    }
    const fov = clampFov(c.fov);
    const z = this.autoZ ? homeDistance(this.compH, fov) : c.z;
    if (!this.warnedLookAt && c.lookAtX === c.x && c.lookAtY === c.y && c.lookAtZ === z) {
      this.warnedLookAt = true;
      const who = this.spec.name ? ` "${this.spec.name}"` : '';
      console.warn(`pixi-effects: camera${who}: lookAt equals the camera position; looking along -z instead`);
    }
    return {
      x: c.x, y: c.y, z,
      lookAtX: c.lookAtX, lookAtY: c.lookAtY, lookAtZ: c.lookAtZ,
      fov,
    };
  }

  /** Lifespan on the global timeline (valid after bindTimeline). */
  window(): CameraWindow {
    const start = this.absoluteStart ?? this.at;
    return { start, end: start + (this.duration ?? 0) };
  }
}
