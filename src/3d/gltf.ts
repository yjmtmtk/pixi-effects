/**
 * `loadModel(url)` and `fitCamera(ctx, object)`: a glTF / GLB model in a scene3d layer, posed from the time; the camera where the whole model fits.
 */
import { Assets } from 'pixi.js';
import { Container3D, Matrix4, Mesh3D, Model3D, Vector3, glbToGltf } from '@pixi/3d';
import { suggestName } from '../core/options';
import type { Scene3DContext } from './types';

export interface LoadModelOptions {
  /** A clip name, a clip index, or `false` (no animation: the model's bind pose). Default: the first clip, if the file has one. */
  animation?: string | number | false;
  /** The clip time is `t x speed + offset` (the layer's seconds). Defaults 1 and 0. */
  speed?: number;
  offset?: number;
  /** `true` (default): the clip repeats; `false`: it holds its last pose. */
  loop?: boolean;
  /** A colourway of the file (glTF `KHR_materials_variants`) to start in, by name; see `variants`. Default: the file's own colours. */
  variant?: string;
}

export interface LoadedModel {
  /** Add this to `ctx.root`. A group whose origin is the centre of the model's bounding box (bind pose): position, turn and `fit` it about its centre. */
  object: Container3D;
  /** The PixiJS 3D model inside `object` (its `player`, `materials`, `skeletons`). */
  model: Model3D;
  /** The names of the animations the file has (PixiJS 3D's `animationLabels`). */
  animations: string[];
  /** The size of the model's bounding box now (with `fit`), in the scene's units. */
  size(): { x: number; y: number; z: number };
  /** Scale `object` so the model's longest side is `n` (a model in metres in a scene in composition pixels: `fit(400)` under `followCamera`). */
  fit(n: number): void;
  /** Pose the model at the layer's time `t` (seconds): the clip at `t x speed + offset`, looped or held. A seek, an export and a repeat give the same pose. */
  pose(t: number): void;
  /** The names of the file's colourways (glTF `KHR_materials_variants`, e.g. a shoe's "midnight" and "street"); `[]` when it has none. */
  variants: string[];
  /** The colourway shown now, or `null` for the file's own colours. */
  readonly variant: string | null;
  /**
   * Show a colourway, by name (`null`: the file's own colours). It only swaps materials, so it is cheap and can be called every frame: from
   * `update(t)` it is a function of the time (`setVariant(t < 2 ? 'midnight' : 'street')`), from a click it changes the picture at once
   * (then `movie.redraw()`). A part the colourway does not name keeps its own material.
   */
  setVariant(name: string | null): void;
}

interface GltfJsonLike {
  extensions?: { KHR_materials_variants?: { variants?: Array<{ name?: string }> } };
  meshes?: Array<{ primitives?: Array<{ material?: number; extensions?: { KHR_materials_variants?: { mappings?: Array<{ material: number; variants: number[] }> } } }> }>;
}

/** The file's own glTF JSON (a .glb's JSON chunk, or the .gltf text): what PixiJS 3D does not keep, the colourways. Read from the cache of the load just made. */
async function gltfJson(url: string): Promise<GltfJsonLike | null> {
  try {
    const buf = await (await fetch(url)).arrayBuffer();
    const b = new Uint8Array(buf);
    if (b[0] === 0x67 && b[1] === 0x6c && b[2] === 0x54 && b[3] === 0x46) return glbToGltf(buf).json as unknown as GltfJsonLike;   // 'glTF'
    return JSON.parse(new TextDecoder().decode(b)) as GltfJsonLike;
  } catch { return null; }
}

