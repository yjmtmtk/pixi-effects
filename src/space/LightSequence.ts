/**
 * `type: 'light'`. Like the camera: no display object, a detached carrier whose numeric props GSAP tweens with the usual `initial` /
 * `keyframes` (x, y, z, lookAtX/Y/Z, intensity, color, coneAngle, coneFeather, radius, falloffDistance, shadowDarkness, shadowDiffusion).
 * `kind`, `falloff` and `castsShadows` are fixed settings on the layer. Never added to the scene graph.
 */
import { Color, Container } from 'pixi.js';
import { Sequence } from '../sequences/Base';
import { homeDistance } from './math';
import type { CameraWindow } from './camera';
import { FALLOFFS, LIGHT_KINDS, type LightState } from './lighting';
import type { LightSequenceSpec } from '../types';

type Carrier = Container & {
  z: number; lookAtX: number; lookAtY: number; lookAtZ: number; intensity: number; color: string | number;
  coneAngle: number; coneFeather: number; radius: number; falloffDistance: number; shadowDarkness: number; shadowDiffusion: number;
};

export class LightSequence extends Sequence {
  declare spec: LightSequenceSpec;
  private color = new Color();

  async build(): Promise<void> {
    const w = this.parent?.width ?? this.root.width;
    const h = this.parent?.height ?? this.root.height;
    if (this.duration === undefined) this.duration = this.parent?.duration ?? this.root.duration;
    const c = new Container() as unknown as Carrier;
    // default: up and to the left of the picture, between it and the camera (After Effects puts a new light up-left too)
    c.x = w * 0.3; c.y = h * 0.2; c.z = homeDistance(h, 40) * 0.6;
    c.lookAtX = w / 2; c.lookAtY = h / 2; c.lookAtZ = 0;
    c.intensity = 1; c.color = '#ffffff';
    c.coneAngle = 90; c.coneFeather = 0.5;
    c.radius = 500; c.falloffDistance = 500;
    c.shadowDarkness = 1; c.shadowDiffusion = 0;
    this.target = c as unknown as Container;
  }

  state(): LightState {
    const c = this.target as unknown as Carrier;
    try { this.color.setValue(c.color as never); } catch { this.color.setValue(0xffffff); }
    const [r, g, b] = this.color.toArray();
    return {
      // a kind or falloff nobody knows is the default the warning promises (the shader must never see an unknown id)
      kind: LIGHT_KINDS.includes(this.spec.kind as never) ? this.spec.kind! : 'point',
      x: c.x, y: c.y, z: c.z, lookAtX: c.lookAtX, lookAtY: c.lookAtY, lookAtZ: c.lookAtZ,
      r: r!, g: g!, b: b!, intensity: Number.isFinite(c.intensity) ? Math.max(0, c.intensity) : 1,
      coneAngle: c.coneAngle, coneFeather: c.coneFeather,
      falloff: FALLOFFS.includes(this.spec.falloff as never) ? this.spec.falloff! : 'none', radius: c.radius, falloffDistance: c.falloffDistance,
      castsShadows: !!this.spec.castsShadows,
      shadowDarkness: Math.min(1, Math.max(0, c.shadowDarkness)), shadowDiffusion: Math.max(0, c.shadowDiffusion),
    };
  }

  window(): CameraWindow {
    const start = this.absoluteStart ?? this.at;
    return { start, end: start + (this.duration ?? 0) };
  }
}
