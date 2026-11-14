// @vitest-environment node
import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runFilms } from '../films/support/withFilm';

// `check --webgl` draws the page with WebGL, as a browser without WebGPU does (PixiJS prefers WebGPU where it exists), and the page line says which one drew.
// PE_BACKEND=webgl is the same switch for a whole test run (`npm run test:webgl`), so it is left out here: the plain run is the WebGPU one.
const root = resolve(__dirname, '../..');
async function run(extra: string[]): Promise<{ stdout: string; report: any }> {
  const out = mkdtempSync(join(tmpdir(), 'backend-'));
  const env = { ...process.env }; delete env.PE_BACKEND;
  const r = await promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/scene2d.html'), '--no-export', '--frames', '2', '--out', out, ...extra], { timeout: 150_000, env }).catch((e: any) => e);
  return { stdout: r.stdout ?? '', report: JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) };
}

runFilms('check --webgl', () => {
  it('the page line names the backend: webgpu by default, webgl with --webgl', async () => {
    const plain = await run([]);
    expect(plain.report.backend, plain.stdout).toBe('webgpu');
    expect(plain.stdout).toMatch(/page +ready in .* · webgpu/);
    const gl = await run(['--webgl']);
    expect(gl.report.backend, gl.stdout).toBe('webgl');
    expect(gl.stdout).toMatch(/page +ready in .* · webgl/);
  }, 320_000);
});
