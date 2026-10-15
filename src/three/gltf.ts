/**
 * Two helpers for a glTF model in a `three` layer's `setup` / `update` (the layer stays the free box; these are what is easy to get wrong by hand):
 *
 *   const fox = await threeGltf('Fox.glb', { animation: 'Run' });      // in setup
 *   ctx.scene.add(fox.object);  threeFrameCamera(ctx.camera, fox.object);
 *   ...  update: (t) => fox.pose(t)                                    // the clip at the layer's time: a function of t, never of a clock
 *
 * The loader is an addon: a page that never calls `threeGltf` never loads it (the import map needs `"three/addons/"` next to `"three"`).
 */
import { AnimationMixer, Box3, Group, LoopOnce, LoopRepeat, Vector3, type AnimationClip, type Camera, type Object3D, type PerspectiveCamera } from 'three';

export interface ThreeGltfOptions {
  /** A clip name, a clip index, or `false` (no animation: the model's bind pose). Default: the first clip, if the file has one. */
  animation?: string | number | false;
  /** The clip time is `t × speed + offset` (the layer's seconds). Defaults 1 and 0. */
  speed?: number;
  offset?: number;
  /** `true` (default): the clip repeats; `false`: it holds its last pose. */
  loop?: boolean;
}

export interface ThreeGltfModel {
  /** Add this to `ctx.scene`. A group whose origin is the centre of the model's bounding box (bind pose): position, turn and `fit` it about its centre. */
  object: Group;
  /** The names of the clips the file has. */
  clips: string[];
  /** The size of the model's bounding box in the file's own units (bind pose, before `fit`). */
  size: Vector3;
  /** Pose the model at the layer's time `t` (seconds). `AnimationMixer.setTime` evaluates the clip from zero every call: a seek, an export and a repeat give the same pose. */
  pose(t: number): void;
  /** Scale `object` so the model's longest side is `px` (a model in metres in a scene in composition pixels). */
  fit(px: number): void;
  /** Stop the clip. Geometries, materials and textures are yours to dispose with the scene. */
  dispose(): void;
}

export async function threeGltf(url: string, options: ThreeGltfOptions = {}): Promise<ThreeGltfModel> {
  const label = 'pixi-effects: threeGltf';
  if (typeof url !== 'string' || !url) throw new Error(`${label}: the first argument is the URL of a .glb or .gltf file`);
  let GLTFLoader: typeof import('three/addons/loaders/GLTFLoader.js').GLTFLoader;
  try { ({ GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')); } catch (err) {
    throw new Error(`${label}: needs "three/addons/" in the import map next to "three" (${err instanceof Error ? err.message : err})`);
  }
  let gltf: Awaited<ReturnType<InstanceType<typeof GLTFLoader>['loadAsync']>>;
  try { gltf = await new GLTFLoader().loadAsync(url); } catch (err) {
    throw new Error(`${label}: could not load "${url}" (${err instanceof Error ? err.message : err})`, { cause: err });
  }

  const clips: AnimationClip[] = gltf.animations ?? [];
  let clip: AnimationClip | undefined;
  const wanted = options.animation;
  if (wanted === false || (wanted === undefined && clips.length === 0)) clip = undefined;
  else if (wanted === undefined) clip = clips[0];
  else {
    clip = typeof wanted === 'number' ? clips[wanted] : clips.find((c) => c.name === wanted);
    if (!clip) throw new Error(`${label}: "${url}" has no animation ${JSON.stringify(wanted)}; its clips: ${clips.length ? clips.map((c, i) => `${i}: "${c.name}"`).join(', ') : '(none)'}`);
  }

  // The origin of the group is the centre of the box, so the model is placed and turned about its centre.
  const root: Object3D = gltf.scene;
  // A skinned mesh is always drawn. three culls a mesh by a bounding sphere, and a skinned mesh's sphere does not follow its animation or its place: a model that MOVES and throws a shadow
  // drew its shadow differently depending on the frames drawn before it (found on the Khronos Fox: `check` reported the layer as not a function of the time; with culling off the
  // pictures are the same in any order). The cost is that an off-screen model is still drawn.
  root.traverse((o) => { if ((o as { isSkinnedMesh?: boolean }).isSkinnedMesh) o.frustumCulled = false; });
  const object = new Group();
  object.add(root);
  const bounds = new Box3().setFromObject(root);
  const centre = bounds.getCenter(new Vector3());
  const size = bounds.getSize(new Vector3());
  root.position.sub(centre);

  let mixer: AnimationMixer | null = null;
  if (clip) {
    mixer = new AnimationMixer(root);
    const action = mixer.clipAction(clip);
    action.setLoop(options.loop === false ? LoopOnce : LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    action.play();
  }
  const speed = options.speed ?? 1, offset = options.offset ?? 0;

  return {
    object,
    clips: clips.map((c) => c.name),
    size,
    pose: (t) => { mixer?.setTime(t * speed + offset); },
    fit: (px) => { object.scale.setScalar(px / Math.max(size.x, size.y, size.z, 1e-9)); },
    dispose: () => { mixer?.stopAllAction(); mixer?.uncacheRoot(root); mixer = null; },
  };
}

export interface ThreeFrameCameraOptions {
  /** The direction the camera sits in from the centre of the model, any length. Default `[0.45, 0.3, 1]`: a three-quarter view, a little from the side and above. */
  direction?: [number, number, number];
  /** Free room around the model: 1.1 (the default) leaves 10 %. */
  margin?: number;
}

/**
 * Put `camera` where the whole of `object` (its bounding box now, with its scale and place) fits the frame, looking at its centre: the smallest distance at which the 8 corners of
 * the box all fit both the vertical and the horizontal field of view (a bounding sphere would leave a long model small and head-on). `near` and `far` follow the distance.
 * Uses the camera's own `fov` and `aspect`. For a clip that travels far, give your own camera: the box is the bind pose.
 */
export function threeFrameCamera(camera: PerspectiveCamera | Camera, object: Object3D, options: ThreeFrameCameraOptions = {}): void {
  const cam = camera as PerspectiveCamera;
  object.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(object);
  const centre = bounds.getCenter(new Vector3());
  const margin = options.margin ?? 1.1;
  const [dx, dy, dz] = options.direction ?? [0.45, 0.3, 1];
  const toCamera = new Vector3(dx, dy, dz).normalize();
  const right = new Vector3().crossVectors(new Vector3(0, 1, 0), toCamera);
  if (right.lengthSq() < 1e-12) right.set(1, 0, 0);                         // straight above or below: any right will do
  right.normalize();
  const up = new Vector3().crossVectors(toCamera, right);
  const tanV = Math.tan((cam.fov * Math.PI) / 360), tanH = tanV * cam.aspect;
  let distance = 1e-3;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const r = new Vector3(x, y, z).sub(centre);
    distance = Math.max(distance, r.dot(toCamera) + (Math.abs(r.dot(right)) * margin) / tanH, r.dot(toCamera) + (Math.abs(r.dot(up)) * margin) / tanV);
  }
  cam.position.copy(centre).addScaledVector(toCamera, distance);
  cam.near = Math.max(distance / 100, 1e-4);
  cam.far = distance * 100;
  cam.lookAt(centre);
  cam.updateProjectionMatrix();
}
