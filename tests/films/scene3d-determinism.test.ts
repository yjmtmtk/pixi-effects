// @vitest-environment node
import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runFilms } from './support/withFilm';

// `check` holds a scene3d layer to "a function of the time", as it does a canvas and a three layer: drawn at a few moments in two orders, the pictures compared.
const root = resolve(__dirname, '../..');
async function run(query: string): Promise<{ code: number; stdout: string; report: any }> {
  const out = mkdtempSync(join(tmpdir(), 's3d-det-'));
  let stdout = '';
  const args = [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/scene3d-determinism.html'), '--no-export', '--out', out, '--timeout', '120', ...(query ? ['--query', query] : [])];
  const code = await promisify(execFile)('node', args, { timeout: 150_000 })
    .then((r) => { stdout = r.stdout; return 0; }, (e: any) => { stdout = e.stdout ?? ''; return e.code as number; });
  return { code, stdout, report: JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) };
}

runFilms('check: a scene3d layer is held to "a function of the time"', () => {
  it('a layer whose update depends only on t passes, and check says it ran (the layer count, the moments, the draw time)', async () => {
    const r = await run('');
    expect(r.code, r.stdout).toBe(0);
    expect(r.stdout).toMatch(/scene3d +1 scene3d layer\(s\) drew the same picture twice at 4 moments[^\n]*deterministic[^\n]*slowest draw [\d.]+ ms/);
    expect(r.report.inspect.canvasLayers.filter((l: any) => l.kind === 'scene3d').every((l: any) => l.ok && l.moments.length === 4)).toBe(true);
  }, 200_000);

  it('state that builds up from call to call is caught, with the layer named and the way out', async () => {
    const r = await run('leaky=1');
    expect(r.code).toBe(1);
    const said = r.report.inspect.canvas.join('\n');
    expect(said).toMatch(/"spin" does not draw the same picture/);
    expect(said).toMatch(/gotoAndStop\(t\)/);
  }, 200_000);
});