/** What `setVariant` swaps: for every mesh of the model whose glTF primitive has colourways, its own material and the one for each colourway. */
function colourways(json: GltfJsonLike | null, model: Model3D, source: { geometries?: unknown[][] }): { names: string[]; parts: Array<{ mesh: Mesh3D; own: Mesh3D['material']; by: Map<number, Mesh3D['material']> }> } {
  const names = (json?.extensions?.KHR_materials_variants?.variants ?? []).map((v, i) => v.name ?? `variant ${i}`);
  const parts: Array<{ mesh: Mesh3D; own: Mesh3D['material']; by: Map<number, Mesh3D['material']> }> = [];
  if (!names.length || !json?.meshes) return { names, parts };
  const where = new Map<unknown, { m: number; p: number }>();                           // each primitive's Geometry3D -> its glTF mesh and primitive
  (source.geometries ?? []).forEach((prims, m) => prims.forEach((g, p) => where.set(g, { m, p })));
  const materials = model.materials;
  const walk = (node: { children?: unknown[] }): void => {
    if (node instanceof Mesh3D) {
      const at = where.get(node.geometry);
      const mappings = at ? json.meshes?.[at.m]?.primitives?.[at.p]?.extensions?.KHR_materials_variants?.mappings : undefined;
      if (mappings?.length) {
        const by = new Map<number, Mesh3D['material']>();
        for (const mp of mappings) { const mat = materials[mp.material]; if (mat) for (const v of mp.variants) by.set(v, mat as Mesh3D['material']); }
        parts.push({ mesh: node, own: node.material, by });
      }
    }
    for (const c of node.children ?? []) walk(c as { children?: unknown[] });
  };
  walk(model as unknown as { children?: unknown[] });
  return { names, parts };
}

const label = 'pixi-effects: loadModel';

/** Load a glTF / GLB (a URL relative to the page) as a PixiJS 3D model, ready to pose from the time. Call it in a scene3d layer's `setup` (await it). */
export async function loadModel(url: string, options: LoadModelOptions = {}): Promise<LoadedModel> {
  if (typeof url !== 'string' || !url) throw new Error(`${label}: the first argument is the model's URL: await loadModel('model.glb')`);
  const source = await Assets.load(url);
  const model = new Model3D({ source, autoUpdate: false, autoPlay: false } as ConstructorParameters<typeof Model3D>[0]);
  // a file with no animation has no player
  const player = model.player as unknown as { animationLabels: readonly string[]; getState(label: string): { animation: { duration: number }; gotoAndStop(t: number): unknown } } | undefined;
  const clips = player ? [...player.animationLabels] : [];
  const speed = options.speed ?? 1, offset = options.offset ?? 0, loop = options.loop !== false;
  let clip: string | null = null;
  if (options.animation === undefined) clip = clips[0] ?? null;
  else if (options.animation === false) clip = null;
  else if (typeof options.animation === 'number') {
    clip = clips[options.animation] ?? null;
    if (clip === null) throw new Error(`${label}: the model has no clip number ${options.animation} (it has ${clips.length}${clips.length ? `: ${clips.map((c) => `"${c}"`).join(', ')}` : ''})`);
  } else {
    if (!clips.includes(options.animation)) throw new Error(`${label}: the model has no clip "${options.animation}" (its clips: ${clips.length ? clips.map((c) => `"${c}"`).join(', ') : 'none'})`);
    clip = options.animation;
  }

  // the group's origin is the centre of the model's box (bind pose): the model sits at minus that centre inside it
  const object = new Container3D({ label: url.split('/').pop() ?? 'model' } as ConstructorParameters<typeof Container3D>[0]);
  object.addChild(model);
  const box = model.getLocalBounds();
  model.position.set(-(box.min.x + box.max.x) / 2, -(box.min.y + box.max.y) / 2, -(box.min.z + box.max.z) / 2);
  const base = { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };

  const ways = colourways(await gltfJson(url), model, source as { geometries?: unknown[][] });
  let current: string | null = null;
  const unknownVariant = (where: string, name: string): string => {
    if (!ways.names.length) return `pixi-effects: ${where}: the model has no colourways (its file has no KHR_materials_variants)`;
    const near = suggestName(name, ways.names);
    return `pixi-effects: ${where}: the model has no colourway "${name}" (its colourways: ${ways.names.map((n) => `"${n}"`).join(', ')})${near ? `; did you mean "${near}"?` : ''}`;
  };
  const setVariant = (name: string | null): void => {
    if (name === current) return;
    if (name === null) { for (const part of ways.parts) part.mesh.material = part.own; current = null; return; }
    const i = ways.names.indexOf(name);
    if (i < 0) throw new Error(unknownVariant('setVariant', String(name)));
    for (const part of ways.parts) part.mesh.material = part.by.get(i) ?? part.own;
    current = name;
  };
  if (options.variant !== undefined) {
    if (!ways.names.includes(options.variant)) throw new Error(unknownVariant('loadModel', String(options.variant)));
    setVariant(options.variant);
  }

  const state = clip !== null && player ? player.getState(clip) : null;
  const pose = (t: number): void => {
    if (!state) return;
    const length = state.animation.duration;
    const x = t * speed + offset;
    state.gotoAndStop(length > 0 ? (loop ? ((x % length) + length) % length : Math.min(Math.max(x, 0), length)) : 0);
  };
  pose(0);
  return {
    object, model, animations: clips,
    size: () => ({ x: base.x * object.scale.x, y: base.y * object.scale.y, z: base.z * object.scale.z }),
    fit: (n: number) => {
      const longest = Math.max(base.x, base.y, base.z);
      if (!(n > 0) || !(longest > 0)) throw new Error(`${label}: fit(n) needs a size above 0 (got ${n}) and a model with a size (its box is ${base.x} x ${base.y} x ${base.z})`);
      const k = n / longest;
      object.scale.set(k, k, k);
    },
    pose,
    variants: ways.names,
    get variant() { return current; },
    setVariant,
  };
}

