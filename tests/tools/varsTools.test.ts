// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

vi.setConfig({ testTimeout: 240000 });
const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
const page = join(root, 'examples/_checks/vars-page.html');
const run = (tool: string, args: string[]) => promisify(execFile)('node', [join(root, 'ai/tools', tool), page, ...args, '--timeout', '150'], { timeout: 200_000 });
const fail = async (tool: string, args: string[]) => { try { await run(tool, args); } catch (e: any) { return e; } throw new Error('expected the command to fail'); };

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('check and render with --var and --size', () => {
  it('check --var --size: the page is built again with them; one contact sheet per size; the vars line says what was set', async () => {
    const out = mkdtempSync(join(tmpdir(), 'varcheck-'));
    const { stdout } = await run('check.mjs', ['--no-export', '--frames', '2', '--out', out, '--var', 'title=SÜD', '--var', 'accent=#3949ab', '--var', 'shift=12', '--size', '640x360,360x640']);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.vars).toEqual({ title: 'SÜD', accent: '#3949ab', shift: 12 });
    expect(report).toMatchObject({ width: 640, height: 360, ok: true });
    expect(report.rebuilt).toMatchObject({ reason: 'rebuild' });
    expect(report.sizes.map((s: any) => s.size)).toEqual(['640x360', '360x640']);
    expect(existsSync(join(out, 'sheet.png')) && statSync(join(out, 'sheet-360x640.png')).size > 500).toBe(true);
    expect(stdout).toMatch(/vars\s+title=SÜD, accent=#3949ab, shift=12/);
    expect(stdout).toMatch(/sizes\s+640x360 no layout issue · 360x640 no layout issue/);
  });

  it('check without them is as before: the declared values, no rebuild, no sizes line', async () => {
    const out = mkdtempSync(join(tmpdir(), 'varcheck-'));
    const { stdout } = await run('check.mjs', ['--no-export', '--frames', '2', '--out', out]);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.vars).toEqual({ title: 'NORD', accent: '#e53935', shift: 0 });
    expect(report.rebuilt).toBeUndefined();
    expect(report.sizes).toBeUndefined();
    expect(report).toMatchObject({ width: 320, height: 180 });
    expect(stdout).not.toMatch(/sizes\s/);
  });

  it('a warning the page makes while an extra size is built is not lost: it is listed and the check does not say OK', async () => {
    const out = mkdtempSync(join(tmpdir(), 'varcheck-'));
    const { stdout } = await run('check.mjs', ['--no-export', '--frames', '2', '--out', out, '--query', 'warn=1', '--size', '640x360,360x640']).catch((e: any) => e);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.logs.join('\n')).toMatch(/a warning while the page was built at 360 wide/);
    expect(report.problems.join('\n')).toMatch(/console warning/);
    expect(report.ok).toBe(false);
    void stdout;
  });

  it('a variable the page did not declare stops the run and says the nearest one', async () => {
    const e = await fail('check.mjs', ['--no-export', '--var', 'shfit=3']);
    expect(e.stderr).toMatch(/--var shfit: the page declares no variable "shfit" — did you mean "shift"\? \(declared: title, accent, shift\)/);
    expect(e.code).not.toBe(0);
  });

  it('a number variable given text stops the run', async () => {
    const e = await fail('check.mjs', ['--no-export', '--var', 'shift=left']);
    expect(e.stderr).toMatch(/"shift" is a number in the page/);
  });

  it('render --var --size writes a file of that size (read back from the mp4)', async () => {
    const out = join(mkdtempSync(join(tmpdir(), 'varrender-')), 'v.mp4');
    await run('render.mjs', ['-o', out, '--quiet', '--var', 'title=SÜD', '--size', '360x640']);
    const bytes = readFileSync(out);
    // the avc1 sample entry (inside 'stsd') has the picture width and height as 16-bit numbers
    const at = bytes.indexOf('avc1', bytes.indexOf('stsd'));      // (not the avc1 brand in 'ftyp')
    expect(at, 'an avc1 sample entry').toBeGreaterThan(0);
    expect([bytes.readUInt16BE(at + 28), bytes.readUInt16BE(at + 30)]).toEqual([360, 640]);
  });
});
