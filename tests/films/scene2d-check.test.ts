// @vitest-environment node
import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runFilms } from './support/withFilm';

// `check` holds a scene2d layer to "a function of the time", as it does the canvas and 3D layers, and `--pick` names the object of the scene under a point.
const root = resolve(__dirname, '../..');
async function run(query: string, extra: string[] = []): Promise<{ code: number; stdout: string; report: any }> {
  const out = mkdtempSync(join(tmpdir(), 's2d-check-'));
  let stdout = '';
  const args = [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/scene2d.html'), '--no-export', '--out', out, '--timeout', '120', ...(query ? ['--query', query] : []), ...extra];
  const code = await promisify(execFile)('node', args, { timeout: 150_000 })
    .then((r) => { stdout = r.stdout; return 0; }, (e: any) => { stdout = e.stdout ?? ''; return e.code as number; });
  return { code, stdout, report: JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) };
}

runFilms('check: a scene2d layer', () => {
  it('a layer whose update depends only on t passes, and check says it ran (the layer count, the moments, the draw time)', async () => {
    const r = await run('');
    expect(r.code, r.stdout).toBe(0);
    expect(r.stdout).toMatch(/scene2d +1 scene2d layer\(s\) drew the same picture twice at 4 moments[^\n]*deterministic[^\n]*slowest draw [\d.]+ ms/);
  }, 200_000);

  it('state that builds up from call to call is caught, with the layer named and the way out', async () => {
    const r = await run('leaky=1');
    expect(r.code).toBe(1);
    const said = r.report.inspect.canvas.join('\n');
    expect(said).toMatch(/"world" does not draw the same picture/);
    expect(said).toMatch(/Set every object from t/);
  }, 200_000);

  it('--pick prints the object of the scene under the point: "world (scene2d: box)"', async () => {
    const r = await run('', ['--at', '0', '--pick', '270,40']);
    expect(r.stdout).toMatch(/pick .*world \(scene2d: box\)/);
  }, 200_000);
});
