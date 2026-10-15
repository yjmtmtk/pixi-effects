import { AmbientLight, AnimationMixer, Box3, DirectionalLight, LoopOnce, LoopRepeat, PerspectiveCamera, Sphere, Vector3, type AnimationClip, type Object3D } from 'three';
import { ThreeSequence } from './ThreeSequence';
import type { ThreeContext, ThreeSetupResult } from './types';
import type { ModelSequenceSpec } from '../types';

/**
 * The three.js drawing of the spec language's `model` layer (a glTF model as data): a three layer whose scene is built from the spec. The clip is posed with `AnimationMixer.setTime`, which re-evaluates from zero each call
 * (a seek forward, backward or by jumps gives the same pose); the mixer is never attached to a ticker.
 */
export class ThreeModelSequence extends ThreeSequence {
  private _mixer: AnimationMixer | null = null;
  private _clipDuration = 0;

  private get _model(): ModelSequenceSpec { return this.spec as unknown as ModelSequenceSpec; }

  protected override engineOptions(): { renderer?: 'webgl' | 'webgpu'; antialias?: boolean } { return this._model.three ?? {}; }

  protected override async userSetup(ctx: ThreeContext): Promise<ThreeSetupResult> {
    const spec = this._model;
    const label = `pixi-effects: model layer${spec.name ? ` "${spec.name}"` : ''}`;
    if (spec.light !== undefined && spec.light !== 'studio' && spec.light !== 'none') throw new Error(`${label}: light must be 'studio' or 'none' (got ${JSON.stringify(spec.light)})`);
    if (spec.fit !== undefined && spec.fit !== 'contain' && spec.fit !== false) throw new Error(`${label}: fit must be 'contain' or false (got ${JSON.stringify(spec.fit)})`);
    if (typeof spec.asset !== 'string' || !spec.asset) throw new Error(`${label}: asset must be the URL of a .glb or .gltf file`);

    // The loader is an addon: a page without a model layer never loads it.
    let GLTFLoader: typeof import('three/addons/loaders/GLTFLoader.js').GLTFLoader;
    try { ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')); } catch (err) {
      throw new Error(`${label}: needs "three/addons/" in the import map next to "three" (${err instanceof Error ? err.message : err})`);
    }
    let gltf: Awaited<ReturnType<InstanceType<typeof GLTFLoader>['loadAsync']>>;
    try { gltf = await new GLTFLoader().loadAsync(spec.asset); } catch (err) {
      throw new Error(`${label}: could not load "${spec.asset}" (${err instanceof Error ? err.message : err})`, { cause: err });
    }
    const root: Object3D = gltf.scene;
    ctx.scene.add(root);

    // the clip to play
    const clips: AnimationClip[] = gltf.animations ?? [];
    let clip: AnimationClip | undefined;
    if (spec.animation === false || clips.length === 0 && spec.animation === undefined) clip = undefined;
    else if (spec.animation === undefined) clip = clips[0];
    else {
      clip = typeof spec.animation === 'number' ? clips[spec.animation] : clips.find((c) => c.name === spec.animation);
      if (!clip) throw new Error(`${label}: "${spec.asset}" has no animation ${JSON.stringify(spec.animation)}; its clips: ${clips.length ? clips.map((c, i) => `${i}: "${c.name}"`).join(', ') : '(none)'}`);
    }
    if (clip) {
      this._mixer = new AnimationMixer(root);
      const action = this._mixer.clipAction(clip);
      action.setLoop(spec.loop === false ? LoopOnce : LoopRepeat, Infinity);
      action.clampWhenFinished = true;
      action.play();
      this._clipDuration = clip.duration;
    }

    // the camera: framed on the model (its bounding sphere in the vertical field of view, with a 10 % margin) unless the spec says otherwise
    const bounds = new Box3().setFromObject(root);
    const centre = bounds.getCenter(new Vector3());
    const radius = Math.max(bounds.getBoundingSphere(new Sphere()).radius, 1e-6);
    const fov = spec.camera?.fov ?? 40;
    const camera = new PerspectiveCamera(fov, ctx.width / ctx.height, 0.1, 2000);
    if (spec.fit === false) camera.position.set(0, 0, 5);
    else {
      const distance = (radius / Math.sin((fov * Math.PI) / 360)) * 1.1;
      camera.position.copy(centre).addScaledVector(new Vector3(0, 0.25, 1).normalize(), distance);
      camera.near = Math.max(distance / 100, 1e-4);
      camera.far = distance * 100;
    }
    if (spec.camera?.position) camera.position.set(...spec.camera.position);
    const look = spec.camera?.lookAt ?? (spec.fit === false ? [0, 0, 0] : centre.toArray());
    camera.lookAt(look[0]!, look[1]!, look[2]!);
    camera.updateProjectionMatrix();

    const objects: Record<string, object> = { model: root };
    if (spec.light !== 'none') {
      const key = new DirectionalLight(0xffffff, 2);
      key.position.copy(centre).add(new Vector3(-0.6, 1, 0.9).multiplyScalar(radius * 3));
      key.target.position.copy(centre);
      const fill = new DirectionalLight(0xbcd0ff, 0.5);
      fill.position.copy(centre).add(new Vector3(1, 0.2, 0.7).multiplyScalar(radius * 3));
      fill.target.position.copy(centre);
      const ambient = new AmbientLight(0xffffff, 0.35);
      ctx.scene.add(key, key.target, fill, fill.target, ambient);
      Object.assign(objects, { key, fill, ambient });
    }
    return { camera, objects };
  }

  protected override userUpdate(t: number, _ctx: ThreeContext): void {
    if (!this._mixer) return;
    const spec = this._model;
    this._mixer.setTime(t * (spec.animationSpeed ?? 1) + (spec.animationOffset ?? 0));
  }

  protected override userDispose(_ctx: ThreeContext): void {
    this._mixer?.stopAllAction();
    this._mixer = null;
  }
}
