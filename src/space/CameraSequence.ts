import { Container } from 'pixi.js';
import { Sequence } from '../sequences/Base';
import { MAX_FOV, MIN_FOV, clampFov, homeCamera, homeDistance, type CameraState } from './math';
import { collectPropKeys } from './specKeys';
import { DEFAULT_APERTURE, withFocusResolved } from './focus';
import type { CameraWindow } from './camera';
import type { CameraSequenceSpec, Keyframe } from '../types';

type Carrier = Container & {
  z: number; lookAtX: number; lookAtY: number; lookAtZ: number; fov: number; focus: number; aperture: number;
  offsetX: number; offsetY: number; offsetZ: number; lookOffsetX: number; lookOffsetY: number; lookOffsetZ: number;
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
  /** True when the camera writes `focus` or `aperture` anywhere: depth of field is on. */
  private dof = false;
  private zOfName: ((name: string) => number | undefined) | null = null;

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
    carrier.focus = 0;                              // the z = 0 plane, the one the home camera shows 1:1
    carrier.aperture = DEFAULT_APERTURE;
    // added on top of the camera's own move: put a handheld shake (wiggle) here and it never collides with a dolly or an orbit
    carrier.offsetX = carrier.offsetY = carrier.offsetZ = 0;
    carrier.lookOffsetX = carrier.lookOffsetY = carrier.lookOffsetZ = 0;
    this.target = carrier as unknown as Container;
    const keys = collectPropKeys(this.spec);
    this.autoZ = !keys.has('z');
    this.dof = keys.has('focus') || keys.has('aperture');
  }

  /** Called by the composition once its children exist: how a layer name in `focus` becomes the z of that layer. */
  resolveFocusNames(zOf: (name: string) => number | undefined): void {
    this.zOfName = zOf;
  }

  protected override displayProps(): ReturnType<Sequence['displayProps']> {
    const base = super.displayProps();
    return this.zOfName ? (withFocusResolved(base as { initial?: Record<string, unknown>; keyframes?: Keyframe[] }, this.zOfName) as typeof base) : base;
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
      x: c.x + c.offsetX, y: c.y + c.offsetY, z: z + c.offsetZ,
      lookAtX: c.lookAtX + c.lookOffsetX, lookAtY: c.lookAtY + c.lookOffsetY, lookAtZ: c.lookAtZ + c.lookOffsetZ,
      fov, focus: Number.isFinite(c.focus) ? c.focus : 0, aperture: this.dof && c.aperture > 0 ? c.aperture : 0,
    };
  }

  /** Lifespan on the global timeline (valid after bindTimeline). */
  window(): CameraWindow {
    const start = this.absoluteStart ?? this.at;
    return { start, end: start + (this.duration ?? 0) };
  }
}
