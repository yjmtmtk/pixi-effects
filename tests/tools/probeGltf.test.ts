// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const root = resolve(__dirname, '../..');
const cli = join(root, 'ai/tools/pixi-effects.mjs');
type Run = { code: number; stdout: string; stderr: string };
const probe = (...args: string[]): Promise<Run> => promisify(execFile)(process.execPath, [cli, 'probe', ...args], { timeout: 60_000 }).then(
  (r) => ({ code: 0, stdout: r.stdout, stderr: r.stderr }), (e: any) => ({ code: e.code ?? 1, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }));
const fixture = (n: string) => join(root, 'tests/fixtures', n);
const tmp = mkdtempSync(join(tmpdir(), 'probe-gltf-'));

/** The same JSON in a binary .glb container (header, one JSON chunk): what a model from the web looks like. */
function toGlb(json: object): Buffer {
  let body = Buffer.from(JSON.stringify(json), 'utf8');
  body = Buffer.concat([body, Buffer.alloc((4 - (body.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + body.length, 8);
  head.writeUInt32LE(body.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, body]);
}

describe('probe on a glTF model: what an author needs before writing the page (no browser, no three)', () => {
  it('a .gltf: the clip names with their lengths, the size of the model in the file\'s units, and what the file holds', async () => {
    const r = await probe(fixture('spin-box.gltf'));
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/glTF 2\.0/);
    expect(r.stdout).toMatch(/clip +0 "Spin" 2 s/);
    expect(r.stdout).toMatch(/size +1 × 1 × 1/);
    expect(r.stdout).toMatch(/1 mesh/);
  });

  it('the size follows the transforms of the nodes (the long box is 0.5 x 0.5 x 3 because its node is scaled), and a file with no clip says so', async () => {
    const r = await probe(fixture('long-box.gltf'));
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/size +0\.5 × 0\.5 × 3/);
    expect(r.stdout).toMatch(/no animation/i);
  });

  it('a .glb gives the same report as the .gltf it was made from, and --json has the numbers', async () => {
    const json = JSON.parse(readFileSync(fixture('spin-box.gltf'), 'utf8'));
    const glb = join(tmp, 'spin.glb');
    writeFileSync(glb, toGlb(json));
    const r = await probe(glb, '--json');
    expect(r.code, r.stderr).toBe(0);
    const report = JSON.parse(r.stdout);
    expect(report.container).toMatch(/glb/);
    expect(report.animations).toEqual([{ index: 0, name: 'Spin', duration: 2 }]);
    expect(report.size.map((v: number) => +v.toFixed(6))).toEqual([1, 1, 1]);
    expect(report.longest).toBeCloseTo(1, 6);
  });

  it('a file that needs a decoder (Draco, KTX2, Meshopt) says so: threeGltf does not set one up', async () => {
    const json = JSON.parse(readFileSync(fixture('spin-box.gltf'), 'utf8'));
    json.extensionsUsed = ['KHR_draco_mesh_compression']; json.extensionsRequired = ['KHR_draco_mesh_compression'];
    const f = join(tmp, 'draco.gltf');
    writeFileSync(f, JSON.stringify(json));
    const r = await probe(f);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/note .*KHR_draco_mesh_compression.*decoder/i);
  });

  it('a file that is not a glTF is one sentence naming the file, exit 1, no stack', async () => {
    const f = join(tmp, 'broken.glb');
    writeFileSync(f, Buffer.from('this is not a model'));
    const r = await probe(f);
    expect(r.code).toBe(1);
    expect(r.stderr + r.stdout).toContain('broken.glb');
    expect(r.stderr + r.stdout).not.toMatch(/\n\s+at /);
  });
});
