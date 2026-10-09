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

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function open<T>(fn: (cdp: any) => Promise<T>, query = ''): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'blend-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/blend-modes.html${query}` });
    for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const MODES = ['overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn', 'darken', 'lighten', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity', 'linear-burn'];
// three backdrops (a dark, a mid and a bright colour with different hues) and three sources: a 3 x 3 grid of cells, one per pair
const BACK = ['#2a3f6b', '#b0703a', '#e8e0c8'];
const SRC = ['#ff8a3d', '#3dd6c8', '#7a2fd0'];
const TOLERANCE = 2;                                       // 8-bit channels; the library's own measure was 1, and a second step is for the rounding of an alpha 0.5 cell
const IDENTITY = { type: 'colorMatrix', matrix: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0] };   // changes no colour
const mine = (logs: string[]) => logs.filter(l => l.includes('pixi-effects:') && !l.includes('WebGPU'));

/** A 160 x 90 scene: three bands (the backdrops) and over them three squares (the sources), each blended with `mode` at alpha `alpha`. */
const scene = (mode: string, alpha: number, extra: Record<string, unknown> = {}) => ({ sequences: [
  ...BACK.map((c, i) => ({ type: 'shape', shape: 'rect', name: `back${i}`, width: 160, height: 30, anchorX: 0, anchorY: 0, initial: { x: 0, y: i * 30, fillColor: c } })),
  ...BACK.flatMap((_, i) => SRC.map((c, j) => ({ type: 'shape', shape: 'rect', name: `src${i}${j}`, width: 20, height: 20, anchorX: 0, anchorY: 0, blendMode: mode,
    initial: { x: 10 + j * 50, y: i * 30 + 5, fillColor: c, alpha }, ...extra }))),
] });

