// @vitest-environment node
import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runFilms } from './support/withFilm';

// `check --do` clicks an object of a scene by its name, "layer/object", where movie.project says it is (a trial agent's `click Mars` said "no layer named Mars").
const root = resolve(__dirname, '../..');
async function run(extra: string[]): Promise<{ code: number; stdout: string; report: any }> {
  const out = mkdtempSync(join(tmpdir(), 'follow-check-'));
  let stdout = '';
  const args = [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/follow.html'), '--no-export', '--out', out, '--timeout', '120', ...extra];
  const code = await promisify(execFile)('node', args, { timeout: 150_000 })
    .then((r) => { stdout = r.stdout; return 0; }, (e: any) => { stdout = e.stdout ?? ''; return e.code as number; });
  return { code, stdout, report: JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) };
}

runFilms('check --do on an object of a scene', () => {
  it('"click world/mover" clicks where the object is; an object nobody has is said with the names there are', async () => {
    const r = await run(['--do', 'click world/mover']);
    const step = r.report.steps?.[0];
    expect(step?.label, r.stdout).toMatch(/^click world\/mover \(\d+, \d+\)$/);
    const [x, y] = step.points[0] ? [step.points[0].x, step.points[0].y] : [NaN, NaN];
    expect(x).toBeGreaterThan(250);                                   // the steps run at the end of the movie: the group is right of the middle (x 1 of -1 … 1) and above it
    expect(x).toBeLessThan(320);
    expect(y).toBeLessThan(135);
    const bad = await run(['--do', 'click world/Marz']);
    expect(JSON.stringify(bad.report.steps ?? bad.report.problems)).toMatch(/no object \\?"Marz\\?".*mover/);
  }, 320_000);
});
