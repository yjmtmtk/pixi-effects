/**
 * What lets a `three` layer live in the composition's space (`followCamera`, `followLights`): the composition's camera and lights, in three.
 *
 * The scene is in composition pixels with y flipped: a point the composition calls (x, y, z) is `new Vector3(x, -y, z)` here (the composition's y runs down, three's up;
 * +z is toward the viewer in both). A three camera with the composition camera's position, look-at point and vertical fov then projects that point to the pixel the
 * composition's own projection gives it (tests/three/spaceBridge.test.ts checks it to 1e-6 px).
 */
import { AmbientLight, Color, DirectionalLight, Fog, OrthographicCamera, PerspectiveCamera, PointLight, SRGBColorSpace, SpotLight, type Light, type Object3D, type Scene } from 'three';
import type { CameraState } from '../space/math';
import type { LightState } from '../space/lighting';
import type { FogState } from '../space/LitMaterial';

/** The camera's near plane and far plane in composition pixels: the home camera sits about 740 px from the picture, a long dolly can be several thousand. */
const NEAR = 1;
const FAR = 20000;

/** Put a three camera where the composition camera is. The aspect is the layer's (it must be the composition's: see `followCamera`). */
export function applyCameraState(camera: PerspectiveCamera, s: CameraState, aspect: number): void {
  camera.fov = s.fov;
  camera.aspect = aspect;
  camera.near = NEAR;
  camera.far = FAR;
  camera.up.set(0, 1, 0);
  camera.position.set(s.x, -s.y, s.z);
  const same = Math.hypot(s.lookAtX - s.x, s.lookAtY - s.y, s.lookAtZ - s.z) < 1e-9;       // the composition then looks along -z
  camera.lookAt(same ? s.x : s.lookAtX, same ? -s.y : -s.lookAtY, same ? s.z - 1 : s.lookAtZ);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

interface Entry { kind: LightState['kind']; light: Light; target: Object3D | null }

/**
 * The composition's lights as three lights, one per light layer alive, in layer order. The objects are made once and moved every frame (a light that has ended is switched off,
 * not removed: the shader of a three layer must not be rebuilt as lights come and go).
 *
 * Intensity: three divides a diffuse surface by pi, so a light of intensity 1 is multiplied by pi to be "as bright as the colour" like a card's shading. Falloff: 'none' is no
 * attenuation; 'inverseSquare' is decay 2 with the intensity scaled so it is full at `radius` (it keeps rising inside it, where the composition's stays at 1); 'smooth' is three's
 * cut-off fitted to the composition's curve (see below). Shadows follow the light (castsShadows: the layer's own meshes cast and receive).
 */
export class LightMirror {
  private entries: Entry[] = [];
  /** True when a light alive casts shadows: the layer's renderer must have its shadow map on. */
  castsShadows = false;
  constructor(private readonly scene: Object3D, private readonly extent = 2000) {}

  update(lights: readonly LightState[]): void {
    this.castsShadows = lights.some((s) => s.castsShadows && s.kind !== 'ambient');
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

  private make(kind: LightState['kind']): Entry {
    const light: Light = kind === 'ambient' ? new AmbientLight() : kind === 'parallel' ? new DirectionalLight() : kind === 'spot' ? new SpotLight() : new PointLight();
    light.name = 'pixi-effects:composition-light';
    const target = (light as DirectionalLight | SpotLight).target ?? null;
    this.scene.add(light);
    if (target) this.scene.add(target);
    return { kind, light, target };
  }

  private remove(e: Entry): void {
    this.scene.remove(e.light);
    if (e.target) this.scene.remove(e.target);
  }

  private configure(e: Entry, s: LightState): void {
    const { light } = e;
    light.visible = true;
    light.color = (light.color ?? new Color()).setRGB(s.r, s.g, s.b, SRGBColorSpace);
    let intensity = s.intensity * Math.PI;
    if (s.kind !== 'ambient') {
      light.position.set(s.x, -s.y, s.z);
      e.target?.position.set(s.lookAtX, -s.lookAtY, s.lookAtZ);
    }
    if (s.kind === 'point' || s.kind === 'spot') {
      const l = light as PointLight | SpotLight;
      if (s.falloff === 'inverseSquare') { l.distance = 0; l.decay = 2; intensity *= s.radius * s.radius; }
      else if (s.falloff === 'smooth') {
        // The composition: 1 inside `radius`, a smoothstep down to 0 at radius + falloffDistance. three's cut-off distance D with decay 0 attenuates by saturate(1 - (d/D)^4)^2, a gentler curve that
        // starts to fall at once. A cut-off and a gain chosen from where the fall starts (p = radius / (radius + falloffDistance)) halve the largest difference over the range (0.15-0.40 with
        // D = radius + falloffDistance and no gain, 0.09-0.17 here for a fall that is not steep); a fall that is steep against its radius cannot be matched by three's curve.
        const reach = s.radius + Math.max(s.falloffDistance, 1e-3), p = s.radius / reach;
        l.distance = reach * (0.8 + 0.45 * p); l.decay = 0; intensity *= 0.87 + 0.45 * p;
      }
      else { l.distance = 0; l.decay = 0; }
    }
    if (s.kind === 'spot') {
      const l = light as SpotLight;
      l.angle = ((s.coneAngle / 2) * Math.PI) / 180;
      l.penumbra = s.coneFeather;
    }
    light.intensity = intensity;
    if (s.kind !== 'ambient') {
      const l = light as PointLight | SpotLight | DirectionalLight;
      l.castShadow = s.castsShadows;
      if (s.castsShadows) {
        l.shadow.mapSize.set(2048, 2048);
        l.shadow.intensity = s.shadowDarkness;
        l.shadow.radius = Math.max(1, s.shadowDiffusion / 4);
        // Scale-aware: three compares depths AFTER the perspective divide, so a bias of b is about b·d²/near world units at distance d from the light. A near plane of 1 px and a bias of
        // -0.0005 hid every caster within ~250 px of its receiver at 1280 x 720 (found by an AI trial). The near plane follows the size of the composition (~20 px at 1280 x 720) and the
        // bias is small, so the gap is about a pixel or two; normalBias (world units, along the surface normal) is a pixel or two too.
        l.shadow.bias = -0.00005;
        l.shadow.normalBias = this.extent / 1000;
        const cam = l.shadow.camera;
        cam.near = Math.max(1, this.extent / 128); cam.far = 20000;
        if (s.kind === 'parallel') { const o = cam as OrthographicCamera; o.left = -this.extent; o.right = this.extent; o.top = this.extent; o.bottom = -this.extent; }
        cam.updateProjectionMatrix();
      }
    }
    light.updateMatrixWorld?.();
    e.target?.updateMatrixWorld?.();
  }
}

/**
 * The composition camera's fog as the scene's `Fog`: the same colour, `near` and `far` (distances along the view, in composition pixels). three's Fog fades with `smoothstep` where the
 * composition's fades linearly, and has no amount below 1: close, not equal (see docs/dsl.md). The Fog is made when the camera has one and removed when it has not; a Fog the layer made
 * itself is never touched.
 */
export class FogMirror {
  private own: Fog | null = null;
  constructor(private readonly scene: Scene) {}

  update(fog: FogState | null): void {
    if (!fog) {
      if (this.own && this.scene.fog === this.own) this.scene.fog = null;
      this.own = null;
      return;
    }
    if (!this.own || this.scene.fog !== this.own) {
      if (this.scene.fog && this.scene.fog !== this.own) return;                // the layer has its own fog: leave it
      this.own = new Fog(0x000000, fog.near, fog.far);
      this.scene.fog = this.own;
    }
    this.own.color.setRGB(fog.r, fog.g, fog.b, SRGBColorSpace);
    this.own.near = fog.near;
    this.own.far = fog.far;
  }

  dispose(): void { this.update(null); }
}
