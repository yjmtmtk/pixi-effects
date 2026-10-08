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

// the guide's first-video page pins pixi-effects@<this version> on the CDN; just before a release it is not published yet
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const onCdn = await fetch(`https://cdn.jsdelivr.net/npm/pixi-effects@${version}/dist/index.js`, { method: 'HEAD' })
  .then((r) => r.ok, () => false);

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
    expect(readFileSync(join(out, 'poster.jpg')).subarray(0, 2).toString('hex')).toBe('ffd8');        // a JPEG: the picture that stands for the movie
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

  it('--at writes the pictures you name (and a sheet); --draft makes the export a half-size draft; a bad --at exits 2 naming the layers', async () => {
    const run = (args: string[]) => promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'examples/_checks/render-range.html'), ...args, '--timeout', '150'], { timeout: 170_000 });
    const out = mkdtempSync(join(tmpdir(), 'check-at-'));
    await run(['--out', out, '--no-export', '--at', '1,50%,f12,title@end']);
    for (const f of ['frames/1.00s.png', 'frames/50pct.png', 'frames/f12.png', 'frames/title-end.png', 'at.png']) {
      expect(readFileSync(join(out, f)).subarray(1, 4).toString(), f).toBe('PNG');
    }
    const r1 = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(r1.at.map((x: any) => x.frame)).toEqual([30, 60, 12, 89]);
    expect(r1.inspect.checkedFrames).toBeGreaterThan(14);                     // the 0.25 s grid (4 s), not the old ~60-frame stride

    const out2 = mkdtempSync(join(tmpdir(), 'check-draft-'));
    await run(['--out', out2, '--draft', '--frames', '4']);
    const r2 = JSON.parse(readFileSync(join(out2, 'report.json'), 'utf8'));
    expect(r2.exports[0].draft).toBe(true);
    expect([r2.exports[0].video.width, r2.exports[0].video.height]).toEqual([160, 90]);
    expect(r2.exports[0].video.duration).toBeGreaterThan(3.8);                 // a draft is smaller, not shorter

    const bad = await run(['--out', mkdtempSync(join(tmpdir(), 'check-bad-')), '--no-export', '--at', 'nope@end']).then(() => null, (e: any) => e);
    expect(bad?.code).toBe(2);
    expect(String(bad?.stderr)).toMatch(/no layer named "nope".*title/s);
  }, 400_000);

  it('audio: the report gives loudness, scenes and cues, the printout says LUFS and dBTP, waveform.png is a real picture; a silent movie has no waveform', async () => {
    const run = (page: string, out: string) => promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, page), '--no-export', '--out', out, '--timeout', '150'], { timeout: 170_000 });
    const out = mkdtempSync(join(tmpdir(), 'check-wave-'));
    const { stdout } = await run('examples/_checks/render-range.html', out);
    expect(stdout).toMatch(/LUFS/);
    expect(stdout).toMatch(/dBTP/);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(typeof report.audio.loudness.truePeakDb).toBe('number');
    expect(report.audio.scenes.length).toBeGreaterThan(0);
    expect(report.audio.cues.length).toBeGreaterThan(0);
    const png = readFileSync(join(out, 'waveform.png'));
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16)).toBeGreaterThanOrEqual(600);                         // the PNG header's width
    expect(report.files.waveform).toMatch(/waveform\.png$/);

    const quietOut = mkdtempSync(join(tmpdir(), 'check-nowave-'));
    await run('examples/_checks/poster.html', quietOut);
    expect(existsSync(join(quietOut, 'waveform.png'))).toBe(false);
  }, 200_000);

  it('fonts: a web font that failed to load fails the check; a layer with no available font is listed for review (and fails with --strict)', async () => {
    const run = (args: string[]) => promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'examples/_checks/fonts.html'), '--no-export', ...args, '--timeout', '150'], { timeout: 170_000 });
    const out = mkdtempSync(join(tmpdir(), 'check-fonts-'));
    const failed = await run(['--out', out]).then(() => null, (e: any) => e);
    expect(failed?.code).toBe(1);                                                    // the web font that cannot load is a problem
    expect(String(failed?.stdout)).toMatch(/1 web font\(s\) failed to load: Broken/);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.fonts.missing.map((m: any) => m.layer)).toEqual(['missing']);
    expect(report.inspect.review.map((r: any) => r.message).join('\n')).toMatch(/layer "missing": none of the fonts "ThisFontDoesNotExist123, NopeNope" is available/);
    expect(report.problems.join('\n')).not.toMatch(/layer "missing"/);               // not a failure without --strict
    const strict = await run(['--out', mkdtempSync(join(tmpdir(), 'check-fonts-')), '--strict']).then(() => null, (e: any) => e);
    expect(strict?.code).toBe(1);
    expect(String(strict?.stdout)).toMatch(/layer "missing": none of its fonts is available/);
  }, 200_000);

  it.skipIf(!onCdn)('the guide\'s first-video page (loaded from the CDN, as a reader would) passes the check, sound included', async () => {
    const out = mkdtempSync(join(tmpdir(), 'check-test-'));
    const { stdout } = await promisify(execFile)('node', [
      join(root, 'ai/tools/check.mjs'), join(root, 'examples/_guide/first-video.html'), '--out', out, '--frames', '4', '--timeout', '150',
    ], { timeout: 170_000 });
    expect(stdout).toContain('RESULT: OK');
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.logs).toEqual([]);
    expect(report.hasAudio).toBe(true);
  }, 190_000);

  it('a movie whose only sound is `music` (a tune written as text) has that sound in the mix and in the exported file', async () => {
    const out = mkdtempSync(join(tmpdir(), 'check-test-'));
    const { stdout } = await promisify(execFile)('node', [
      join(root, 'ai/tools/check.mjs'), join(root, 'examples/_checks/music.html'), '--out', out, '--frames', '4', '--timeout', '150',
    ], { timeout: 170_000 });
    expect(stdout).toContain('RESULT: OK');
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.logs).toEqual([]);
    expect(report.hasAudio).toBe(true);
    expect(report.audio.sources.map((s: { source: string }) => s.source)).toEqual(['music']);
    const ex = report.exports[0];
    expect(ex.audio.duration).toBeGreaterThan(9.5);
    expect(Math.max(...ex.audio.rmsDbPerSecond.slice(0, 9))).toBeGreaterThan(-35);      // sound in nearly every second of the file
    expect(ex.audio.rmsDbPerSecond.slice(0, 9).every((db: number) => db > -60)).toBe(true);
  }, 190_000);

  it('a movie with no sound says "no audio track", not a decoding error', async () => {
    const out = mkdtempSync(join(tmpdir(), 'check-test-'));
    const { stdout } = await promisify(execFile)('node', [
      join(root, 'ai/tools/check.mjs'), join(root, 'examples/_checks/poster.html'), '--out', out, '--frames', '4', '--timeout', '150',
    ], { timeout: 170_000 });
    expect(stdout).toContain('RESULT: OK');
    expect(stdout).toContain('no audio track');
    expect(stdout).not.toContain('Unable to decode');
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.exports[0].audio).toBeNull();
  }, 190_000);

  it('a presentation (quiet-hours) gets stops.png and a stops section in the report', async () => {
    const out = mkdtempSync(join(tmpdir(), 'check-test-'));
    const { stdout } = await promisify(execFile)('node', [
      join(root, 'ai/tools/check.mjs'), join(root, 'examples/gallery/quiet-hours.html'), '--out', out, '--frames', '4', '--no-export', '--timeout', '150',
    ], { timeout: 170_000 });
    expect(stdout).toMatch(/stops\s+\d+ stop\(s\) on 5 page\(s\)/);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
    expect(report.stops.pages).toBe(5);
    expect(report.stops.count).toBe(report.stops.items.length);
    expect(report.stops.items[0].pageStart).toBe(true);
    expect(readFileSync(join(out, 'stops.png')).subarray(1, 4).toString()).toBe('PNG');
    expect(stdout).toContain('every stop is a settled picture');
    expect(report.stops.review).toEqual([]);
  }, 190_000);

  it('a deck with a stop that lands mid-animation is listed for review, and fails with --strict', async () => {
    const dir = join(root, 'examples/_checks');
    const out = mkdtempSync(join(tmpdir(), 'check-test-'));
    const run = (args: string[]) => promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(dir, 'presenter.html'), '--out', out, '--no-export', '--timeout', '120', ...args], { timeout: 150_000 });
    const { stdout } = await run([]);                                           // the white square slides all the time: its stops are never still
    expect(stdout).toMatch(/review\s+\d+ stop\(s\) where the picture is still changing/);
    expect(stdout).toContain('RESULT: OK');
    await expect(run(['--strict'])).rejects.toMatchObject({ code: 1 });
  }, 300_000);

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
