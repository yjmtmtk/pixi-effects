// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// the first test of a file starts a browser tab and loads the page; under the whole suite's load that can pass the 5 s default
vi.setConfig({ testTimeout: 60000 });
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';
import { blendPixel, hexToRgb } from '../support/blendReference';
import { builtInLuma } from '../../src/filters/LumaWipe';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function open<T>(fn: (cdp: any) => Promise<T>, query = ''): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'matte-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/mattes.html${query}` });
    for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const TOLERANCE = 2;                                       // 8-bit channels
const mine = (logs: string[]) => logs.filter(l => l.includes('pixi-effects:') && !l.includes('WebGPU'));

const BACK = '#b0703a', LAYER = '#3dd6c8';
const rect = (name: string, o: Record<string, unknown> = {}) => ({ type: 'shape', shape: 'rect', name, width: 160, height: 90, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: BACK }, ...o });
const backdrop = rect('backdrop');
const layer = (extra: Record<string, unknown> = {}) => rect('L', { initial: { x: 0, y: 0, fillColor: LAYER }, ...extra });
const disc = (name = 'm', fill = '#ffffff', extra: Record<string, unknown> = {}) => ({ type: 'shape', shape: 'circle', name, radius: 20, initial: { x: 80, y: 45, fillColor: fill }, ...extra });
const at = async (cdp: any, url: string, x: number, y: number): Promise<number[]> => cdp.eval(`px(${JSON.stringify(url)}, ${x}, ${y})`);
const mix = (m: number): number[] => hexToRgb(BACK).map((b, k) => (b * (1 - m) + hexToRgb(LAYER)[k]! * m) * 255);
const near = (got: number[], want: number[], label: string) => { for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - want[k]!), `${label} channel ${k}: got ${got} want ${want.map(Math.round)}`).toBeLessThanOrEqual(TOLERANCE); };
const frame = async (cdp: any, composition: unknown, f = 0, extra: Record<string, unknown> = {}) => { await cdp.eval(`mk(${JSON.stringify({ composition, ...extra })})`); return cdp.eval(`snap(${f})`) as Promise<string>; };

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS).each([['the default backend', ''], ['WebGL', '?backend=webgl']])('mattes, on a real browser (%s)', (_label, query) => {
  const withPage = <T,>(fn: (cdp: any) => Promise<T>) => open(fn, query);

  it('an alpha matte: the layer shows inside the disc and the backdrop outside; the matte itself is not drawn (even though it is listed after the layer)', async () => {
    await withPage(async (cdp) => {
      const url = await frame(cdp, { sequences: [backdrop, layer({ mask: 'm' }), disc()] });
      near(await at(cdp, url, 80, 45), mix(1), 'inside');
      near(await at(cdp, url, 10, 10), mix(0), 'outside');
      near(await at(cdp, url, 100, 45), mix(0), 'the disc is radius 20: x = 100 is its edge, 105 is outside');
    });
  });

  it('a half-transparent matte cuts halfway', async () => {
    await withPage(async (cdp) => {
      const url = await frame(cdp, { sequences: [backdrop, disc('m', '#ffffff', { initial: { x: 80, y: 45, fillColor: '#ffffff', alpha: 0.5 } }), layer({ mask: 'm' })] });
      near(await at(cdp, url, 80, 45), mix(0.5), 'inside');
    });
  });

  it('a luma matte reads the brightness (Rec. 709) of the matte, alpha reads its opacity', async () => {
    await withPage(async (cdp) => {
      let url = await frame(cdp, { sequences: [backdrop, rect('m', { initial: { x: 0, y: 0, fillColor: '#808080' } }), layer({ mask: { layer: 'm', channel: 'luma' } })] });
      near(await at(cdp, url, 80, 45), mix(128 / 255), 'grey #808080 as luma');
      url = await frame(cdp, { sequences: [backdrop, rect('m', { initial: { x: 0, y: 0, fillColor: '#ff0000' } }), layer({ mask: { layer: 'm', channel: 'luma' } })] });
      near(await at(cdp, url, 80, 45), mix(0.2126), 'red as luma (0.2126)');
      url = await frame(cdp, { sequences: [backdrop, rect('m', { initial: { x: 0, y: 0, fillColor: '#ff0000' } }), layer({ mask: 'm' })] });
      near(await at(cdp, url, 80, 45), mix(1), 'the same red as alpha is fully opaque');
    });
  });

  it('invert uses 1 − matte (alpha and luma)', async () => {
    await withPage(async (cdp) => {
      let url = await frame(cdp, { sequences: [backdrop, disc(), layer({ mask: { layer: 'm', invert: true } })] });
      near(await at(cdp, url, 80, 45), mix(0), 'inside the disc: the hole');
      near(await at(cdp, url, 10, 10), mix(1), 'outside');
      url = await frame(cdp, { sequences: [backdrop, rect('m', { initial: { x: 0, y: 0, fillColor: '#808080' } }), layer({ mask: { layer: 'm', channel: 'luma', invert: true } })] });
      near(await at(cdp, url, 80, 45), mix(1 - 128 / 255), 'inverted grey luma');
    });
  });

  it('a list intersects, and subtracting a matte is inverting it', async () => {
    await withPage(async (cdp) => {
      const left = rect('A', { width: 80, initial: { x: 0, y: 0, fillColor: '#ffffff' } });
      const b = disc('B');
      let url = await frame(cdp, { sequences: [backdrop, left, b, layer({ mask: ['A', 'B'] })] });
      near(await at(cdp, url, 70, 45), mix(1), 'in A and in B');
      near(await at(cdp, url, 100, 45), mix(0), 'in B but not in A');
      near(await at(cdp, url, 10, 10), mix(0), 'in neither');
      url = await frame(cdp, { sequences: [backdrop, left, b, layer({ mask: ['A', { layer: 'B', invert: true }] })] });
      near(await at(cdp, url, 70, 45), mix(0), 'in A and in B: subtracted');
      near(await at(cdp, url, 10, 10), mix(1), 'in A, not in B');
      near(await at(cdp, url, 120, 10), mix(0), 'not in A');
    });
  });

  it('one matte shared by three layers, moving: each layer is cut where the matte is at that frame (never stale), and every seek order gives the same pictures', async () => {
    await withPage(async (cdp) => {
      const m = rect('m', { width: 30, height: 90, initial: { x: 0, y: 0, fillColor: '#ffffff' }, keyframes: [{ at: 0, to: { x: 130 }, duration: 1, ease: 'none' }] });
      const band = (name: string, y: number, color: string) => rect(name, { height: 30, initial: { x: 0, y, fillColor: color }, mask: 'm' });
      const comp = { sequences: [backdrop, m, band('top', 0, '#ff3366'), band('mid', 30, '#33ff66'), band('low', 60, '#3366ff')] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 1, composition: comp })})`);
      for (const f of [0, 15, 29]) {
        const url: string = await cdp.eval(`snap(${f})`);
        const x0 = 130 * (f / 30);                                     // the matte's left edge at this frame (x = 130 · t, t = f / 30)
        for (const [y, color] of [[15, '#ff3366'], [45, '#33ff66'], [75, '#3366ff']] as const) {
          near(await at(cdp, url, Math.round(x0 + 15), y), hexToRgb(color).map(v => v * 255), `frame ${f}, ${color}: inside the matte`);
          if (x0 > 40) near(await at(cdp, url, 10, y), hexToRgb(BACK).map(v => v * 255), `frame ${f}, ${color}: outside the matte`);
        }
      }
      const o = await cdp.eval('orders([0, 4, 9, 15, 22, 29])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('a matte with its own at and duration: where it is missing the layer is invisible (and the build said so once)', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk(${JSON.stringify({ duration: 1, composition: { sequences: [backdrop, disc('m', '#ffffff', { at: 0.3, duration: 0.4 }), layer({ mask: 'm' })] } })})`);
      near(await at(cdp, await cdp.eval('snap(0)'), 80, 45), mix(0), 'before the matte exists: the layer is cut away entirely');
      near(await at(cdp, await cdp.eval('snap(12)'), 80, 45), mix(1), 'while the matte exists (0.4 s)');
      near(await at(cdp, await cdp.eval('snap(12)'), 10, 10), mix(0), 'outside the disc');
      near(await at(cdp, await cdp.eval('snap(25)'), 80, 45), mix(0), 'after it');
      const logs = mine(await cdp.eval('__logs')).filter((l: string) => l.includes('is on screen from'));
      expect(logs).toHaveLength(1);
    });
  });

  it('a matte that has a parent (a moving null layer) is drawn where the null carries it', async () => {
    await withPage(async (cdp) => {
      const comp = { sequences: [backdrop,
        { type: 'null', name: 'rig', initial: { x: 40, y: 0 } },
        { type: 'shape', shape: 'circle', name: 'm', parent: 'rig', radius: 20, initial: { x: 40, y: 45, fillColor: '#ffffff' } },
        layer({ mask: 'm' })] };
      const url = await frame(cdp, comp);
      near(await at(cdp, url, 80, 45), mix(1), 'the matte is at the null\'s x (40) + its own x (40) = 80');
      near(await at(cdp, url, 40, 45), mix(0), 'not where its own x alone would put it');
    });
  });

  it('with a blend mode the blend is inside the matte and the backdrop is outside', async () => {
    await withPage(async (cdp) => {
      const url = await frame(cdp, { sequences: [backdrop, disc(), layer({ mask: 'm', blendMode: 'multiply' })] });
      const back = hexToRgb(BACK), src = hexToRgb(LAYER);
      near(await at(cdp, url, 80, 45), back.map((b, k) => b * src[k]! * 255), 'multiply inside');
      near(await at(cdp, url, 10, 10), back.map(b => b * 255), 'outside');
      void blendPixel;
    });
  });

  for (const [mode, alpha] of [['multiply', 1], ['screen', 1], ['add', 1], ['overlay', 1], ['soft-light', 1], ['hue', 1], ['overlay', 0.5], ['luminosity', 1]] as const) {
    it(`a matted layer with blendMode ${mode}${alpha < 1 ? ' at alpha ' + alpha : ''}: the blend inside the matte, the backdrop outside`, async () => {
      await withPage(async (cdp) => {
        const url = await frame(cdp, { sequences: [backdrop, disc(), layer({ mask: 'm', blendMode: mode, initial: { x: 0, y: 0, fillColor: LAYER, alpha } })] });
        const back = hexToRgb(BACK), src = hexToRgb(LAYER);
        const inside = mode === 'multiply' ? back.map((b, k) => b * src[k]! * alpha + b * (1 - alpha)).map(v => v * 255)
          : mode === 'screen' ? back.map((b, k) => (b + src[k]! - b * src[k]!) * alpha + b * (1 - alpha)).map(v => v * 255)
          : mode === 'add' ? back.map((b, k) => Math.min(1, b + src[k]! * alpha)).map(v => v * 255)
          : blendPixel(mode, back, 1, src, alpha).slice(0, 3);
        near(await at(cdp, url, 80, 45), inside, `${mode}: inside the matte`);
        near(await at(cdp, url, 10, 10), back.map(v => v * 255), `${mode}: outside the matte`);
      });
    });
  }

  it('the same matte with a luma channel and a blend: brightness 0.5 half-blends', async () => {
    await withPage(async (cdp) => {
      const url = await frame(cdp, { sequences: [backdrop, rect('m', { initial: { x: 0, y: 0, fillColor: '#808080' } }), layer({ mask: [{ layer: 'm', channel: 'luma' }], blendMode: 'multiply' })] });
      const back = hexToRgb(BACK), src = hexToRgb(LAYER), m = 128 / 255;
      near(await at(cdp, url, 80, 45), back.map((b, k) => (b * (1 - m) + b * src[k]! * m) * 255), 'luma 0.5 with multiply');
    });
  });

  it('a matted layer that has its own filter (an identity colour matrix) is cut by the matte after it', async () => {
    await withPage(async (cdp) => {
      const url = await frame(cdp, { sequences: [backdrop, disc(), layer({ mask: 'm', filters: [{ type: 'colorMatrix', matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] }] })] });
      near(await at(cdp, url, 80, 45), mix(1), 'inside');
      near(await at(cdp, url, 10, 10), mix(0), 'outside');
    });
  });

  it('a matte that is a text layer, an image and a video: the matted layer shows through the letters / the disc', async () => {
    await withPage(async (cdp) => {
      const discUrl: string = await cdp.eval(`(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(32, 32, 28, 0, 7); g.fill(); return c.toDataURL('image/png'); })()`);
      const text = { type: 'text', name: 'm', text: 'I', style: { fontSize: 90, fontWeight: '900', fill: '#ffffff', fontFamily: 'sans-serif' }, initial: { x: 80, y: 45, anchorX: 0.5, anchorY: 0.5 } };
      let url = await frame(cdp, { sequences: [backdrop, text, layer({ mask: 'm' })] });
      near(await at(cdp, url, 80, 45), mix(1), 'text matte: in the letter');
      near(await at(cdp, url, 10, 10), mix(0), 'text matte: outside');
      url = await frame(cdp, { sequences: [backdrop, { type: 'image', name: 'm', asset: 'disc', initial: { x: 80, y: 45, anchorX: 0.5, anchorY: 0.5 } }, layer({ mask: 'm' })] }, 0, { assets: [{ name: 'disc', src: discUrl }] });
      near(await at(cdp, url, 80, 45), mix(1), 'image matte: in the disc');
      near(await at(cdp, url, 10, 10), mix(0), 'image matte: outside');
    });
  });

  it('every seek order gives the same pictures for a matte that moves, a blend, a filter and a text matte together', async () => {
    await withPage(async (cdp) => {
      const move = { keyframes: [{ at: 0, to: { x: 130 }, duration: 1, ease: 'none' }] };
      const comp = { sequences: [backdrop,
        disc('m', '#ffffff', { initial: { x: 30, y: 45, fillColor: '#ffffff' }, ...move }),
        layer({ mask: 'm', blendMode: 'overlay' }),
        { type: 'text', name: 't', text: 'I', style: { fontSize: 60, fill: '#ffffff' }, initial: { x: 80, y: 45, anchorX: 0.5, anchorY: 0.5 } },
        rect('L2', { mask: 't', initial: { x: 0, y: 0, fillColor: '#ff3366' } })] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 1, composition: comp })})`);
      const o = await cdp.eval('orders([0, 3, 6, 9, 12, 20, 29])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  const A = '#c03030', B = '#3050c0';
  const scene = (name: string, fill: string) => ({ type: 'composition', name, width: 160, height: 90, duration: 2, sequences: [rect(name + '-fill', { initial: { x: 0, y: 0, fillColor: fill } })] });
  const rgb = (hex: string) => hexToRgb(hex).map(v => v * 255);
  const isB = (p: number[]) => Math.abs(p[2]! - 192) < Math.abs(p[2]! - 48);

  it('a luma wipe (linear): at the start only A, midway the left is B and the right is A, at the end only B; the same on every seek order', async () => {
    await withPage(async (cdp) => {
      const comp = { sequences: [scene('a', A), scene('b', B)], transitions: [{ kind: 'luma', from: 'a', to: 'b', at: 0.5, duration: 1, map: 'linear', softness: 0.1 }] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: comp })})`);
      const url = async (f: number) => cdp.eval(`snap(${f})`) as Promise<string>;
      near(await at(cdp, await url(0), 10, 45), rgb(A), 'start, left');
      near(await at(cdp, await url(0), 150, 45), rgb(A), 'start, right');
      const mid = await url(30);                                     // 1.0 s: progress 0.5 (ease none)
      near(await at(cdp, mid, 10, 45), rgb(B), 'midway: the dark (left) side has changed');
      near(await at(cdp, mid, 150, 45), rgb(A), 'midway: the light (right) side has not');
      near(await at(cdp, await url(59), 10, 45), rgb(B), 'end, left');
      near(await at(cdp, await url(59), 150, 45), rgb(B), 'end, right');
      const o = await cdp.eval('orders([0, 10, 20, 30, 40, 50, 59])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('a luma wipe with flip: the light side changes first', async () => {
    await withPage(async (cdp) => {
      const comp = { sequences: [scene('a', A), scene('b', B)], transitions: [{ kind: 'luma', from: 'a', to: 'b', at: 0.5, duration: 1, map: 'linear', softness: 0.1, flip: true }] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: comp })})`);
      const mid: string = await cdp.eval('snap(30)');
      near(await at(cdp, mid, 10, 45), rgb(A), 'flipped, midway: the left has not changed');
      near(await at(cdp, mid, 150, 45), rgb(B), 'flipped, midway: the right has');
    });
  });

  it('a luma wipe with a built-in radial map starts at the middle and the circle grows to the corners (a circle on screen, not an ellipse)', async () => {
    await withPage(async (cdp) => {
      const comp = { sequences: [scene('a', A), scene('b', B)], transitions: [{ kind: 'luma', from: 'a', to: 'b', at: 0.5, duration: 1, map: 'radial', softness: 0.05 }] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: comp })})`);
      const url: string = await cdp.eval('snap(30)');                // progress 0.5
      const lumaAt = (x: number, y: number) => builtInLuma('radial', x / 160, y / 90, 160 / 90);
      let inside = 0, outside = 0;
      for (let y = 5; y < 90; y += 10) for (let x = 5; x < 160; x += 10) {
        const l = lumaAt(x, y);
        if (l < 0.4) { inside++; expect(isB(await at(cdp, url, x, y)), `inside (${x},${y}) luma ${l.toFixed(2)}`).toBe(true); }
        if (l > 0.6) { outside++; expect(isB(await at(cdp, url, x, y)), `outside (${x},${y}) luma ${l.toFixed(2)}`).toBe(false); }
      }
      expect(inside).toBeGreaterThan(10);
      expect(outside).toBeGreaterThan(10);
    });
  });

  it('a luma wipe with a grayscale image as the map: dark parts change first (here a map that is dark on the right)', async () => {
    await withPage(async (cdp) => {
      const mapUrl: string = await cdp.eval(`(() => { const c = document.createElement('canvas'); c.width = 160; c.height = 90; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 160, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#000'); g.fillStyle = gr; g.fillRect(0, 0, 160, 90); return c.toDataURL('image/png'); })()`);
      const comp = { sequences: [scene('a', A), scene('b', B)], transitions: [{ kind: 'luma', from: 'a', to: 'b', at: 0.5, duration: 1, map: 'rightfirst', softness: 0.1 }] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: comp, assets: [{ name: 'rightfirst', src: mapUrl }] })})`);
      const mid: string = await cdp.eval('snap(30)');
      near(await at(cdp, mid, 150, 45), rgb(B), 'the dark (right) side has changed');
      near(await at(cdp, mid, 10, 45), rgb(A), 'the light (left) side has not');
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  for (const kind of ['wipe', 'iris', 'dissolve', 'luma']) {
    it(`a ${kind} transition compiles on this backend (no shader error) and ends on B, starts on A`, async () => {
      await withPage(async (cdp) => {
        const comp = { sequences: [scene('a', A), scene('b', B)], transitions: [{ kind, from: 'a', to: 'b', at: 0.5, duration: 1 }] };
        await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: comp })})`);
        near(await at(cdp, await cdp.eval('snap(0)'), 80, 45), rgb(A), 'start');
        near(await at(cdp, await cdp.eval('snap(59)'), 80, 45), rgb(B), 'end');
        const logs: string[] = await cdp.eval('__logs');
        expect(logs.filter(l => /shader|Precision/i.test(l)), JSON.stringify(logs)).toEqual([]);
      });
    });
  }

  it('a layer with a named matte inside a transition keeps its matte (the transition wraps the layer; the matte is found)', async () => {
    await withPage(async (cdp) => {
      const comp = { sequences: [
        rect('a', { initial: { x: 0, y: 0, fillColor: A }, duration: 2 }),
        disc('m'),
        rect('b', { initial: { x: 0, y: 0, fillColor: B }, mask: 'm', duration: 2 }),
      ], transitions: [{ kind: 'dissolve', from: 'a', to: 'b', at: 0.5, duration: 1 }] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: comp })})`);
      const url: string = await cdp.eval('snap(59)');                // after the transition: only B, cut by the disc
      near(await at(cdp, url, 80, 45), rgb(B), 'inside the matte, after the transition');
      near(await at(cdp, url, 10, 10), [0, 0, 0], 'outside the matte: A is gone, the layer is cut, the background shows');
      expect(mine(await cdp.eval('__logs')).filter((l: string) => l.includes('no layer with that name'))).toEqual([]);
    });
  });

  it('a composition with no mask does not touch the matte machinery: the same pixels, no warning', async () => {
    await withPage(async (cdp) => {
      const url = await frame(cdp, { sequences: [backdrop, layer({ initial: { x: 40, y: 20, fillColor: LAYER }, width: 40, height: 30 })] });
      near(await at(cdp, url, 5, 5), hexToRgb(BACK).map(v => v * 255), 'backdrop');
      near(await at(cdp, url, 50, 30), hexToRgb(LAYER).map(v => v * 255), 'layer');
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });
});
