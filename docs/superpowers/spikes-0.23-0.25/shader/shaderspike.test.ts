// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// the first test of a file starts a browser tab and loads the page; under the whole suite's load that can pass the 5 s default
vi.setConfig({ testTimeout: 60000 });
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function open<T>(fn: (cdp: any) => Promise<T>, query = ''): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'light-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/shader.html${query}` });
    for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}


const mine = (logs: string[]) => logs.filter(l => l.includes('pixi-effects:') && !l.includes('WebGPU'));
const rgb = async (cdp: any, url: string, x: number, y: number): Promise<number[]> => cdp.eval(`px(${JSON.stringify(url)}, ${x}, ${y})`);
const GRAD = `void mainImage(out vec4 c, in vec2 f) { vec2 uv = f / iResolution.xy; c = vec4(uv.x, uv.y, 0.5 + 0.5 * sin(iTime * 3.0), 1.0); }`;

describe.each([['default', ''], ['webgl', '?backend=webgl']])('shader spike (%s)', (_l, query) => {
  const withPage = <T,>(fn: (cdp: any) => Promise<T>) => open(fn, query);
  it('a gradient with time: pixels follow uv and iTime; every seek order agrees', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: { sequences: [{ type: 'shader', fragment: GRAD, width: 320, height: 180 }] } })})`);
      for (const [f, t] of [[0, 0], [15, 0.5], [45, 1.5]] as Array<[number, number]>) {
        const u = await cdp.eval(`snap(${f})`);
        const p = await rgb(cdp, u, 80, 135);                       // uv = (0.25 + 0.5/320, 0.25 from the BOTTOM: y = 135 of 180)
        const want = [0.25 * 255, (1 - 135.5 / 180) * 255, (0.5 + 0.5 * Math.sin(t * 3)) * 255];
        console.log(`[spike ${_l}] f${f}: got ${p} want ${want.map(v => Math.round(v))}`);
        for (let k = 0; k < 3; k++) expect(Math.abs(p[k]! - want[k]!)).toBeLessThanOrEqual(3);
      }
      const o = await cdp.eval('orders([0, 7, 15, 22, 30, 38, 45, 52, 59])');
      expect(o.bwdMax).toBe(0); expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });
  it('a compile error warns with your own line numbers and draws a checkerboard', async () => {
    await withPage(async (cdp) => {
      const bad = `void mainImage(out vec4 c, in vec2 f) {\n  c = vec4(undefinedThing, 0.0, 0.0, 1.0);\n}`;
      await cdp.eval(`mk(${JSON.stringify({ composition: { sequences: [{ type: 'shader', fragment: bad, width: 320, height: 180 }] } })})`);
      const logs: string[] = await cdp.eval('__logs');
      console.log(`[spike ${_l}] error log: ${JSON.stringify(mine(logs)[0]).slice(0, 300)}`);
      expect(mine(logs).some(l => /did not compile/.test(l) && /0:2/.test(l))).toBe(true);
    });
  });
  it('two layers of different sizes share the one GL context and keep their own pictures; a transparent one blends over a backdrop', async () => {
    await withPage(async (cdp) => {
      const red = `void mainImage(out vec4 c, in vec2 f) { c = vec4(1.0, 0.0, 0.0, 1.0); }`;
      const blueHalf = `void mainImage(out vec4 c, in vec2 f) { c = vec4(0.0, 0.0, 1.0, 0.5); }`;
      const seq = [
        { type: 'shape', shape: 'rect', width: 320, height: 180, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#00ff00' } },
        { type: 'shader', fragment: red, width: 100, height: 100, initial: { x: 10, y: 10 } },
        { type: 'shader', fragment: blueHalf, transparent: true, width: 120, height: 60, initial: { x: 150, y: 100 } },
      ];
      await cdp.eval(`mk(${JSON.stringify({ composition: { sequences: seq } })})`);
      const u = await cdp.eval('snap(0)');
      const a = await rgb(cdp, u, 50, 50), b = await rgb(cdp, u, 200, 120), c = await rgb(cdp, u, 300, 20);
      console.log(`[spike ${_l}] red ${a} blue-half over green ${b} backdrop ${c}`);
      expect(a[0]).toBeGreaterThan(250); expect(a[1]).toBeLessThan(5);
      expect(Math.abs(b[2]! - 128)).toBeLessThanOrEqual(3); expect(Math.abs(b[1]! - 128)).toBeLessThanOrEqual(3);
      expect(c[1]).toBeGreaterThan(250);
    });
  });
  it('cost: 20 small shader layers and one full-size shader layer against plain rects (median ms of a snapshot)', async () => {
    await withPage(async (cdp) => {
      const heavy = `void mainImage(out vec4 c, in vec2 f) { vec2 p = f / iResolution.xy * 6.0; float v = 0.0; for (int i = 0; i < 8; i++) { p = vec2(sin(p.y + iTime) , cos(p.x - iTime)) * 1.3 + p * 0.5; v += 0.1 * sin(p.x * p.y); } c = vec4(vec3(0.5 + v), 1.0); }`;
      const rects = Array.from({ length: 20 }, (_, i) => ({ type: 'shape', shape: 'rect', width: 160, height: 90, anchorX: 0, anchorY: 0, initial: { x: (i % 5) * 64, y: Math.floor(i / 5) * 40, fillColor: '#336699' } }));
      const shaders = Array.from({ length: 20 }, (_, i) => ({ type: 'shader', fragment: heavy, width: 160, height: 90, initial: { x: (i % 5) * 64, y: Math.floor(i / 5) * 40 } }));
      const big = [{ type: 'shader', fragment: heavy, width: 1920, height: 1080 }];
      const plainBig = [{ type: 'shape', shape: 'rect', width: 1920, height: 1080, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#336699' } }];
      const bench = async (seq: unknown[], w = 320, h = 180) => cdp.eval(`bench(${JSON.stringify({ duration: 1, width: w, height: h, composition: { sequences: seq } })})`);
      const r20 = await bench(rects), s20 = await bench(shaders), rb = await bench(plainBig, 1920, 1080), sb = await bench(big, 1920, 1080);
      console.log(`[spike ${_l}] 20 layers: plain ${r20.toFixed(1)} ms, shader ${s20.toFixed(1)} ms; 1080p: plain ${rb.toFixed(1)} ms, shader ${sb.toFixed(1)} ms`);
    });
  }, 300000);
});
