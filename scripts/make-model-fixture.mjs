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
