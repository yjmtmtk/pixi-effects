// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// the first test of a file starts a browser tab and loads the page; under the whole suite's load that can pass the 5 s default
vi.setConfig({ testTimeout: 60000 });
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  const dir = mkdtempSync(join(tmpdir(), 'dof-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/depth-of-field.html${query}` });
    for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

// Worked by hand, not by the library's own function: the 320 x 180 home camera has focal length = distance = 90 / tan(20°) = 247.3 px,
// the focus is on z = 0, aperture 40, so a layer at depth d blurs by 40 × |247.3 / d − 1| / 2:
//   back (z = -100, d = 347.3): 40 × 0.2879 / 2 = 5.76 px      near (z = 60, d = 187.3): 40 × 0.3203 / 2 = 6.41 px
const BACK_R = 5.76;
const NEAR_R = 6.41;
const mine = (logs: string[]) => logs.filter(l => l.includes('pixi-effects:') && !l.includes('WebGPU'));

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS).each([['the default backend', ''], ['WebGL', '?backend=webgl']])('depth of field, on a real browser (%s)', (_label, query) => {
  const withPage = <T,>(fn: (cdp: any) => Promise<T>) => open(fn, query);
  it('the focal layer stays sharp and the others blur by the size the model gives', async () => {
    await withPage(async (cdp) => {
      const backend = await cdp.eval(`mk(${JSON.stringify({ composition: await bars(cdp, { initial: { focus: 'front', aperture: 40 } }) })})`);
      const url = await cdp.eval('snap(0)');
      const e = async (x0: number, x1: number) => cdp.eval(`edge(${JSON.stringify(url)}, 90, ${x0}, ${x1})`);
      const near = await e(70, 95), front = await e(130, 150), back = await e(220, 245);       // the right edge of near (x ~ 81), the left edge of front (140), the right edge of back (231)
      if (query) expect(backend).toMatch(/webgl/i);                             // the forced run really is on WebGL
      console.log(`[dof] backend ${backend}: edge widths near ${near} (model radius ${NEAR_R}), front ${front}, back ${back} (model radius ${BACK_R})`);
      // a hard edge is ~2 px of antialiasing; a disc blur of radius r spreads it over about 1.6 r (the 10-90 % band of a ramp 2 r wide)
      expect(front, `backend ${backend}`).toBeLessThanOrEqual(3);
      expect(back).toBeGreaterThan(front + 1);
      expect(near).toBeGreaterThan(front + 1);
      expect(back).toBeGreaterThanOrEqual(Math.floor(1.0 * BACK_R));
      expect(back).toBeLessThanOrEqual(Math.ceil(2.4 * BACK_R) + 2);
      expect(near).toBeGreaterThanOrEqual(Math.floor(1.0 * NEAR_R));
      expect(near).toBeLessThanOrEqual(Math.ceil(2.4 * NEAR_R) + 2);
    });
  });

  it('no focus, or aperture 0, gives the very same picture as a movie without the feature', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk(${JSON.stringify({ composition: await bars(cdp, { initial: { fov: 40 } }) })})`);
      const plain = await cdp.eval('snap(0)');
      await cdp.eval(`mk(${JSON.stringify({ composition: await bars(cdp, { initial: { focus: 'front', aperture: 0 } }) })})`);
      const off = await cdp.eval('snap(0)');
      expect(await cdp.eval(`diff(${JSON.stringify(plain)}, ${JSON.stringify(off)})`)).toBe(0);
    });
  });

  it('a focus pull: the sharp layer changes, midway both are soft, and every seek order gives the same pictures', async () => {
    await withPage(async (cdp) => {
      const cam = { initial: { focus: 'near', aperture: 40 }, keyframes: [{ at: 0.5, to: { focus: 'back' }, duration: 1, ease: 'power2.inOut' }] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: await bars(cdp, cam) })})`);
      const edgeAt = async (f: number, x0: number, x1: number) => cdp.eval(`snap(${f}).then(u => edge(u, 90, ${x0}, ${x1}))`);
      expect(await edgeAt(0, 70, 95)).toBeLessThanOrEqual(3);                   // near is sharp at the start
      expect(await edgeAt(59, 220, 245)).toBeLessThanOrEqual(3);                // back is sharp at the end (frame 59 = 1.97 s)
      expect(await edgeAt(0, 220, 245)).toBeGreaterThan(3);
      expect(await edgeAt(30, 70, 95)).toBeGreaterThan(3);                      // at 1 s the focus is between: near is soft now ...
      expect(await edgeAt(30, 220, 245)).toBeGreaterThan(3);                    // ... and so is back
      const o = await cdp.eval('orders([0, 7, 15, 22, 30, 38, 45, 52, 59])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
    });
  });

  it('inspect reports the blur of each threeD layer', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk(${JSON.stringify({ composition: await bars(cdp, { initial: { focus: 'front', aperture: 40 } }) })})`);
      const rows = await cdp.eval('movie.inspect(0).then(r => r.layers.map(l => [l.name, l.depthBlur]))');
      const by = Object.fromEntries(rows);
      expect(by.front).toBe(0);
      expect(by.back).toBeCloseTo(BACK_R, 1);
      expect(by.near).toBeCloseTo(NEAR_R, 1);
    });
  });

  it('a spring and an expression move the focus like any other camera number', async () => {
    await withPage(async (cdp) => {
      const cam = { initial: { focus: 'GW/1000', aperture: 40 }, keyframes: [{ at: 0, to: { focus: -100 }, duration: 1, ease: 'spring(1, 170, 12)' }] };
      await cdp.eval(`mk(${JSON.stringify({ composition: await bars(cdp, cam) })})`);
      const o = await cdp.eval('orders([0, 10, 20, 29])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('a layer the camera passes (hideBehindCamera) and an extreme aperture do not break the picture', async () => {
    await withPage(async (cdp) => {
      const pass = { type: 'shape', shape: 'rect', name: 'pass', width: 40, height: 40, threeD: true, hideBehindCamera: true, initial: { x: 20, y: 20, z: 400, fillColor: '#ff0000' } };
      await cdp.eval(`mk(${JSON.stringify({ composition: await bars(cdp, { initial: { focus: 'front', aperture: 1000 } }, [pass]) })})`);
      const url = await cdp.eval('snap(0)');
      const row = await cdp.eval(`edge(${JSON.stringify(url)}, 90, 0, 320)`);
      expect(row).toBeLessThanOrEqual(3 * (2 * 32 + 2));                        // three bars, none wider than the cap allows
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('the movie exports (mp4) with the blur in it', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk(${JSON.stringify({ duration: 1, composition: await bars(cdp, { initial: { focus: 'front', aperture: 40 } }) })})`);
      const size = await cdp.eval('movie.render({ format: "mp4" }).then(b => b.size)');
      expect(size).toBeGreaterThan(1000);
    });
  }, 120000);

  it('draws the demo picture at four apertures (for the eye: written to the folder named by PE_DOF_OUT, if set)', async () => {
    if (!process.env.PE_DOF_OUT) return;
    await withPage(async (cdp) => {
      for (const a of [10, 30, 60, 100]) {
        const url: string = await cdp.eval(`demo(${a})`);
        writeFileSync(join(process.env.PE_DOF_OUT!, `demo-aperture-${a}.png`), Buffer.from(url.split(',')[1]!, 'base64'));
      }
    });
  });
});

/** `bars(camera, extra)` runs in the page; the test builds the same plain object in node to hand to `mk` as JSON. */
async function bars(_cdp: any, camera: Record<string, unknown> | null, extra: unknown[] = []): Promise<unknown> {
  const rect = (name: string, x: number, z: number) => ({ type: 'shape', shape: 'rect', name, width: 40, height: 80, threeD: true, initial: { x, y: 90, z, fillColor: '#ffffff' } });
  return { sequences: [...(camera ? [{ type: 'camera', ...camera }] : []), rect('near', 80, 60), rect('front', 160, 0), rect('back', 240, -100), ...extra] };
}