export interface FitCameraOptions {
  /** The direction the camera sits in from the centre of the object, any length. Default `[0.45, 0.3, 1]`: a three-quarter view, a little from the side and above. */
  direction?: [number, number, number];
  /** Free room around the object: 1.1 (the default) leaves 10 %. */
  margin?: number;
}

/**
 * Put the layer's camera where the whole of `object` (its bounding box now, with its scale and place) fits the picture, looking at its centre: the smallest distance at which
 * the 8 corners of the box fit both the vertical and the horizontal field of view. Uses the camera's `fov` and the layer's shape; `near` and `far` follow the distance.
 * The box is the pose of now: for a clip that travels far, place the camera yourself.
 */
export function fitCamera(ctx: Scene3DContext, object: Container3D, options: FitCameraOptions = {}): void {
  const camera = ctx.camera;
  const box = object.getLocalBounds().applyMatrix4(object.getGlobalTransform(new Matrix4()));
  const centre = new Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
  const margin = options.margin ?? 1.1;
  const [dx, dy, dz] = options.direction ?? [0.45, 0.3, 1];
  const toCamera = new Vector3(dx, dy, dz).normalize();
  const right = new Vector3(0, 1, 0).cross(toCamera);
  if (right.x * right.x + right.y * right.y + right.z * right.z < 1e-12) right.set(1, 0, 0);
  right.normalize();
  const up = toCamera.clone().cross(right);
  const tanV = Math.tan((camera.fov * Math.PI) / 360), tanH = tanV * (ctx.width / ctx.height);
  let distance = 1e-3;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const r = new Vector3(x - centre.x, y - centre.y, z - centre.z);
    const along = r.dot(toCamera);
    distance = Math.max(distance, along + (Math.abs(r.dot(right)) * margin) / tanH, along + (Math.abs(r.dot(up)) * margin) / tanV);
  }
  camera.mode = 'perspective';
  camera.position.set(centre.x + toCamera.x * distance, centre.y + toCamera.y * distance, centre.z + toCamera.z * distance);
  camera.near = Math.max(distance / 100, 1e-4);
  camera.far = distance * 100;
  camera.lookAt(centre);
}
