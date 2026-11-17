// Writes the compressed glTF fixtures of tests/films/scene3d-compressed:
//   tests/fixtures/ktx2-box.gltf    a box whose only texture is KTX2 (KHR_texture_basisu, no PNG fallback): tests/fixtures/lenses-normal.ktx2
//   tests/fixtures/meshopt-box.gltf the box with its vertices and indices compressed with meshoptimizer (EXT_meshopt_compression, required)
// (tests/fixtures/draco/ is Khronos' Box, glTF-Draco, as published.) Run: node scripts/make-compressed-fixtures.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MeshoptEncoder } from '../node_modules/@pixi/3d/node_modules/meshoptimizer/meshopt_encoder.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures');
const H = 0.5;
const faces = [
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
];
const pos = [], nor = [], uv = [], idx = [];
faces.forEach(([n, u, v], f) => {
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    for (let k = 0; k < 3; k++) { pos.push(H * (n[k] + a * u[k] + b * v[k])); nor.push(n[k]); }
    uv.push((a + 1) / 2, (1 - b) / 2);
  }
  idx.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
});
const f32 = (a) => Buffer.from(new Float32Array(a).buffer);
const u16 = (a) => Buffer.from(new Uint16Array(a).buffer);
const dataUri = (b) => `data:application/octet-stream;base64,${b.toString('base64')}`;
const asset = { version: '2.0', generator: 'pixi-effects scripts/make-compressed-fixtures.mjs' };
const accessors = (n) => [
  { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [-H, -H, -H], max: [H, H, H] },
  { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
  { bufferView: n, componentType: 5123, count: idx.length, type: 'SCALAR' },
];

// KTX2 box
{
  const parts = [f32(pos), f32(nor), f32(uv), u16(idx)];
  const offsets = []; let at = 0; for (const p of parts) { offsets.push(at); at += p.length; }
  const buffer = Buffer.concat(parts);
  const gltf = {
    asset, extensionsUsed: ['KHR_texture_basisu'], extensionsRequired: ['KHR_texture_basisu'],
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'box', mesh: 0 }],
    meshes: [{ name: 'box', primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 3 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'ktx2', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 0.8 } }],
    textures: [{ extensions: { KHR_texture_basisu: { source: 0 } } }],
    images: [{ uri: 'lenses-normal.ktx2', mimeType: 'image/ktx2' }],
    buffers: [{ byteLength: buffer.length, uri: dataUri(buffer) }],
    bufferViews: parts.map((p, i) => ({ buffer: 0, byteOffset: offsets[i], byteLength: p.length, ...(i < 3 ? { target: 34962 } : { target: 34963 }) })),
    accessors: [...accessors(3).slice(0, 2), { bufferView: 3, componentType: 5123, count: idx.length, type: 'SCALAR' }, { bufferView: 2, componentType: 5126, count: uv.length / 2, type: 'VEC2' }],
  };
  gltf.meshes[0].primitives[0].indices = 2;
  writeFileSync(join(dir, 'ktx2-box.gltf'), JSON.stringify(gltf) + '\n');
  console.log('ktx2-box.gltf');
}

// Meshopt box: buffer 0 is the fallback (no data), buffer 1 the compressed streams
{
  await MeshoptEncoder.ready;
  const raw = [f32(pos), f32(nor), u16(idx)];
  const enc = [
    Buffer.from(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(raw[0]), pos.length / 3, 12)),
    Buffer.from(MeshoptEncoder.encodeVertexBuffer(new Uint8Array(raw[1]), nor.length / 3, 12)),
    Buffer.from(MeshoptEncoder.encodeIndexBuffer(new Uint8Array(raw[2]), idx.length, 2)),
  ];
  const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const encP = enc.map(pad4);
  const eOff = []; let eAt = 0; for (const p of encP) { eOff.push(eAt); eAt += p.length; }
  const rawP = raw.map(pad4);
  const rOff = []; let rAt = 0; for (const p of rawP) { rOff.push(rAt); rAt += p.length; }
  const modes = ['ATTRIBUTES', 'ATTRIBUTES', 'TRIANGLES'], strides = [12, 12, 2], counts = [pos.length / 3, nor.length / 3, idx.length];
  const gltf = {
    asset, extensionsUsed: ['EXT_meshopt_compression'], extensionsRequired: ['EXT_meshopt_compression'],
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'box', mesh: 0 }],
    meshes: [{ name: 'box', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    materials: [{ name: 'teal', pbrMetallicRoughness: { baseColorFactor: [0.1, 0.7, 0.7, 1], metallicFactor: 0, roughnessFactor: 0.6 } }],
    buffers: [{ byteLength: rAt, extensions: { EXT_meshopt_compression: { fallback: true } } }, { byteLength: eAt, uri: dataUri(Buffer.concat(encP)) }],
    bufferViews: raw.map((p, i) => ({
      buffer: 0, byteOffset: rOff[i], byteLength: p.length, ...(i < 2 ? { byteStride: 12, target: 34962 } : { target: 34963 }),
      extensions: { EXT_meshopt_compression: { buffer: 1, byteOffset: eOff[i], byteLength: enc[i].length, byteStride: strides[i], count: counts[i], mode: modes[i] } },
    })),
    accessors: accessors(2),
  };
  writeFileSync(join(dir, 'meshopt-box.gltf'), JSON.stringify(gltf) + '\n');
  console.log('meshopt-box.gltf');
}
