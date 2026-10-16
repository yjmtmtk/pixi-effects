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
async function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string; report: any }> {
  const out = mkdtempSync(join(tmpdir(), 'check-pick-'));
  const r = await promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/pick.html'), '--no-export', '--out', out, '--timeout', '120', ...args], { timeout: 150_000 })
    .then((x) => ({ code: 0, stdout: x.stdout, stderr: x.stderr }), (e: any) => ({ code: e.code as number, stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') }));
  let report: any = null;
  try { report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')); } catch { /* a usage error writes none */ }
  return { ...r, report };
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('check --pick: what is under a point at each --at moment (a layout question an AI can answer without looking)', () => {
  it('prints, for each moment, the layers under the point, the top first, and names the object a three layer met', async () => {
    const r = await run(['--at', '0,2', '--pick', '100,60', '--pick', '330,170']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/pick +\S+ \(100, 60\) — button, bg/);
    expect(r.stdout).toMatch(/pick +\S+ \(330, 170\) — world \(three: cube\), bg/);
    expect(r.stdout, 'two seconds later the camera has moved: the cube is not there').toMatch(/pick +2\S*s \(330, 170\) — bg/);
    const first = r.report.at[0].pick;
    expect(first[0]).toMatchObject({ x: 100, y: 60 });
    expect(first[0].hits.map((h: { name: string }) => h.name)).toEqual(['button', 'bg']);
  }, 200_000);

  it('a point with nothing under it says so; a bad --pick is one sentence, and --pick needs --at', async () => {
    const none = await run(['--at', '0', '--pick', '5000,5000']);
    expect(none.code, none.stderr).toBe(0);
    expect(none.stdout).toMatch(/pick +\S+ \(5000, 5000\) — nothing/);
    const bad = await run(['--at', '0', '--pick', 'abc']);
    expect(bad.code).not.toBe(0);
    expect(bad.stderr + bad.stdout).toMatch(/--pick must look like 640,360/);
    const lone = await run(['--pick', '10,10']);
    expect(lone.code).not.toBe(0);
    expect(lone.stderr + lone.stdout).toMatch(/--pick asks about the moments of --at/);
  }, 200_000);
});
