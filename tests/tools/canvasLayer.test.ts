// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

/** The RGBA of a pixel of the stage at a frame (x, y in stage pixels). */
const PIXEL = (frame: number, x: number, y: number) => `(async () => { const img = new Image(); img.src = await movie.snapshot(${frame}, { as: 'dataURL' }); await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  return Array.from(g.getImageData(${x}, ${y}, 1, 1).data); })()`;

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the canvas layer, on a real browser', () => {
  it('draws what draw drew, where and when it says; params keyframes, a mask, a filter and a blend mode work on it; pixel art stays hard; one frame is one picture', async () => {
    const { server, port } = await check.serve(root);
    const dir = mkdtempSync(join(tmpdir(), 'canvas-layer-'));
    const { proc, cdp } = await launchPage(chrome, dir);
    try {
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/films/canvas-layer.html` });
      for (let i = 0; i < 120; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(250); }
      expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs').catch(() => []))).toBe(true);
      expect(await cdp.eval('window.__logs')).toEqual([]);

      // the red square is at x = t * 100 .. +40 (frame 30 = 1 s: 100..140, y 20..60; frame 60 = 2 s: 200..240)
      const red = (p: number[]) => p[0]! > 200 && p[1]! < 60 && p[2]! < 60;
      expect(red(await cdp.eval(PIXEL(30, 120, 40)))).toBe(true);
      expect(red(await cdp.eval(PIXEL(30, 220, 40)))).toBe(false);
      expect(red(await cdp.eval(PIXEL(60, 220, 40)))).toBe(true);
      expect(red(await cdp.eval(PIXEL(60, 120, 40)))).toBe(false);

      // params: the green circle (centre (400, 80) on the stage) has radius 30 at 1 s, 50 at 2 s: a pixel 40 px right of the centre is green only from about 1.33 s on
      const green = (p: number[]) => p[1]! > 150 && p[0]! < 60;
      expect(green(await cdp.eval(PIXEL(30, 440, 80)))).toBe(false);
      expect(green(await cdp.eval(PIXEL(60, 440, 80)))).toBe(true);
      expect(green(await cdp.eval(PIXEL(60, 400, 80)))).toBe(true);

      // setup's state arrived (the blue mark), and a mask + blend + filter layer shows its yellow inside the mask circle only
      const blue = await cdp.eval(PIXEL(30, 475, 145));
      expect(blue[2]! > 150 && blue[0]! < 100).toBe(true);
      const inside = await cdp.eval(PIXEL(30, 120, 260)), outside = await cdp.eval(PIXEL(30, 30, 215));
      expect(inside[0]! > 150 && inside[1]! > 120).toBe(true);
      expect(outside[0]! < 60).toBe(true);

      // pixel art: the 8x8 checkerboard scaled 8x has only black and white pixels, none grey (smoothing: false)
      const grey = await cdp.eval(`(async () => { const img = new Image(); img.src = await movie.snapshot(30, { as: 'dataURL' }); await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(522, 222, 60, 60).data; let n = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i]; if (v > 40 && v < 215) n++; } return n; })()`);
      expect(grey).toBeLessThan(40);                                           // a smoothed upscale has a grey seam at every edge: hundreds of pixels

      // a draw that never closes its save() does not leak its colour or alpha into the next frame (every start saw the defaults)
      await cdp.eval(`movie.snapshot(10, { as: 'dataURL' })`); await cdp.eval(`movie.snapshot(20, { as: 'dataURL' })`); await cdp.eval(`movie.snapshot(30, { as: 'dataURL' })`);
      const starts: string[] = await cdp.eval('window.__starts');
      expect(starts.length).toBeGreaterThan(3);
      expect([...new Set(starts)]).toEqual(['#000000|1']);

      // one frame is one picture: the same frame drawn after other frames is byte-identical
      const a = await cdp.eval(`movie.snapshot(45, { as: 'dataURL' })`);
      await cdp.eval(`movie.snapshot(90, { as: 'dataURL' })`);
      const b = await cdp.eval(`movie.snapshot(45, { as: 'dataURL' })`);
      expect(b).toBe(a);
    } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
  }, 120_000);

  it('check says that the canvas layers are deterministic (and how long a draw takes) when they pass, and names a draw that uses Math.random (a problem, with the moments and how much differs)', async () => {
    let stdout = '';
    const run = (query: string, out: string) => promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/canvas-layer.html'), '--no-export', '--out', out, '--timeout', '120', ...(query ? ['--query', query] : [])], { timeout: 150_000 }).then((r) => { stdout = r.stdout; return 0; }, (e: any) => { stdout = e.stdout ?? ''; return e.code as number; });
    const clean = mkdtempSync(join(tmpdir(), 'canvas-clean-')), dirty = mkdtempSync(join(tmpdir(), 'canvas-leaky-'));
    expect(await run('', clean)).toBe(0);
    expect(stdout).toMatch(/canvas +\d+ canvas layer\(s\) drew the same picture twice at 4 moments[^\n]*deterministic[^\n]*slowest draw [\d.]+ ms/);
    const r1 = JSON.parse(readFileSync(join(clean, 'report.json'), 'utf8'));
    expect(r1.inspect.issues).toEqual([]);
    expect(r1.inspect.canvas).toEqual([]);
    expect(r1.inspect.canvasLayers.every((r: any) => r.ok && r.moments.length === 4 && r.drawMs >= 0)).toBe(true);
    expect(await run('leaky=1', dirty)).toBe(1);
    expect(stdout).toMatch(/the other \d+ canvas layer/);
    const r2 = JSON.parse(readFileSync(join(dirty, 'report.json'), 'utf8'));
    const said = r2.inspect.canvas.join('\n');
    expect(said).toMatch(/"leaky" does not draw the same picture/);
    expect(said).toMatch(/channel values differ, by up to \d+ of 255/);
    expect(r2.inspect.issues).toEqual([]);                                     // it is not a layout issue
    expect(said).not.toMatch(/"mover"|"params"|"masked"/);
    expect(r2.logs.join('\n')).toMatch(/Math\.random/);                        // and the build-time warning too
  }, 300_000);

  it('a mask made in setup (document.createElement or info.canvas) and drawn with destination-in over many anti-aliased strokes is not reported: the browser draws it differently the first time, which the check throws away', async () => {
    const run = (query: string, out: string) => promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/canvas-layer.html'), '--no-export', '--out', out, '--timeout', '120', '--query', query], { timeout: 150_000 }).then(() => 0, (e: any) => e.code as number);
    for (const kind of ['plain', 'helper']) {
      const out = mkdtempSync(join(tmpdir(), `canvas-mask-${kind}-`));
      expect(await run(`mask=${kind}`, out), kind).toBe(0);
      expect(JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')).inspect.canvas, kind).toEqual([]);
    }
  }, 300_000);
});
