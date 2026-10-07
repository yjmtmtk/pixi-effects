import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const tool: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/render.mjs')).href);
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

describe('render.mjs — pure helpers', () => {
  it('formatFromPath: the container follows the output file extension', () => {
    expect(tool.formatFromPath('out.mp4')).toBe('mp4');
    expect(tool.formatFromPath('/a/b/clip.WEBM')).toBe('webm');
    expect(tool.formatFromPath('x.mov')).toBe('mov');
    expect(tool.formatFromPath('x.mkv')).toBe('mkv');
    expect(tool.formatFromPath('deck.PDF')).toBe('pdf');
    expect(tool.formatFromPath('x')).toBeNull();
    expect(() => tool.formatFromPath('x.gif')).toThrow(/mp4, webm, mov, mkv or pdf/);
  });

  it('parseRenderArgs: a page, -o, and options; the format comes from -o unless --format says otherwise', () => {
    const o = tool.parseRenderArgs(['my.html', '-o', 'out/video.webm', '--quality', 'medium', '--timeout', '900', '--query', 'lang=ja', '--quiet']);
    expect(o).toMatchObject({ page: 'my.html', out: 'out/video.webm', format: 'webm', quality: 'medium', timeout: 900, query: 'lang=ja', quiet: true });
    const d = tool.parseRenderArgs(['my.html']);
    expect(d.format).toBe('mp4');
    expect(d.out).toBeNull();                                   // the default name comes from the page
    expect(d.quality).toBe('high');
    expect(tool.parseRenderArgs(['p.html', '-o', 'x.mp4', '--format', 'mov']).format).toBe('mov');
    expect(tool.parseRenderArgs(['p.html', '--fail-on-warn']).failOnWarn).toBe(true);
  });

  it('parseRenderArgs: a PDF, and --all-stops only goes with it', () => {
    expect(tool.parseRenderArgs(['d.html', '-o', 'deck.pdf', '--all-stops'])).toMatchObject({ format: 'pdf', allStops: true });
    expect(tool.parseRenderArgs(['d.html', '--format', 'pdf']).format).toBe('pdf');
    expect(() => tool.parseRenderArgs(['d.html', '-o', 'x.mp4', '--all-stops'])).toThrow(/--all-stops goes with a PDF/);
  });

  it('parseRenderArgs: --motion-blur SAMPLES and --shutter', () => {
    expect(tool.parseRenderArgs(['p.html']).motionBlur).toBeNull();
    expect(tool.parseRenderArgs(['p.html', '--motion-blur', '8', '--shutter', '0.25'])).toMatchObject({ motionBlur: 8, shutter: 0.25 });
    expect(() => tool.parseRenderArgs(['p.html', '--motion-blur', '1'])).toThrow(/2 to 64/);
    expect(() => tool.parseRenderArgs(['p.html', '--motion-blur', 'lots'])).toThrow(/--motion-blur/);
    expect(() => tool.parseRenderArgs(['p.html', '--motion-blur', '4', '--shutter', '2'])).toThrow(/--shutter/);
    expect(() => tool.parseRenderArgs(['p.html', '--shutter', '0.5'])).toThrow(/goes with --motion-blur/);
  });

  it('parseRenderArgs: clear errors for a typo, a bad value, or a missing value', () => {
    expect(() => tool.parseRenderArgs(['p.html', '--fast'])).toThrow(/unknown option --fast/);
    expect(() => tool.parseRenderArgs(['p.html', '--quality', 'ultra'])).toThrow(/very-low, low, medium, high or very-high/);
    expect(() => tool.parseRenderArgs(['p.html', '-o'])).toThrow(/needs a value/);
    expect(() => tool.parseRenderArgs(['a.html', 'b.html'])).toThrow(/unexpected argument/);
  });

  it('defaultOutput: next to where you run it, named after the page, with the format\'s extension', () => {
    expect(tool.defaultOutput('/x/my-video.html', 'webm')).toMatch(/my-video\.webm$/);
  });
});