/** Compare every cell of the 3 x 3 grid in the picture `url` with the reference; returns the worst channel difference. */
async function worstOfGrid(cdp: any, url: string, mode: string, alpha: number, label: string): Promise<number> {
  let worst = 0;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const got: number[] = await cdp.eval(`px(${JSON.stringify(url)}, ${20 + j * 50}, ${i * 30 + 15})`);
    const want = blendPixel(mode, hexToRgb(BACK[i]!), 1, hexToRgb(SRC[j]!), alpha);
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(got[k]! - want[k]!);
      worst = Math.max(worst, d);
      expect(d, `${label}: ${mode} a=${alpha} backdrop ${i} source ${j} channel ${k}: got ${got} want ${want.map(Math.round)}`).toBeLessThanOrEqual(TOLERANCE);
    }
  }
  return worst;
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS).each([['the default backend', ''], ['WebGL', '?backend=webgl']])('blend modes, on a real browser (%s)', (_label, query) => {
  const withPage = <T,>(fn: (cdp: any) => Promise<T>) => open(fn, query);

  for (const alpha of [1, 0.5]) it(`all 14 advanced modes at alpha ${alpha} match the W3C reference within ${TOLERANCE}/255`, async () => {
    await withPage(async (cdp) => {
      let worst = 0;
      for (const mode of MODES) {
        const info = await cdp.eval(`mk(${JSON.stringify({ composition: scene(mode, alpha) })})`);
        if (query) expect(info.backend).toMatch(/webgl/i);              // the forced run really is on WebGL
        const url = await cdp.eval('snap(0)');
        worst = Math.max(worst, await worstOfGrid(cdp, url, mode, alpha, `backend ${info.backend}`));
      }
      console.log(`[blend] ${_label}, alpha ${alpha}: worst channel difference ${worst.toFixed(2)} of 255`);
    });
  });

  it('a movie that uses no advanced mode leaves the back buffer alone; one that does turns it on (WebGL)', async () => {
    await withPage(async (cdp) => {
      const basic = await cdp.eval(`mk(${JSON.stringify({ composition: scene('multiply', 1) })})`);
      expect(basic.backBuffer === false || basic.backBuffer === null).toBe(true);
      const adv = await cdp.eval(`mk(${JSON.stringify({ composition: scene('overlay', 1) })})`);
      if (adv.backBuffer !== null) expect(adv.backBuffer).toBe(true);
    });
  });

  it('the basic modes are unchanged: multiply, screen and add give the plain formulas', async () => {
    await withPage(async (cdp) => {
      const f: Record<string, (b: number, s: number) => number> = { multiply: (b, s) => b * s, screen: (b, s) => b + s - b * s, add: (b, s) => Math.min(1, b + s) };
      for (const mode of Object.keys(f)) {
        await cdp.eval(`mk(${JSON.stringify({ composition: scene(mode, 1) })})`);
        const url = await cdp.eval('snap(0)');
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
          const got: number[] = await cdp.eval(`px(${JSON.stringify(url)}, ${20 + j * 50}, ${i * 30 + 15})`);
          const b = hexToRgb(BACK[i]!), s = hexToRgb(SRC[j]!);
          for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - f[mode]!(b[k]!, s[k]!) * 255), `${mode} ${i}${j} ${k}: got ${got}`).toBeLessThanOrEqual(TOLERANCE);
        }
      }
    });
  });

  it('a layer with a filter of its own blends too (the blend is the last filter of its chain)', async () => {
    await withPage(async (cdp) => {
      for (const mode of ['overlay', 'hue']) {
        await cdp.eval(`mk(${JSON.stringify({ composition: scene(mode, 1, { filters: [IDENTITY] }) })})`);
        const url = await cdp.eval('snap(0)');
        await worstOfGrid(cdp, url, mode, 1, 'with a filter');
      }
    });
  });

  it('a threeD layer blends too (z 0 and the default camera: the same place and size)', async () => {
    await withPage(async (cdp) => {
      for (const mode of ['soft-light', 'color']) {
        await cdp.eval(`mk(${JSON.stringify({ composition: scene(mode, 1, { threeD: true }) })})`);
        const url = await cdp.eval('snap(0)');
        await worstOfGrid(cdp, url, mode, 1, 'threeD');
      }
    });
  });

  it('over nothing (a threeD composition draws into a transparent texture first) an advanced blend is the source colour, as W3C says for a backdrop of alpha 0', async () => {
    await withPage(async (cdp) => {
      const comp = { sequences: [
        { type: 'shape', shape: 'rect', width: 160, height: 90, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#b0703a' } },
        { type: 'composition', name: 'card', width: 160, height: 90, duration: 1, threeD: true, initial: { x: 0, y: 0 }, sequences: [
          { type: 'shape', shape: 'rect', width: 40, height: 40, anchorX: 0, anchorY: 0, blendMode: 'overlay', initial: { x: 60, y: 25, fillColor: '#ff8a3d' } },
        ] },
      ] };
      await cdp.eval(`mk(${JSON.stringify({ composition: comp })})`);
      const url = await cdp.eval('snap(0)');
      const got: number[] = await cdp.eval(`px(${JSON.stringify(url)}, 80, 45)`);
      const want = hexToRgb('#ff8a3d').map(v => v * 255);
      for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - want[k]!), `channel ${k}: got ${got}`).toBeLessThanOrEqual(TOLERANCE);
    });
  });

  it('with the depth-of-field blur on a threeD layer the blend still lands on the backdrop (blur, then blend), and the filters are gone when the layer is sharp', async () => {
    await withPage(async (cdp) => {
      const comp = (focus: string) => ({ sequences: [
        { type: 'camera', initial: { focus, aperture: 40 } },
        { type: 'shape', shape: 'rect', width: 160, height: 90, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#b0703a' } },
        { type: 'shape', shape: 'rect', name: 'sharp', width: 4, height: 4, threeD: true, initial: { x: 4, y: 4, z: 0, fillColor: '#ffffff' } },
        { type: 'shape', shape: 'rect', name: 'lit', width: 100, height: 60, threeD: true, blendMode: 'soft-light', initial: { x: 80, y: 45, z: -100, fillColor: '#3dd6c8' } },
      ] });
      const centre = async (focus: string) => {
        await cdp.eval(`mk(${JSON.stringify({ composition: comp(focus) })})`);
        const url = await cdp.eval('snap(0)');
        return cdp.eval(`px(${JSON.stringify(url)}, 80, 45)`) as Promise<number[]>;
      };
      const want = blendPixel('soft-light', hexToRgb('#b0703a'), 1, hexToRgb('#3dd6c8'), 1);
      for (const focus of ['sharp', 'lit']) {                              // blurred (focus elsewhere) and sharp (focus on it): the centre is the same blend
        const got = await centre(focus);
        for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - want[k]!), `focus ${focus} channel ${k}: got ${got} want ${want.map(Math.round)}`).toBeLessThanOrEqual(TOLERANCE);
      }
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('every seek order gives the same pictures (an advanced blend on a moving layer with a filter, and on a threeD layer)', async () => {
    await withPage(async (cdp) => {
      const move = [{ at: 0, to: { x: 120 }, duration: 1, ease: 'power1.inOut' }];
      const comp = { sequences: [
        { type: 'shape', shape: 'rect', width: 160, height: 90, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#2a3f6b' } },
        { type: 'shape', shape: 'circle', radius: 20, blendMode: 'overlay', filters: [IDENTITY], initial: { x: 30, y: 30, fillColor: '#ff8a3d' }, keyframes: move },
        { type: 'shape', shape: 'circle', radius: 20, blendMode: 'hue', threeD: true, initial: { x: 30, y: 60, fillColor: '#3dd6c8' }, keyframes: move },
      ] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 1, composition: comp })})`);
      const o = await cdp.eval('orders([0, 3, 6, 9, 12, 20, 29])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });
});
