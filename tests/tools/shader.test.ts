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
const mk = async (cdp: any, sequences: unknown[], extra: Record<string, unknown> = {}) => cdp.eval(`mk(${JSON.stringify({ composition: { sequences }, ...extra })})`);
const GRAD = 'void mainImage(out vec4 c, in vec2 f) { vec2 uv = f / iResolution.xy; c = vec4(uv.x, uv.y, 0.5 + 0.5 * sin(iTime * 3.0), 1.0); }';
const near = (got: number[], want: number[], tol: number, label: string) => { for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - want[k]!), `${label} channel ${k}: got ${got} want ${want.map(v => Math.round(v))}`).toBeLessThanOrEqual(tol); };

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS).each([['the default backend', ''], ['WebGL', '?backend=webgl']])('shader layer, on a real browser (%s)', (_label, query) => {
  const withPage = <T,>(fn: (cdp: any) => Promise<T>) => open(fn, query);

  it('a gradient of uv and iTime: the pixels are what the formula says at three moments, and every seek order gives the same pictures', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, [{ type: 'shader', fragment: GRAD }], { duration: 2 });
      for (const [f, t] of [[0, 0], [15, 0.5], [45, 1.5]] as Array<[number, number]>) {
        const u = await cdp.eval(`snap(${f})`);
        near(await rgb(cdp, u, 80, 135), [0.25 * 255, (1 - 135.5 / 180) * 255, (0.5 + 0.5 * Math.sin(t * 3)) * 255], 3, `frame ${f}`);
      }
      const o = await cdp.eval('orders([0, 7, 15, 22, 30, 38, 45, 52, 59])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('a compile error warns with the author\'s line number, and the layer is a checkerboard instead of a blank', async () => {
    await withPage(async (cdp) => {
      const bad = 'void mainImage(out vec4 c, in vec2 f) {\n  c = vec4(undefinedThing, 0.0, 0.0, 1.0);\n}';
      await mk(cdp, [{ type: 'shader', fragment: bad }]);
      const logs = mine(await cdp.eval('__logs'));
      expect(logs.some(l => /did not compile/.test(l) && /line 2:/.test(l)), JSON.stringify(logs)).toBe(true);
      const u = await cdp.eval('snap(0)');
      const a = await rgb(cdp, u, 10, 10), b = await rgb(cdp, u, 40, 10);
      expect(a.join()).not.toBe(b.join());                                    // two colours: a checkerboard
      near(a, [0x22, 0, 0x22], 2, 'dark square'); near(b, [255, 0, 255], 2, 'magenta square');
    });
  });

  it('layers of different sizes share one context and keep their own pictures; a transparent shader blends over what is behind it', async () => {
    await withPage(async (cdp) => {
      const red = 'void mainImage(out vec4 c, in vec2 f) { c = vec4(1.0, 0.0, 0.0, 1.0); }';
      const blueHalf = 'void mainImage(out vec4 c, in vec2 f) { c = vec4(0.0, 0.0, 1.0, 0.5); }';
      await mk(cdp, [
        { type: 'shape', shape: 'rect', width: 320, height: 180, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#00ff00' } },
        { type: 'shader', fragment: red, width: 100, height: 100, initial: { x: 10, y: 10 } },
        { type: 'shader', fragment: blueHalf, transparent: true, width: 120, height: 60, initial: { x: 150, y: 100 } },
      ]);
      const u = await cdp.eval('snap(0)');
      near(await rgb(cdp, u, 50, 50), [255, 0, 0], 2, 'the red layer');
      near(await rgb(cdp, u, 200, 120), [0, 128, 128], 3, 'half blue over green');
      near(await rgb(cdp, u, 300, 20), [0, 255, 0], 2, 'the backdrop');
    });
  });

  it('a movie with no shader layer makes no context of its own for it, and twenty shader layers make exactly one', async () => {
    await withPage(async (cdp) => {
      const plain = [{ type: 'shape', shape: 'rect', width: 10, height: 10 }];
      const g0 = await cdp.eval('gl2()');
      await mk(cdp, plain); const g1 = await cdp.eval('gl2()');
      await mk(cdp, plain); const g2 = await cdp.eval('gl2()');
      const twenty = Array.from({ length: 20 }, (_, i) => ({ type: 'shader', fragment: GRAD, width: 40, height: 20, initial: { x: (i % 5) * 60, y: Math.floor(i / 5) * 40 } }));
      await mk(cdp, twenty); const g3 = await cdp.eval('gl2()');
      const perMovie = g2 - g1;                                              // what a movie costs by itself (Pixi's own context on the WebGL backend)
      expect(g3 - g2, `20 shader layers: ${g3 - g2} contexts, a plain movie ${perMovie}`).toBe(perMovie + 1);
      void g0;
    });
  });

  it('building the movie again and again leaves the shader working and does not pile up contexts', async () => {
    await withPage(async (cdp) => {
      let before = 0, after = 0;
      for (let i = 0; i < 4; i++) {
        before = await cdp.eval('gl2()');
        await mk(cdp, [{ type: 'shader', fragment: GRAD }]);
        after = await cdp.eval('gl2()');
        expect(after - before, `build ${i}`).toBeLessThanOrEqual(2);       // Pixi's own (WebGL backend) + the shared one
      }
      const u = await cdp.eval('snap(0)');
      near(await rgb(cdp, u, 80, 135), [0.25 * 255, (1 - 135.5 / 180) * 255, 128], 3, 'after four rebuilds');
    });
  });

  // ── together with the rest (Task 3) ───────────────────────────────────────────────────────────────────────────────────────────────
  const solid = (r: number, g: number, b: number, extra: Record<string, unknown> = {}) => ({ type: 'shader', fragment: `void mainImage(out vec4 c, in vec2 f) { c = vec4(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}, 1.0); }`, ...extra });
  const backdrop = (color: string) => ({ type: 'shape', shape: 'rect', name: 'backdrop', width: 320, height: 180, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: color } });

  it('uniforms move with keyframes: a number, a component of a vector, a component of a colour; every seek order agrees', async () => {
    await withPage(async (cdp) => {
      const frag = 'void mainImage(out vec4 c, in vec2 f) { c = vec4(speed, pos.y, tint.z, 1.0); }';
      await mk(cdp, [{ type: 'shader', fragment: frag, uniforms: { speed: 0, pos: [0, 0], tint: '#ff0000' },
        keyframes: [{ at: 0, to: { 'uniforms.speed': 1, 'uniforms.pos.1': 1, 'uniforms.tint.2': 1 }, duration: 2, ease: 'none' }] }], { duration: 2 });
      near(await rgb(cdp, await cdp.eval('snap(0)'), 100, 100), [0, 0, 0], 2, 'start');
      near(await rgb(cdp, await cdp.eval('snap(30)'), 100, 100), [127.5, 127.5, 127.5], 3, 'halfway');
      near(await rgb(cdp, await cdp.eval('snap(59)'), 100, 100), [250, 250, 250], 8, 'end');
      const o = await cdp.eval('orders([0, 10, 20, 30, 40, 50, 59])');
      expect(o.bwdMax).toBe(0); expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('a keyframe on a uniform that does not exist, or a whole vector, is said once with what to write', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, [{ type: 'shader', fragment: 'void mainImage(out vec4 c, in vec2 f) { c = vec4(speed, pos.y, 0.0, 1.0); }', uniforms: { speed: 0, pos: [0, 0] },
        keyframes: [{ at: 0, to: { 'uniforms.sped': 1, 'uniforms.pos': 1 }, duration: 1 }] }]);
      const logs = mine(await cdp.eval('__logs')).join('\n');
      expect(logs).toContain('names no uniform "sped"'); expect(logs).toContain('did you mean "speed"');
      expect(logs).toContain("'uniforms.pos.0'");
    });
  });

  it('iTime is the layer\'s own clock: from its start (at), and the clock of a time-remapped composition', async () => {
    await withPage(async (cdp) => {
      const t = 'void mainImage(out vec4 c, in vec2 f) { c = vec4(iTime / 4.0, 0.0, 0.0, 1.0); }';
      await mk(cdp, [{ type: 'shader', fragment: t, at: 1, duration: 1 }], { duration: 3 });
      near(await rgb(cdp, await cdp.eval('snap(45)'), 100, 100), [0.5 / 4 * 255, 0, 0], 3, 'at: 1, drawn at 1.5 s');
      await mk(cdp, [{ type: 'composition', name: 'inner', width: 320, height: 180, duration: 2, speed: 2, initial: { x: 0, y: 0 }, sequences: [{ type: 'shader', fragment: t }] }], { duration: 2 });
      near(await rgb(cdp, await cdp.eval('snap(30)'), 100, 100), [2 / 4 * 255, 0, 0], 3, 'a composition at speed 2: 1 s of the movie is 2 s of its clock');
      const o = await cdp.eval('orders([0, 10, 20, 30, 40, 50, 59])');
      expect(o.bwdMax).toBe(0); expect(o.jmpMax).toBe(0);
    });
  });

  it('a mask cuts it, a matte can be made of it (by its brightness), a filter and a blend mode work on it', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, [backdrop('#00ff00'), solid(1, 0, 0, { mask: { type: 'shape', shape: 'circle', radius: 40, initial: { x: 160, y: 90, fillColor: '#ffffff' } } })]);
      let u = await cdp.eval('snap(0)');
      near(await rgb(cdp, u, 160, 90), [255, 0, 0], 2, 'inside the mask'); near(await rgb(cdp, u, 10, 10), [0, 255, 0], 2, 'outside the mask');
      // a shader as the matte of an ordinary layer: brightness uv.x
      await mk(cdp, [backdrop('#00ff00'), { type: 'shader', name: 'm', fragment: 'void mainImage(out vec4 c, in vec2 f) { c = vec4(vec3(f.x / iResolution.x), 1.0); }' },
        { type: 'shape', shape: 'rect', name: 'L', width: 320, height: 180, anchorX: 0, anchorY: 0, mask: { layer: 'm', channel: 'luma' }, initial: { x: 0, y: 0, fillColor: '#0000ff' } }]);
      u = await cdp.eval('snap(0)');
      near(await rgb(cdp, u, 160, 90), [0, 255 * (1 - 160.5 / 320), 255 * 160.5 / 320], 4, 'a luma matte from a shader');
      const negative = [-1, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0];
      await mk(cdp, [solid(1, 0, 0, { filters: [{ type: 'colorMatrix', matrix: negative }] })]);
      near(await rgb(cdp, await cdp.eval('snap(0)'), 100, 100), [0, 255, 255], 3, 'a colour matrix on a shader');
      await mk(cdp, [backdrop('#808080'), solid(1, 0.5, 0, { blendMode: 'multiply' })]);
      near(await rgb(cdp, await cdp.eval('snap(0)'), 100, 100), [128, 64, 0], 3, 'multiply');
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('a shader layer as an inline mask cuts the layer by its alpha and is not drawn on top of it', async () => {
    await withPage(async (cdp) => {
      const disc = 'void mainImage(out vec4 c, in vec2 f) { c = vec4(1.0, 1.0, 1.0, length(f - vec2(160.0, 90.0)) < 40.0 ? 1.0 : 0.0); }';
      await mk(cdp, [backdrop('#00ff00'), { type: 'shape', shape: 'rect', name: 'L', width: 320, height: 180, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#ff0000' },
        mask: { type: 'shader', transparent: true, fragment: disc } }]);
      const u = await cdp.eval('snap(0)');
      near(await rgb(cdp, u, 160, 90), [255, 0, 0], 2, 'inside the shader mask: the layer');
      near(await rgb(cdp, u, 10, 10), [0, 255, 0], 2, 'outside: the backdrop (the mask picture itself is not painted over it)');
      near(await rgb(cdp, u, 160, 40), [0, 255, 0], 2, 'above the disc: the backdrop, not the white of the shader');
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('a shader layer can be threeD (flat at z = 0, tilted with rotationY) and receives the lights of its composition', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, [backdrop('#000000'), solid(1, 0, 0, { threeD: true, initial: { x: 0, y: 0, z: 0 } })]);
      near(await rgb(cdp, await cdp.eval('snap(0)'), 160, 90), [255, 0, 0], 2, 'threeD at z = 0');
      await mk(cdp, [backdrop('#000000'), solid(1, 0, 0, { threeD: true, width: 160, height: 90, initial: { x: 160, y: 90, rotationY: 50, pivotX: 80, pivotY: 45 } })]);
      near(await rgb(cdp, await cdp.eval('snap(0)'), 160, 90), [255, 0, 0], 2, 'tilted: the middle is still red');
      await mk(cdp, [{ type: 'light', kind: 'ambient', initial: { intensity: 0.5 } }, solid(1, 0, 0, { threeD: true })]);
      near(await rgb(cdp, await cdp.eval('snap(0)'), 100, 100), [127.5, 0, 0], 3, 'lit by an ambient light of 0.5');
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('resolution 0.5 draws at half size and scales up to the same picture', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, [{ type: 'shader', fragment: GRAD, resolution: 0.5 }]);
      near(await rgb(cdp, await cdp.eval('snap(0)'), 80, 135), [0.25 * 255, (1 - 135.5 / 180) * 255, 128], 5, 'half resolution');
    });
  });

  it('when the browser takes the shared context away the next frame makes a new one and draws the right picture', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, [{ type: 'shader', fragment: GRAD }]);
      const lost: boolean = await cdp.eval('loseShared()');
      if (!lost) return;                                                       // no WEBGL_lose_context on this machine
      await check.sleep(150);                                                  // the 'lost' event arrives as a task
      near(await rgb(cdp, await cdp.eval('snap(0)'), 80, 135), [0.25 * 255, (1 - 135.5 / 180) * 255, 128], 3, 'after the context was lost');
      near(await rgb(cdp, await cdp.eval('snap(15)'), 80, 135), [0.25 * 255, (1 - 135.5 / 180) * 255, 255], 3, 'and later frames');
    });
  });

  it('the movie exports to an mp4 with a shader layer in it', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, [{ type: 'shader', fragment: GRAD }], { duration: 1 });
      const size: number = await cdp.eval('renderBlob()');
      expect(size).toBeGreaterThan(2000);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  }, 120000);
});
