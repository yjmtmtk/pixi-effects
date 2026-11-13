/**
 * What lets a `scene3d` layer live in the composition's space (`followCamera`, `followLights`, `followFog`): the composition's camera, lights and fog, in PixiJS 3D.
 *
 * The scene is in composition pixels with y flipped: a point the composition calls (x, y, z) is (x, -y, z) here (the composition's y runs down, PixiJS 3D's up; +z is toward
 * the viewer in both). A camera with the composition camera's position, look-at point and vertical fov then projects that point to the pixel the composition's own projection
 * gives it (tests/3d/spaceBridge.test.ts checks it to 1e-3 px: PixiJS 3D computes in 32-bit floats).
 */
import { AmbientLight, Box, DirectionalLight, PointLight, SpotLight, type Camera3D, type Container3D, type View3D } from '@pixi/3d';
import type { CameraState } from '../space/math';
import type { LightState } from '../space/lighting';
import type { FogState } from '../space/LitMaterial';

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

type AnyLight = AmbientLight | DirectionalLight | PointLight | SpotLight;
interface Entry { kind: LightState['kind']; light: AnyLight }

/**
 * The composition's lights as PixiJS 3D lights, one per light layer alive, in layer order. Made once and moved every frame; a light that has ended is switched off
 * (`visible = false`), not removed.
 *
 * Intensity: PixiJS 3D divides direct and ambient light by pi (as three does), so intensity 1 is multiplied by pi to be "as bright as the colour" like a card's shading.
 * Falloff: a point / spot light attenuates by window(range) / sqrt(d^4 + R^4), R being its bulb `radius`:
 *   - 'none': a bulb far larger than the scene (R = 100 x the extent) and the intensity times R^2: 1 everywhere in the scene, to 1e-8.
 *   - 'inverseSquare': R = the composition's radius and the intensity times R^2: (radius / d)^2 far out, exactly; at d = radius 0.71 instead of the composition's 1.
 *   - 'smooth': a flat bulb times the range window, the range and a gain fitted to the composition's smoothstep (see SMOOTH_FIT).
 * Shadows: parallel and spot lights cast (`castShadow`); a point light cannot in PixiJS 3D (said once). The scene is in pixels, so PixiJS 3D's defaults (made for a scene of a
 * few units) lose the shadow (found 2026-11-13, lab spike03: no shadow at 100x scale):
 *   - a parallel light fits its shadow box to the casters only, so a wall behind them falls outside it: the box is the whole scene (`center`, side `extent`);
 *   - a spot light's shadow stops at 1000 units without a range, and its depth bias of 0.001 (after the perspective divide) is more than the depth between a caster and a
 *     wall a few hundred pixels behind it: the range is far beyond the scene and the bias 1e-5.
 */
