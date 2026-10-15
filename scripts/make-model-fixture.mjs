// Writes tests/fixtures/spin-box.gltf: an orange box that turns 360° about y in 2 s (one animation clip "Spin"), with its buffer inline as a data URI,
// so the tests of the `model` layer need no file download. Run it to regenerate: node scripts/make-model-fixture.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/spin-box.gltf');
const H = 0.5;                                       // half edge: the box is 1 unit wide
const faces = [                                      // [normal, u axis, v axis]: four corners each
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
];
const pos = [], nor = [], idx = [];
faces.forEach(([n, u, v], f) => {
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) for (let k = 0; k < 3; k++) { pos.push(H * (n[k] + a * u[k] + b * v[k])); nor.push(n[k]); }
  idx.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
});
const times = [0, 0.5, 1, 1.5, 2];
const quats = [0, 0.25, 0.5, 0.75, 1].flatMap((p) => { const th = p * 2 * Math.PI; return [0, Math.sin(th / 2), 0, Math.cos(th / 2)]; });

const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
const u16 = (a) => Buffer.from(new Uint16Array(a).buffer);
const parts = [f32(pos), f32(nor), u16(idx), Buffer.alloc((4 - ((idx.length * 2) % 4)) % 4), f32(times), f32(quats)];
const offsets = []; let at = 0; for (const p of parts) { offsets.push(at); at += p.length; }
const buffer = Buffer.concat(parts);
const gltf = {
  asset: { version: '2.0', generator: 'pixi-effects scripts/make-model-fixture.mjs' },
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [{ name: 'box', mesh: 0 }],
  meshes: [{ name: 'box', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{ name: 'orange', pbrMetallicRoughness: { baseColorFactor: [1, 0.5, 0.15, 1], metallicFactor: 0, roughnessFactor: 0.6 } }],
  animations: [{ name: 'Spin', samplers: [{ input: 3, output: 4, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] }],
  buffers: [{ byteLength: buffer.length, uri: `data:application/octet-stream;base64,${buffer.toString('base64')}` }],
  bufferViews: [
    { buffer: 0, byteOffset: offsets[0], byteLength: parts[0].length, target: 34962 },
    { buffer: 0, byteOffset: offsets[1], byteLength: parts[1].length, target: 34962 },
    { buffer: 0, byteOffset: offsets[2], byteLength: parts[2].length, target: 34963 },
    { buffer: 0, byteOffset: offsets[4], byteLength: parts[4].length },
    { buffer: 0, byteOffset: offsets[5], byteLength: parts[5].length },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [-H, -H, -H], max: [H, H, H] },
    { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
    { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    { bufferView: 3, componentType: 5126, count: times.length, type: 'SCALAR', min: [0], max: [2] },
    { bufferView: 4, componentType: 5126, count: times.length, type: 'VEC4' },
  ],
};
writeFileSync(out, JSON.stringify(gltf) + '\n');
console.log(`${out}: ${JSON.stringify(gltf).length} bytes`);

// tests/fixtures/long-box.gltf: the same box stretched to a plank (0.5 x 0.5 x 3), no animation: a long model like an animal seen from its front
const plank = { ...gltf, nodes: [{ name: 'plank', mesh: 0, scale: [0.5, 0.5, 3] }], animations: undefined };
const longOut = out.replace('spin-box.gltf', 'long-box.gltf');
writeFileSync(longOut, JSON.stringify(plank) + '\n');
console.log(`${longOut}: ${JSON.stringify(plank).length} bytes`);

// tests/fixtures/skinned-box.gltf: the box skinned to two joints (the upper half follows the tip joint, the lower half the root joint) with one clip "Wave" (the tip joint bends 30° about z and back
// in 1 s). Its mesh is a SkinnedMesh in three: the kind of model whose bounding sphere is made from the pose it was first measured in (see threeGltf).
{
  const n = pos.length / 3;
  const joints = new Uint8Array(n * 4), weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { joints[i * 4] = pos[i * 3 + 1] > 0 ? 1 : 0; weights[i * 4] = 1; }
  const ibm = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const wt = [0, 0.5, 1], wq = [[0, 0, 0, 1], [0, 0, Math.sin(Math.PI / 12), Math.cos(Math.PI / 12)], [0, 0, 0, 1]].flat();
  const sp = [f32(pos), f32(nor), u16(idx), Buffer.alloc((4 - ((idx.length * 2) % 4)) % 4), Buffer.from(joints.buffer), Buffer.from(weights.buffer), Buffer.from(ibm.buffer), f32(wt), f32(wq)];
  const so = []; let sa = 0; for (const p of sp) { so.push(sa); sa += p.length; }
  const sbuf = Buffer.concat(sp);
  const skinned = {
    asset: gltf.asset, scene: 0, scenes: [{ nodes: [0, 1] }],
    nodes: [{ name: 'skin', mesh: 0, skin: 0 }, { name: 'root', children: [2] }, { name: 'tip' }],
    meshes: [{ name: 'box', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 3, WEIGHTS_0: 4 }, indices: 2, material: 0 }] }],
    skins: [{ joints: [1, 2], inverseBindMatrices: 5, skeleton: 1 }],
    materials: gltf.materials,
    animations: [{ name: 'Wave', samplers: [{ input: 6, output: 7, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 2, path: 'rotation' } }] }],
    buffers: [{ byteLength: sbuf.length, uri: `data:application/octet-stream;base64,${sbuf.toString('base64')}` }],
    bufferViews: [
      { buffer: 0, byteOffset: so[0], byteLength: sp[0].length, target: 34962 }, { buffer: 0, byteOffset: so[1], byteLength: sp[1].length, target: 34962 },
      { buffer: 0, byteOffset: so[2], byteLength: sp[2].length, target: 34963 }, { buffer: 0, byteOffset: so[4], byteLength: sp[4].length, target: 34962 },
      { buffer: 0, byteOffset: so[5], byteLength: sp[5].length, target: 34962 }, { buffer: 0, byteOffset: so[6], byteLength: sp[6].length },
      { buffer: 0, byteOffset: so[7], byteLength: sp[7].length }, { buffer: 0, byteOffset: so[8], byteLength: sp[8].length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: n, type: 'VEC3', min: [-H, -H, -H], max: [H, H, H] },
      { bufferView: 1, componentType: 5126, count: n, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
      { bufferView: 3, componentType: 5121, count: n, type: 'VEC4' },
      { bufferView: 4, componentType: 5126, count: n, type: 'VEC4' },
      { bufferView: 5, componentType: 5126, count: 2, type: 'MAT4' },
      { bufferView: 6, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: 7, componentType: 5126, count: 3, type: 'VEC4' },
    ],
  };
  const skinnedOut = out.replace('spin-box.gltf', 'skinned-box.gltf');
  writeFileSync(skinnedOut, JSON.stringify(skinned) + '\n');
  console.log(`${skinnedOut}: ${JSON.stringify(skinned).length} bytes`);
}
