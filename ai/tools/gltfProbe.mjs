/**
 * `pixi-effects probe model.glb` — what is in a glTF model, read in Node with no browser and no three.js: the clips (name and length), the size of the model in the file's own units
 * (the bounding box of the meshes through the transforms of the nodes: the pose the file is stored in, which is what `threeGltf(...).size` measures), what it holds, and the notes an
 * author trips on (a file that needs a decoder, a model with no clip).
 */
import fs from 'node:fs';
import path from 'node:path';

const GLB_MAGIC = 0x46546c67, JSON_CHUNK = 0x4e4f534a;
const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
export const isGltfFile = (file) => /\.(glb|gltf)(\?.*)?$/i.test(file);
const isUrl = (f) => /^https?:\/\//i.test(f);

/** The JSON of a .glb (its first chunk) or a .gltf. */
function parseJson(file, buf) {
  const name = isUrl(file) ? file : path.basename(file);
  if (buf.length >= 12 && buf.readUInt32LE(0) === GLB_MAGIC) {
    const version = buf.readUInt32LE(4);
    if (version !== 2) throw new Error(`${name}: glTF version ${version} (only 2.0 is read)`);
    let at = 12;
    while (at + 8 <= buf.length) {
      const len = buf.readUInt32LE(at), type = buf.readUInt32LE(at + 4);
      if (type === JSON_CHUNK) return { json: JSON.parse(buf.subarray(at + 8, at + 8 + len).toString('utf8')), container: 'glb' };
      at += 8 + len + ((4 - (len % 4)) % 4);
    }
    throw new Error(`${name}: a .glb with no JSON chunk`);
  }
  try { return { json: JSON.parse(buf.toString('utf8')), container: 'gltf' }; }
  catch { throw new Error(`${name} is not a glTF model (it is neither a .glb, which starts with "glTF", nor glTF JSON)`); }
}

// 4x4 matrices, column-major as glTF stores them.
const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const multiply = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
function local(node) {
  if (node.matrix?.length === 16) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0], [x, y, z, w] = node.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}
const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

/** The report of a glTF JSON. */
export function describeGltf(json, { file, bytes, container }) {
  const nodes = json.nodes ?? [], meshes = json.meshes ?? [], accessors = json.accessors ?? [];
  const notes = [];
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  let measured = 0, unmeasured = 0;
  const seen = new Set();
  const visit = (i, parent) => {
    if (seen.has(i) || !nodes[i]) return;                                 // a node reached twice is a broken file, not a reason to loop
    seen.add(i);
    const world = multiply(parent, local(nodes[i]));
    const mesh = meshes[nodes[i].mesh];
    for (const prim of mesh?.primitives ?? []) {
      const acc = accessors[prim.attributes?.POSITION];
      if (!acc?.min || !acc?.max) { unmeasured++; continue; }
      measured++;
      for (const x of [acc.min[0], acc.max[0]]) for (const y of [acc.min[1], acc.max[1]]) for (const z of [acc.min[2], acc.max[2]]) {
        const p = apply(world, [x, y, z]);
        for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
      }
    }
    for (const c of nodes[i].children ?? []) visit(c, world);
  };
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes ?? nodes.map((_, i) => i).filter((i) => !nodes.some((n) => n.children?.includes(i)));
  for (const r of roots) visit(r, identity());
  const size = measured ? [0, 1, 2].map((k) => hi[k] - lo[k]) : null;
  if (!size) notes.push('the size of the model could not be read (its position accessors have no min / max)');
  else if (unmeasured) notes.push(`${unmeasured} mesh part(s) have no position min / max: the size leaves them out`);

  const animations = (json.animations ?? []).map((a, index) => {
    let duration = 0;
    for (const s of a.samplers ?? []) { const t = accessors[s.input]; if (t?.max?.[0] > duration) duration = t.max[0]; }
    return { index, name: a.name ?? `(unnamed ${index})`, duration: round(duration) };
  });
  if (!animations.length) notes.push('no animation: threeGltf poses nothing; the model stays in the pose it is stored in');
  const required = json.extensionsRequired ?? [];
  const decoders = required.filter((e) => /draco|meshopt|basisu|ktx2|webp/i.test(e));
  if (decoders.length) notes.push(`needs ${decoders.join(', ')}: three's GLTFLoader needs a decoder for it (DRACOLoader / KTX2Loader / MeshoptDecoder), and threeGltf does not set one up: re-export the model without that compression, or load it yourself`);
  const external = [...(json.buffers ?? []), ...(json.images ?? [])].filter((x) => x.uri && !/^data:/i.test(x.uri));
  if (external.length) notes.push(`${external.length} file(s) are loaded next to the model (${external.slice(0, 3).map((x) => x.uri).join(', ')}${external.length > 3 ? ', …' : ''}): keep them beside it`);
  return {
    file, container: `glTF ${json.asset?.version ?? '2.0'} (${container})`, bytes,
    counts: { nodes: nodes.length, meshes: meshes.length, skins: (json.skins ?? []).length, materials: (json.materials ?? []).length, textures: (json.textures ?? []).length },
    size: size ? size.map((v) => round(v, 6)) : null, longest: size ? round(Math.max(...size), 6) : null,
    animations, extensions: json.extensionsUsed ?? [], notes,
  };
}

/** Read a local file or a URL and describe it. */
export async function probeGltf(file) {
  let buf;
  if (isUrl(file)) {
    const res = await fetch(file);
    if (!res.ok) throw new Error(`could not read ${file}: HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
  } else {
    if (!fs.existsSync(file)) throw new Error(`${file}: no such file`);
    buf = fs.readFileSync(file);
  }
  const { json, container } = parseJson(file, buf);
  return describeGltf(json, { file, bytes: isUrl(file) ? null : buf.length, container });
}

const num = (v) => String(round(v, 3));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export function gltfText(r) {
  const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const L = [r.file, `  ${r.container}${r.bytes != null ? ` · ${kb(r.bytes)}` : ''}`];
  const c = r.counts;
  L.push(`  model  ${plural(c.nodes, 'node')} · ${plural(c.meshes, 'mesh').replace('meshs', 'meshes')} · ${plural(c.skins, 'skin')} · ${plural(c.materials, 'material')} · ${plural(c.textures, 'texture')}`);
  if (r.size) L.push(`  size   ${r.size.map(num).join(' × ')}  (x × y × z in the file's units, as stored: the longest side is ${num(r.longest)}; threeGltf's fit(px) scales that side to px)`);
  for (const a of r.animations) L.push(`  clip   ${a.index} "${a.name}" ${num(a.duration)} s`);
  for (const n of r.notes) L.push(`  note   ${n}`);
  return L.join('\n');
}