export class LightMirror {
  private entries: Entry[] = [];
  private said = new Set<string>();
  constructor(private readonly root: Container3D, private readonly extent = 2000, private readonly say: (message: string) => void = () => {}, private readonly center: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }) {}

  update(lights: readonly LightState[]): void {
    lights.forEach((s, i) => {
      let e = this.entries[i];
      if (!e || e.kind !== s.kind) {
        if (e) this.remove(e);
        e = this.entries[i] = this.make(s.kind);
      }
      this.configure(e, s);
    });
    for (let i = lights.length; i < this.entries.length; i++) this.entries[i]!.light.visible = false;
  }

  dispose(): void {
    for (const e of this.entries) this.remove(e);
    this.entries = [];
  }

  /** The lights now live under another root (a rebuild moved the scene into a new view): new lights go there. */
  rehome(root: Container3D): void {
    (this as unknown as { root: Container3D }).root = root;
  }

  private once(key: string, message: string): void {
    if (this.said.has(key)) return;
    this.said.add(key);
    this.say(message);
  }

  private make(kind: LightState['kind']): Entry {
    const light: AnyLight = kind === 'ambient' ? new AmbientLight() : kind === 'parallel' ? new DirectionalLight() : kind === 'spot' ? new SpotLight() : new PointLight();
    light.label = 'pixi-effects:composition-light';
    this.root.addChild(light);
    return { kind, light };
  }

  private remove(e: Entry): void {
    e.light.removeFromParent();
    e.light.destroy();
  }

  private configure(e: Entry, s: LightState): void {
    const { light } = e;
    light.visible = true;
    light.color = [s.r, s.g, s.b];
    let intensity = s.intensity * Math.PI;
    if (s.kind !== 'ambient') {
      light.position.set(s.x, -s.y, s.z);
      const same = Math.hypot(s.lookAtX - s.x, s.lookAtY - s.y, s.lookAtZ - s.z) < 1e-9;
      if (s.kind !== 'point') light.lookAt(same ? { x: s.x, y: -s.y, z: s.z - 1 } : { x: s.lookAtX, y: -s.lookAtY, z: s.lookAtZ });
    }
    if (s.kind === 'point' || s.kind === 'spot') {
      const l = light as PointLight | SpotLight;
      const flat = 100 * this.extent;
      const shadowRange = s.kind === 'spot' && s.castsShadows ? 20 * this.extent : 0;
      if (s.falloff === 'inverseSquare') { l.radius = Math.max(s.radius, 1e-3); intensity *= l.radius * l.radius; l.range = shadowRange; }
      else if (s.falloff === 'smooth') {
        const reach = s.radius + Math.max(s.falloffDistance, 1e-3), p = s.radius / reach;
        l.radius = flat; intensity *= flat * flat * (SMOOTH_FIT.gain[0] + SMOOTH_FIT.gain[1] * p);
        l.range = reach * (SMOOTH_FIT.range[0] + SMOOTH_FIT.range[1] * p);
      }
      else { l.radius = flat; intensity *= flat * flat; l.range = shadowRange; }
    }
    if (s.kind === 'spot') {
      const l = light as SpotLight;
      l.coneAngle = s.coneAngle / 2;
      l.penumbra = s.coneFeather;
    }
    light.intensity = intensity;
    if (s.kind !== 'ambient') {
      const casts = s.castsShadows && s.kind !== 'point';
      (light as DirectionalLight | PointLight | SpotLight).castShadow = casts;
      if (casts) {
        const shadow = (light as DirectionalLight | SpotLight).shadow as { bias?: number; bounds?: Box };
        if (s.kind === 'spot') shadow.bias = SPOT_SHADOW_BIAS;
        else shadow.bounds = (shadow.bounds ??= Box.fromCenterSize(this.center, this.extent));
      }
      if (s.castsShadows && s.kind === 'point') this.once('point', 'followLights: a point light casts no shadow in PixiJS 3D; use a spot light (or a parallel one) for the shadow');
      if (casts && (s.shadowDarkness < 1 || s.shadowDiffusion > 0)) {
        this.once('shadowLook', `followLights: shadowDarkness and shadowDiffusion are not mirrored (PixiJS 3D draws a shadow at full darkness with its view's own filter); the shadow is drawn ${s.shadowDarkness < 1 ? 'darker' : 'harder'} than on the cards`);
      }
    }
  }
}

/** A spot light's shadow bias in a scene of pixels (PixiJS 3D's default 0.001 hid every shadow at 100x scale). */
export const SPOT_SHADOW_BIAS = 1e-5;

/** The 'smooth' fit: range = reach x (a + b p), gain = c + d p, p = radius / (radius + falloffDistance) (measured against the composition's curve: tests/films/scene3d-space). */
export const SMOOTH_FIT = { range: [0.8, 0.45] as const, gain: [0.87, 0.45] as const };

/**
 * The composition camera's fog as the view's linear fog: the same colour, near and far (along the view, in composition pixels). PixiJS 3D's linear fog fades with
 * smoothstep where the composition's fades linearly, and has no amount below 1: close, not equal. The fog is set when the camera has one and taken away when it has not;
 * a fog the author set on the view is never touched.
 */
export class FogMirror {
  private own: { type: 'linear'; color: [number, number, number]; near: number; far: number } | null = null;
  constructor(private readonly view: Pick<View3D, 'fog'>) {}

  update(fog: FogState | null): void {
    const current = this.view.fog as unknown;
    if (current && current !== this.own) return;                                          // the author's own fog: leave it
    if (!fog) {
      if (this.own && current === this.own) this.view.fog = null;
      this.own = null;
      return;
    }
    if (!this.own) {
      this.own = { type: 'linear', color: [fog.r, fog.g, fog.b], near: fog.near, far: fog.far };
      this.view.fog = this.own as never;
    }
    this.own.color = [fog.r, fog.g, fog.b];
    this.own.near = fog.near;
    this.own.far = fog.far;
  }

  dispose(): void { this.update(null); }
}
