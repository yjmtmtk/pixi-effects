// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

/** `check` on the film with a query: its exit code, what it printed, and the report. */
async function run(query: string): Promise<{ code: number; stdout: string; report: any }> {
  const out = mkdtempSync(join(tmpdir(), 'three-det-'));
  let stdout = '';
  const code = await promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/three-determinism.html'), '--no-export', '--out', out, '--timeout', '120', ...(query ? ['--query', query] : [])], { timeout: 150_000 })
    .then((r) => { stdout = r.stdout; return 0; }, (e: any) => { stdout = e.stdout ?? ''; return e.code as number; });
  return { code, stdout, report: JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) };
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('check holds a three layer to "a function of the time", as it does a canvas layer', () => {
  it('a layer whose update depends only on t passes, and check says it ran (a line with the layer count, the moments and the draw time)', async () => {
    const r = await run('');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/three +1 three layer\(s\) drew the same picture twice at 4 moments[^\n]*deterministic[^\n]*slowest draw [\d.]+ ms/);
    expect(r.report.inspect.canvas).toEqual([]);
    expect(r.report.inspect.canvasLayers.filter((l: any) => l.kind === 'three').every((l: any) => l.ok && l.moments.length === 4)).toBe(true);
  }, 200_000);

  it('Math.random in update: a problem that names the layer and the moments, and a build-time warning', async () => {
    const r = await run('leaky=random');
    expect(r.code).toBe(1);
    const said = r.report.inspect.canvas.join('\n');
    expect(said).toMatch(/"spin" does not draw the same picture/);
    expect(said).toMatch(/Math\.random|mixer\.update|outlives/);
    expect(r.report.logs.join('\n')).toMatch(/update calls Math\.random/);
  }, 200_000);

  it('state that builds up from call to call (turning by the time since the last call: what mixer.update(dt) does) is caught, with the fix for a clip named', async () => {
    const r = await run('leaky=dt');
    expect(r.code).toBe(1);
    const said = r.report.inspect.canvas.join('\n');
    expect(said).toMatch(/"spin" does not draw the same picture/);
    expect(said).toMatch(/setTime|pose\(t\)/);
  }, 200_000);

  it('a layer that follows the composition (followCamera, followLights) passes too', async () => {
    const r = await run('follow=1');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/three +1 three layer\(s\) drew the same picture twice/);
  }, 200_000);

  it("with renderer: 'webgpu' the layer is checked as well (the picture is read from the WebGPU canvas in the same task)", async () => {
    const r = await run('renderer=webgpu');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/three +1 three layer\(s\) drew the same picture twice/);
  }, 200_000);
});