const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('render.mjs — the command, run for real in Chrome', () => {
  it('renders a page to an mp4 file (a real file, with the page\'s duration and size) and exits 0', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'render-test-'));
    const out = join(dir, 'clip.mp4');
    const { stdout } = await promisify(execFile)('node', [
      join(root, 'ai/tools/render.mjs'), join(root, 'examples/_checks/sfx-export.html'), '-o', out, '--quiet', '--timeout', '150',
    ], { timeout: 170_000 });
    expect(existsSync(out)).toBe(true);
    expect(statSync(out).size).toBeGreaterThan(2000);
    expect(readFileSync(out).subarray(4, 8).toString()).toBe('ftyp');      // an MP4 starts with an ftyp box
    expect(stdout).toMatch(/clip\.mp4/);
    expect(stdout).toMatch(/3\.5 s/);
  }, 190_000);

  it('--motion-blur renders every frame as an average of samples and still writes the file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'render-test-'));
    const out = join(dir, 'blur.mp4');
    await promisify(execFile)('node', [join(root, 'ai/tools/render.mjs'), join(root, 'examples/_checks/motion-blur.html'), '-o', out, '--motion-blur', '3', '--shutter', '0.5', '--quiet', '--timeout', '150'], { timeout: 170_000 });
    expect(statSync(out).size).toBeGreaterThan(2000);
    expect(readFileSync(out).subarray(4, 8).toString()).toBe('ftyp');
  }, 190_000);

  it('a .pdf output is the deck as pages: a real PDF with one page per page of the talk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'render-test-'));
    const out = join(dir, 'deck.pdf');
    const { stdout } = await promisify(execFile)('node', [join(root, 'ai/tools/render.mjs'), join(root, 'examples/_checks/presenter.html'), '-o', out, '--quiet', '--timeout', '150'], { timeout: 170_000 });
    const s = readFileSync(out).toString('latin1');
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect((s.match(/\/Type \/Page\b(?!s)/g) ?? [])).toHaveLength(3);
    expect(stdout).toMatch(/deck\.pdf.*pdf/);
    const all = join(dir, 'all.pdf');
    await promisify(execFile)('node', [join(root, 'ai/tools/render.mjs'), join(root, 'examples/_checks/presenter.html'), '-o', all, '--all-stops', '--quiet', '--timeout', '150'], { timeout: 170_000 });
    expect((readFileSync(all).toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? [])).toHaveLength(4);
  }, 190_000);

  it('picks the container from the extension (webm)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'render-test-'));
    const out = join(dir, 'clip.webm');
    await promisify(execFile)('node', [join(root, 'ai/tools/render.mjs'), join(root, 'examples/_checks/sfx-export.html'), '-o', out, '--quiet', '--timeout', '150'], { timeout: 170_000 });
    expect(readFileSync(out).subarray(0, 4).toString('hex')).toBe('1a45dfa3');     // the EBML header of Matroska / WebM
  }, 190_000);

  it('exits 1 with the page\'s own message when it never becomes ready, and writes no file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'render-test-'));
    const out = join(dir, 'nope.mp4');
    const bad = join(root, 'examples/_checks/__bad-render-fixture.html');
    writeFileSync(bad, readFileSync(join(root, 'examples/_checks/sfx-export.html'), 'utf8').replace('await movie.init({', "throw new Error('boom'); await movie.init({"));
    try {
      await expect(promisify(execFile)('node', [join(root, 'ai/tools/render.mjs'), bad, '-o', out, '--timeout', '60', '--quiet'], { timeout: 90_000 }))
        .rejects.toMatchObject({ code: 1 });
      expect(existsSync(out)).toBe(false);
    } finally { rmSync(bad, { force: true }); }
  }, 90_000);

  it('--fail-on-warn: a page warning still writes the file, but the exit code is 1', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'render-test-'));
    const out = join(dir, 'warned.mp4');
    const warn = join(root, 'examples/_checks/__warn-render-fixture.html');
    writeFileSync(warn, readFileSync(join(root, 'examples/_checks/sfx-export.html'), 'utf8').replace("['click', 0.5]", "['whoosh', 0.5]"));
    try {
      await expect(promisify(execFile)('node', [join(root, 'ai/tools/render.mjs'), warn, '-o', out, '--fail-on-warn', '--timeout', '120', '--quiet'], { timeout: 150_000 }))
        .rejects.toMatchObject({ code: 1 });
      expect(statSync(out).size).toBeGreaterThan(2000);
    } finally { rmSync(warn, { force: true }); }
  }, 160_000);
});
