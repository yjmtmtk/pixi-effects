import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
// loaded by URL: the tool is a plain .mjs script outside src/
const tool: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

describe('check.mjs — pure helpers', () => {
  it('parseArgs: a page, options with values, and a clear error for a typo', () => {
    const o = tool.parseArgs(['my.html', '--frames', '6', '--formats', 'mp4,webm', '--no-export', '--timeout', '90', '--out', 'o']);
    expect(o).toMatchObject({ page: 'my.html', frames: 6, formats: ['mp4', 'webm'], export: false, timeout: 90, out: 'o' });
    expect(tool.parseArgs(['p.html']).formats).toEqual(['mp4']);
    expect(() => tool.parseArgs(['p.html', '--fast'])).toThrow(/unknown option --fast/);
    expect(() => tool.parseArgs(['p.html', '--frames'])).toThrow(/needs a value/);
  });

  it('groupIssues: issues that differ only by numbers are one kind, with count and frame range', () => {
    const g = tool.groupIssues([
      { frame: 0, issues: ['text layer "a" is cut off: 120px beyond the right edge', 'x overlaps y by 50%'] },
      { frame: 30, issues: ['text layer "a" is cut off: 80px beyond the right edge'] },
      { frame: 60, issues: ['text layer "a" is cut off: 20px beyond the right edge'] },
    ]);
    expect(g).toEqual([
      { message: 'text layer "a" is cut off: 120px beyond the right edge', count: 3, firstFrame: 0, lastFrame: 60 },
      { message: 'x overlaps y by 50%', count: 1, firstFrame: 0, lastFrame: 0 },
    ]);
  });

  it('splitIssues: overlaps are for the eyes (often intentional), cut-off / off-canvas / no size are problems; strict makes all problems', () => {
    const groups = [
      { message: 'text layer "a" is cut off by the canvas edge: 12px beyond the right edge', count: 2, firstFrame: 0, lastFrame: 30 },
      { message: 'text layers "g" and "t" overlap by 99% of the smaller one', count: 3, firstFrame: 36, lastFrame: 48 },
      { message: 'text layer "b" has no size (empty text, or not drawn yet)', count: 1, firstFrame: 0, lastFrame: 0 },
    ];
    const loose = tool.splitIssues(groups, false);
    expect(loose.problems.map((g: any) => g.message)).toEqual([groups[0].message, groups[2].message]);
    expect(loose.review.map((g: any) => g.message)).toEqual([groups[1].message]);
    const strict = tool.splitIssues(groups, true);
    expect(strict.problems).toHaveLength(3);
    expect(strict.review).toEqual([]);
  });

  it('parseArgs: --strict', () => {
    expect(tool.parseArgs(['p.html', '--strict']).strict).toBe(true);
    expect(tool.parseArgs(['p.html']).strict).toBe(false);
  });

  it('findChrome: $CHROME wins, then the usual places; null when there is none', () => {
    expect(tool.findChrome({ CHROME: '/x/chrome' }, (p: string) => p === '/x/chrome', 'linux')).toBe('/x/chrome');
    expect(tool.findChrome({}, (p: string) => p === '/usr/bin/chromium', 'linux')).toBe('/usr/bin/chromium');
    expect(tool.findChrome({}, (p: string) => p.includes('Google Chrome.app'), 'darwin')).toContain('Google Chrome');
    expect(tool.findChrome({}, () => false, 'linux')).toBeNull();
  });

  it('findRoot: the nearest folder above the page that holds dist/index.js', () => {
    const has = (p: string) => p === '/proj/dist/index.js';
    expect(tool.findRoot('/proj/examples/gallery', has)).toBe('/proj');
    expect(tool.findRoot('/elsewhere/a', has)).toBe('/elsewhere/a');
  });
});

const chrome = tool.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('check.mjs — the command, run for real in Chrome', () => {
  it('checks examples/_checks/sfx-export.html: exit 0, no warnings, sheet.png and a decoded mp4 with its audio', async () => {
    const out = mkdtempSync(join(tmpdir(), 'check-test-'));
    const { stdout } = await promisify(execFile)('node', [
      join(root, 'ai/tools/check.mjs'), join(root, 'examples/_checks/sfx-export.html'), '--out', out, '--frames', '4', '--timeout', '150',
    ], { timeout: 170_000 });                                  // a non-zero exit would reject
    expect(stdout).toContain('RESULT: OK');
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.ok).toBe(true);
    expect(report.problems).toEqual([]);
    expect(report.logs).toEqual([]);
    expect(report.hasAudio).toBe(true);
    expect(readFileSync(join(out, 'sheet.png')).subarray(1, 4).toString()).toBe('PNG');
    const timeline = readFileSync(join(out, 'timeline.html'), 'utf8');         // every layer as a bar on a time axis, for a human to open
    expect(timeline).toContain('<svg');
    expect(report.files.timeline).toMatch(/timeline\.html$/);
    const ex = report.exports[0];
    expect(ex.format).toBe('mp4');
    expect(ex.video.duration).toBeGreaterThan(3.3);
    expect(ex.audio.duration).toBeGreaterThan(3.3);
    expect(Math.max(...ex.audio.rmsDbPerSecond)).toBeGreaterThan(-40);
    expect(existsSync(join(out, 'sfx-export.mp4'))).toBe(true);
  }, 190_000);

  it('exits 1 and names the problem when the page has one', async () => {
    const out = mkdtempSync(join(tmpdir(), 'check-test-'));
    const dir = join(root, 'examples/_checks');
    const bad = join(dir, '__bad-check-fixture.html');
    writeFileSync(bad, readFileSync(join(dir, 'sfx-export.html'), 'utf8').replace("['click', 0.5]", "['whoosh', 0.5]"));
    try {
      await expect(promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), bad, '--out', out, '--no-export', '--timeout', '90'], { timeout: 110_000 }))
        .rejects.toMatchObject({ code: 1 });
      const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
      expect(report.ok).toBe(false);
      expect(report.logs.join('\n')).toContain('whoosh');
      expect(report.problems.join('\n')).toMatch(/console warning/);
    } finally { rmSync(bad, { force: true }); }
  }, 130_000);
});
