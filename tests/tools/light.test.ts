// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// the first test of a file starts a browser tab and loads the page; under the whole suite's load that can pass the 5 s default
vi.setConfig({ testTimeout: 60000 });
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';
import { shadeReference, shadowReference, fogAmount, type LightState, type PlaneFrame } from '../../src/space/lighting';
import { blendPixel, hexToRgb } from '../support/blendReference';
import { cameraBasis, homeCamera, layerToWorld, projectPoint, DEG, type Vec3 } from '../../src/space/math';

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
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/light.html${query}` });
    for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const TOLERANCE = 2;                                       // 8-bit channels
const mine = (logs: string[]) => logs.filter(l => l.includes('pixi-effects:') && !l.includes('WebGPU'));

// ── the reference: worked from the light's numbers by shadeReference (Task 1, itself checked by hand), not by the library's shader ──
const W = 320, H = 180;
const CAM = homeCamera(W, H);
const BASIS = cameraBasis(CAM, W, H);
const GREY = 128 / 255;                                     // '#808080', the colour of the card the lights fall on

const L = (o: Partial<LightState> & { kind: LightState['kind'] }): LightState => ({
  x: 0, y: 0, z: 100, lookAtX: 160, lookAtY: 90, lookAtZ: 0, r: 1, g: 1, b: 1, intensity: 1,
  coneAngle: 90, coneFeather: 0.5, falloff: 'none', radius: 500, falloffDistance: 500, castsShadows: false, shadowDarkness: 1, shadowDiffusion: 0, ...o,
});
/** The layer for a reference light: only the numbers that matter for its kind (the build warns about the ones that do nothing). */
const lightSpec = (s: LightState, extra: Record<string, unknown> = {}) => {
  const initial: Record<string, number> = { intensity: s.intensity };
  if (s.kind !== 'ambient') Object.assign(initial, { x: s.x, y: s.y, z: s.z });
  if (s.kind === 'spot' || s.kind === 'parallel') Object.assign(initial, { lookAtX: s.lookAtX, lookAtY: s.lookAtY, lookAtZ: s.lookAtZ });
  if (s.kind === 'spot') Object.assign(initial, { coneAngle: s.coneAngle, coneFeather: s.coneFeather });
  if (s.falloff !== 'none' && s.kind !== 'ambient' && s.kind !== 'parallel') Object.assign(initial, { radius: s.radius, falloffDistance: s.falloffDistance });
  return { type: 'light', kind: s.kind, ...(s.falloff !== 'none' ? { falloff: s.falloff } : {}), ...extra, initial };
};
const ambient = (i: number) => L({ kind: 'ambient', intensity: i });

/** A grey card as big as the picture, facing the camera at z = 0. */
const card = (o: Record<string, unknown> = {}) => ({ type: 'shape', shape: 'rect', name: 'card', width: W, height: H, anchorX: 0, anchorY: 0, threeD: true, initial: { x: 0, y: 0, z: 0, fillColor: '#808080' }, ...o });
/** A grey card centred on (160, 90) and tilted: its plane for the reference. */
const tiltedCard = (rx: number, ry: number) => card({ name: 'tilt', width: 160, height: 90, anchorX: 0.5, anchorY: 0.5, initial: { x: 160, y: 90, z: 0, rotationX: rx, rotationY: ry, fillColor: '#808080' } });
const tiltedPlane = (rx: number, ry: number) => {
  const lt = { x: 160, y: 90, z: 0, rotationX: rx * DEG, rotationY: ry * DEG, rotationZ: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 };
  const o = layerToWorld(lt, 0, 0), a = layerToWorld(lt, 1, 0), b = layerToWorld(lt, 0, 1);
  const u = { x: a.x - o.x, y: a.y - o.y, z: a.z - o.z }, v = { x: b.x - o.x, y: b.y - o.y, z: b.z - o.z };
  const n = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
  return { o, n };
};
const FLAT = { o: { x: 0, y: 0, z: 0 }, n: { x: 0, y: 0, z: 1 } };

/** The world point a pixel shows on a plane: the camera's ray through the pixel's centre, intersected with the plane. */
function pointAt(x: number, y: number, plane: { o: Vec3; n: Vec3 }): Vec3 {
  const sx = (x + 0.5 - W / 2) / BASIS.focal, sy = (y + 0.5 - H / 2) / BASIS.focal;
  const d = { x: BASIS.fx + sx * BASIS.rx + sy * BASIS.dx, y: BASIS.fy + sx * BASIS.ry + sy * BASIS.dy, z: BASIS.fz + sx * BASIS.rz + sy * BASIS.dz };
  const t = ((plane.o.x - CAM.x) * plane.n.x + (plane.o.y - CAM.y) * plane.n.y + (plane.o.z - CAM.z) * plane.n.z) / (d.x * plane.n.x + d.y * plane.n.y + d.z * plane.n.z);
  return { x: CAM.x + t * d.x, y: CAM.y + t * d.y, z: CAM.z + t * d.z };
}
/** What the picture must show at a pixel of the grey card lit by `lights`: 0..255 per channel (the shading never goes past the card's own alpha). */
function expected(x: number, y: number, plane: { o: Vec3; n: Vec3 }, lights: LightState[]): number[] {
  const m = shadeReference(pointAt(x, y, plane), plane.n, { x: CAM.x, y: CAM.y, z: CAM.z }, lights);
  return m.map(k => Math.min(GREY * k, 1) * 255);
}
const rgb = async (cdp: any, url: string, x: number, y: number): Promise<number[]> => cdp.eval(`px(${JSON.stringify(url)}, ${x}, ${y})`);
const near = (got: number[], want: number[], label: string) => { for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - want[k]!), `${label} channel ${k}: got ${got} want ${want.map(v => Math.round(v * 10) / 10)}`).toBeLessThanOrEqual(TOLERANCE); };
const frame = async (cdp: any, sequences: unknown[], f = 0, extra: Record<string, unknown> = {}) => { await cdp.eval(`mk(${JSON.stringify({ composition: { sequences }, ...extra })})`); return cdp.eval(`snap(${f})`) as Promise<string>; };
const diff = async (cdp: any, a: string, b: string): Promise<number> => cdp.eval(`diff(${JSON.stringify(a)}, ${JSON.stringify(b)})`);
const POINTS: Array<[number, number]> = [[160, 90], [40, 30], [280, 150], [20, 160], [250, 20]];

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS).each([['the default backend', ''], ['WebGL', '?backend=webgl']])('light, on a real browser (%s)', (_label, query) => {
  const withPage = <T,>(fn: (cdp: any) => Promise<T>) => open(fn, query);

  it('a white ambient light at 1 is no light at all: the picture is the same as with no light layer, pixel for pixel', async () => {
    await withPage(async (cdp) => {
      const plain = await frame(cdp, [card()]);
      const lit = await frame(cdp, [lightSpec(ambient(1)), card()]);
      expect(await diff(cdp, plain, lit)).toBe(0);
    });
  });

  it('an ambient light scales the card by its colour × intensity', async () => {
    await withPage(async (cdp) => {
      const url = await frame(cdp, [lightSpec(ambient(0.4)), card()]);
      for (const [x, y] of POINTS) near(await rgb(cdp, url, x, y), expected(x, y, FLAT, [ambient(0.4)]), `ambient at (${x},${y})`);
    });
  });

  it('a point light above the card, with an ambient light: the shading follows N·L over the whole card', async () => {
    await withPage(async (cdp) => {
      const lights = [ambient(0.3), L({ kind: 'point', x: 160, y: 90, z: 150, intensity: 0.5 })];
      const url = await frame(cdp, [...lights.map(l => lightSpec(l)), card()]);
      for (const [x, y] of POINTS) near(await rgb(cdp, url, x, y), expected(x, y, FLAT, lights), `point at (${x},${y})`);
    });
  });

  it('a point light with inverse-square falloff: three distances from the light', async () => {
    await withPage(async (cdp) => {
      const lights = [ambient(0.1), L({ kind: 'point', x: 160, y: 90, z: 150, intensity: 1, falloff: 'inverseSquare', radius: 150 })];
      const url = await frame(cdp, [...lights.map(l => lightSpec(l)), card()]);
      for (const [x, y] of [[160, 90], [100, 60], [20, 20]] as Array<[number, number]>) near(await rgb(cdp, url, x, y), expected(x, y, FLAT, lights), `inverse square at (${x},${y})`);
    });
  });

  it('a smooth falloff: full inside the radius, fading to nothing past radius + falloffDistance', async () => {
    await withPage(async (cdp) => {
      const lights = [ambient(0.1), L({ kind: 'point', x: 160, y: 90, z: 100, intensity: 1, falloff: 'smooth', radius: 80, falloffDistance: 120 })];
      const url = await frame(cdp, [...lights.map(l => lightSpec(l)), card()]);
      for (const [x, y] of [[160, 90], [200, 100], [230, 120], [300, 170]] as Array<[number, number]>) near(await rgb(cdp, url, x, y), expected(x, y, FLAT, lights), `smooth at (${x},${y})`);
    });
  });

  it('a spot light: on the axis, inside the cone, in the feather and outside', async () => {
    await withPage(async (cdp) => {
      const lights = [ambient(0.05), L({ kind: 'spot', x: 160, y: 90, z: 200, lookAtX: 160, lookAtY: 90, lookAtZ: 0, coneAngle: 50, coneFeather: 0.5, intensity: 1 })];
      const url = await frame(cdp, [...lights.map(l => lightSpec(l)), card()]);
      for (const [x, y] of [[160, 90], [185, 90], [200, 90], [215, 90], [260, 90]] as Array<[number, number]>) near(await rgb(cdp, url, x, y), expected(x, y, FLAT, lights), `spot at (${x},${y})`);
    });
  });

  it('a parallel light is as bright everywhere on a flat card', async () => {
    await withPage(async (cdp) => {
      const lights = [L({ kind: 'parallel', x: 0, y: 0, z: 100, lookAtX: 100, lookAtY: 0, lookAtZ: 0, intensity: 0.9 })];
      const url = await frame(cdp, [...lights.map(l => lightSpec(l)), card()]);
      for (const [x, y] of POINTS) near(await rgb(cdp, url, x, y), expected(x, y, FLAT, lights), `parallel at (${x},${y})`);
    });
  });

  it('a card tilted on two axes is shaded by its own normal, per pixel, with perspective-correct positions', async () => {
    await withPage(async (cdp) => {
      const plane = tiltedPlane(30, 20);
      const lights = [ambient(0.2), L({ kind: 'point', x: 120, y: 40, z: 120, intensity: 0.8, falloff: 'inverseSquare', radius: 120 })];
      const url = await frame(cdp, [...lights.map(l => lightSpec(l)), tiltedCard(30, 20)]);
      for (const [x, y] of [[160, 90], [110, 70], [215, 110], [140, 120]] as Array<[number, number]>) near(await rgb(cdp, url, x, y), expected(x, y, plane, lights), `tilted at (${x},${y})`);
    });
  });

  it('a light behind the card does not light the side the camera sees: only the ambient light does', async () => {
    await withPage(async (cdp) => {
      const lights = [ambient(0.2), L({ kind: 'point', x: 160, y: 90, z: -100, intensity: 1 })];
      const url = await frame(cdp, [...lights.map(l => lightSpec(l)), card()]);
      for (const [x, y] of POINTS) near(await rgb(cdp, url, x, y), expected(x, y, FLAT, [ambient(0.2)]), `behind at (${x},${y})`);
    });
  });

  it('a card seen from its back is lit on the side the camera sees (the normal turns toward the camera)', async () => {
    await withPage(async (cdp) => {
      const plane = tiltedPlane(0, 180);
      const lights = [ambient(0.1), L({ kind: 'point', x: 160, y: 90, z: 150, intensity: 0.8 })];
      const url = await frame(cdp, [...lights.map(l => lightSpec(l)), tiltedCard(0, 180)]);
      for (const [x, y] of [[160, 90], [120, 70], [200, 110]] as Array<[number, number]>) {
        const want = expected(x, y, plane, lights);
        expect(want[0], 'the reference is lit here (the point of the test)').toBeGreaterThan(expected(x, y, plane, [ambient(0.1)])[0]! + 20);
        near(await rgb(cdp, url, x, y), want, `back side at (${x},${y})`);
      }
    });
  });

  it('a layer with lit: false is not shaded, whatever the lights do', async () => {
    await withPage(async (cdp) => {
      const plain = await frame(cdp, [card()]);
      const unlit = await frame(cdp, [lightSpec(ambient(0.2)), lightSpec(L({ kind: 'point', x: 160, y: 90, z: 100 })), card({ lit: false })]);
      expect(await diff(cdp, plain, unlit)).toBe(0);
    });
  });

  it('a light outside its lifespan is not counted: with none alive the card is unlit, inside its life it is shaded', async () => {
    await withPage(async (cdp) => {
      const plain = await frame(cdp, [card()], 45, { duration: 2 });
      const url0 = await frame(cdp, [lightSpec(ambient(0.3), { at: 0, duration: 1 }), card()], 15, { duration: 2 });
      const url1 = await cdp.eval('snap(45)');                                  // 1.5 s: the light is over
      near(await rgb(cdp, url0, 100, 100), expected(100, 100, FLAT, [ambient(0.3)]), 'inside its life');
      expect(await diff(cdp, plain, url1)).toBe(0);
    });
  });

  it('a moving light under a moving camera: every seek order gives the same pictures, and nothing is warned', async () => {
    await withPage(async (cdp) => {
      const move = { keyframes: [{ at: 0, to: { x: 300 }, duration: 2, ease: 'none' }] };
      const seq = [
        lightSpec(ambient(0.2)),
        { ...lightSpec(L({ kind: 'spot', x: 20, y: 60, z: 160, lookAtX: 160, lookAtY: 90, lookAtZ: 0, coneAngle: 60 })), ...move },
        { type: 'camera', keyframes: [{ at: 0, to: { fov: 55 }, duration: 2, ease: 'sine.inOut' }] },
        tiltedCard(20, 25),
      ];
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: { sequences: seq } })})`);
      const o = await cdp.eval('orders([0, 7, 15, 22, 30, 38, 45, 52, 59])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('fog alone, with no light: the far layer is mixed toward the fog colour by the amount at its depth', async () => {
    await withPage(async (cdp) => {
      const fogNear = 300, fogFar = 700, fogColor = '#204060', amount = 0.8;
      const url = await frame(cdp, [{ type: 'camera', initial: { fogNear, fogFar, fogColor, fogAmount: amount } }, card({ initial: { x: 0, y: 0, z: -200, fillColor: '#808080' } })]);
      // the card is at z = -200 and faces the camera: the depth along the view direction is the same everywhere on it (CAM.z + 200)
      const f = fogAmount(CAM.z + 200, fogNear, fogFar, amount);
      const fog = [0x20, 0x40, 0x60];
      // z = -200 shrinks the card on screen: look in the middle, where it surely is
      near(await rgb(cdp, url, 160, 90), [0, 1, 2].map(k => 128 * (1 - f) + fog[k]! * f), 'fogged');
      expect(f).toBeGreaterThan(0.2);
      expect(f).toBeLessThan(amount);
    });
  });

  // ── together with the rest (Task 5) ───────────────────────────────────────────────────────────────────────────────────────────────
  const BACK = '#b0703a';
  const backdrop = () => ({ type: 'shape', shape: 'rect', name: 'backdrop', width: W, height: H, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: BACK } });
  const FOGGED = { fogNear: 300, fogFar: 700, fogColor: '#204060', fogAmount: 0.8 };
  const farCard = () => card({ initial: { x: 0, y: 0, z: -200, fillColor: '#808080' } });

  it('light and fog together: the fog mixes in AFTER the shading, so what is far is shaded first and then misted', async () => {
    await withPage(async (cdp) => {
      const url = await frame(cdp, [lightSpec(ambient(0.5)), { type: 'camera', initial: FOGGED }, farCard()]);
      const f = fogAmount(CAM.z + 200, FOGGED.fogNear, FOGGED.fogFar, FOGGED.fogAmount);
      const fog = [0x20, 0x40, 0x60];
      near(await rgb(cdp, url, 160, 90), [0, 1, 2].map(k => 64 * (1 - f) + fog[k]! * f), 'shaded to 64, then misted');
    });
  });

  it('a fog amount of 0.5 mixes half as much as 1', async () => {
    await withPage(async (cdp) => {
      const half = await frame(cdp, [{ type: 'camera', initial: { ...FOGGED, fogAmount: 0.5 } }, farCard()]);
      const f = fogAmount(CAM.z + 200, FOGGED.fogNear, FOGGED.fogFar, 0.5);
      near(await rgb(cdp, half, 160, 90), [0, 1, 2].map(k => 128 * (1 - f) + [0x20, 0x40, 0x60][k]! * f), 'half fog');
    });
  });

  it('with depth of field, light and fog on at once every seek order gives the same pictures, and nothing is warned', async () => {
    await withPage(async (cdp) => {
      const seq = [
        lightSpec(ambient(0.2)),
        { ...lightSpec(L({ kind: 'point', x: 30, y: 40, z: 140, intensity: 0.9 })), keyframes: [{ at: 0, to: { x: 280 }, duration: 2, ease: 'none' }] },
        { type: 'camera', initial: { focus: 'tilt', aperture: 60, ...FOGGED }, keyframes: [{ at: 0, to: { offsetZ: -60 }, duration: 2, ease: 'sine.inOut' }] },
        tiltedCard(25, 20),
        card({ name: 'far', initial: { x: 0, y: 0, z: -250, fillColor: '#808080' } }),
      ];
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: { sequences: seq } })})`);
      const o = await cdp.eval('orders([0, 7, 15, 22, 30, 38, 45, 52, 59])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  for (const [mode, alpha] of [['multiply', 1], ['multiply', 0.5], ['screen', 1], ['overlay', 1]] as const) {
    it(`a lit layer with blendMode ${mode}${alpha < 1 ? ' at alpha ' + alpha : ''} blends its SHADED colour with what is behind it`, async () => {
      await withPage(async (cdp) => {
        const url = await frame(cdp, [backdrop(), lightSpec(ambient(0.5)), card({ blendMode: mode, initial: { x: 0, y: 0, z: 0, fillColor: '#808080', alpha } })]);
        const shaded = hexToRgb('#808080').map(v => v * 0.5) as [number, number, number];
        const back = hexToRgb(BACK);
        // multiply and screen are the basic modes (the backdrop reference table holds the advanced ones): worked by hand, source-over with alpha
        const want = mode === 'multiply' ? back.map((b, k) => (b * shaded[k]! * alpha + b * (1 - alpha)) * 255)
          : mode === 'screen' ? back.map((b, k) => ((b + shaded[k]! - b * shaded[k]!) * alpha + b * (1 - alpha)) * 255)
          : blendPixel(mode, back, 1, shaded, alpha).slice(0, 3);
        near(await rgb(cdp, url, 160, 90), want, `${mode} of the shaded card`);
      });
    });
  }

  it('the layer\'s own filters run BEFORE the shading (the filter sees the unlit picture, the light then shades the result)', async () => {
    await withPage(async (cdp) => {
      const invert = [-1, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0];
      const url = await frame(cdp, [lightSpec(ambient(0.5)), card({ filters: [{ type: 'colorMatrix', matrix: invert }] })]);
      near(await rgb(cdp, url, 160, 90), [0, 1, 2].map(() => (255 - 128) * 0.5), 'inverted to 127, then shaded to 63.5');
    });
  });

  it('a card (a threeD composition) is lit like any threeD layer: its picture is shaded by the card\'s plane', async () => {
    await withPage(async (cdp) => {
      const lights = [ambient(0.2), L({ kind: 'point', x: 160, y: 90, z: 150, intensity: 0.7 })];
      const cardComp = { type: 'composition', name: 'cardc', width: W, height: H, threeD: true, initial: { x: 0, y: 0, z: 0 },
        sequences: [{ type: 'shape', shape: 'rect', width: W, height: H, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#808080' } }] };
      const url = await frame(cdp, [...lights.map(l => lightSpec(l)), cardComp]);
      for (const [x, y] of [[160, 90], [40, 30], [280, 150]] as Array<[number, number]>) near(await rgb(cdp, url, x, y), expected(x, y, FLAT, lights), `card at (${x},${y})`);
    });
  });

  it('each composition has its own lights: a light in an inner composition shades only that composition\'s threeD layers, and an outer light does not reach inside', async () => {
    await withPage(async (cdp) => {
      const inner = (extra: unknown[]) => ({ type: 'composition', name: 'inner', width: W, height: H, initial: { x: 0, y: 0 }, sequences: [...extra, card()] });
      const inside = await frame(cdp, [inner([lightSpec(ambient(0.3))])]);
      near(await rgb(cdp, inside, 160, 90), expected(160, 90, FLAT, [ambient(0.3)]), 'an inner light shades the inner card');
      const outside = await frame(cdp, [lightSpec(ambient(0.3)), inner([])]);
      near(await rgb(cdp, outside, 160, 90), [128, 128, 128], 'an outer light does not reach the inner composition\'s cards');
    });
  });

  it('a light inside a time-remapped composition runs on that composition\'s own clock, and every seek order agrees', async () => {
    await withPage(async (cdp) => {
      const ramp = { ...lightSpec(ambient(0)), keyframes: [{ at: 0, to: { intensity: 1 }, duration: 4, ease: 'none' }] };
      const inner = { type: 'composition', name: 'inner', width: W, height: H, duration: 2, speed: 2, initial: { x: 0, y: 0 }, sequences: [ramp, card()] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: { sequences: [inner] } })})`);
      const url: string = await cdp.eval('snap(30)');                           // 1.0 s: the inner clock reads 2 s of a 4 s ramp = intensity 0.5
      near(await rgb(cdp, url, 160, 90), expected(160, 90, FLAT, [ambient(0.5)]), 'half way up the inner ramp');
      const o = await cdp.eval('orders([0, 10, 20, 30, 40, 50, 59])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  it('the light\'s colour can be keyframed from one colour string to another: halfway it is the mixture, in every seek order', async () => {
    await withPage(async (cdp) => {
      const tint = { ...lightSpec(ambient(1)), keyframes: [{ at: 0, from: { color: '#ff0000' }, to: { color: '#0000ff' }, duration: 2, ease: 'none' }] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: { sequences: [tint, card()] } })})`);
      const start: string = await cdp.eval('snap(0)');
      near(await rgb(cdp, start, 160, 90), [128, 0, 0], 'red at the start');
      const mid: string = await cdp.eval('snap(30)');
      const [r, g, b] = await rgb(cdp, mid, 160, 90);
      near([r!, g!, b!], [64, 0, 64], 'halfway: the sRGB mixture of red and blue (the default colour space of colour keyframes), shaded by the grey card');
      const o = await cdp.eval('orders([0, 10, 20, 30, 40, 50, 59])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
    });
  });

  // ── shadows (Task 6) ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const FLOOR = { o: { x: 0, y: 0, z: -100 }, n: { x: 0, y: 0, z: 1 } };
  const floor = () => card({ name: 'floor', width: 700, height: 500, anchorX: 0.5, anchorY: 0.5, initial: { x: 160, y: 90, z: -100, fillColor: '#808080' } });
  /** A 60 x 60 red square centred on (cx, cy) at depth z: its picture is the whole texture, so its plane is exactly the square. */
  const blocker = (name: string, cx: number, cy: number, z: number, extra: Record<string, unknown> = {}, init: Record<string, unknown> = {}) =>
    ({ type: 'shape', shape: 'rect', name, width: 60, height: 60, anchorX: 0.5, anchorY: 0.5, threeD: true, castsShadows: true, initial: { x: cx, y: cy, z, fillColor: '#ff0000', ...init }, ...extra });
  const planeOf = (cx: number, cy: number, z: number, ry = 0): PlaneFrame => {
    const lt = { x: cx, y: cy, z, rotationX: 0, rotationY: ry * DEG, rotationZ: 0, scaleX: 1, scaleY: 1, pivotX: 0, pivotY: 0 };
    const o = layerToWorld(lt, -30, -30), a = layerToWorld(lt, 30, -30), b = layerToWorld(lt, -30, 30);
    return { o, u: { x: a.x - o.x, y: a.y - o.y, z: a.z - o.z }, v: { x: b.x - o.x, y: b.y - o.y, z: b.z - o.z } };
  };
  const SUN = L({ kind: 'point', x: 40, y: 20, z: 150, intensity: 1, castsShadows: true });
  const AMB = ambient(0.2);
  /** The floor's red channel at a pixel with the shadows of `casters` (each a plane) from `light`: ambient + light × (1 − the strongest occlusion). */
  function floorWithShadow(x: number, y: number, light: LightState, casters: PlaneFrame[], darkness = 1): { value: number; occl: number } {
    const P = pointAt(x, y, FLOOR);
    const cam = { x: CAM.x, y: CAM.y, z: CAM.z };
    const amb = shadeReference(P, FLOOR.n, cam, [AMB])[0]!;
    const full = shadeReference(P, FLOOR.n, cam, [AMB, light])[0]!;
    const occl = Math.max(0, ...casters.map(c => shadowReference(P, light, c, () => 1)));
    return { value: Math.min(GREY * (amb + (full - amb) * (1 - occl * darkness)), 1) * 255, occl };
  }
  /** Pixels clearly in the umbra and clearly in the light (every pixel within 4 of them says the same), found by the reference itself. */
  /** Where a caster's plane is on the screen (its own red picture is drawn there, in front of the floor): x0, y0, x1, y1. */
  function screenRect(c: PlaneFrame): [number, number, number, number] {
    const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, b]) => projectPoint(BASIS, { x: c.o.x + a! * c.u.x + b! * c.v.x, y: c.o.y + a! * c.u.y + b! * c.v.y, z: c.o.z + a! * c.u.z + b! * c.v.z }));
    return [Math.min(...pts.map(p => p.x)), Math.min(...pts.map(p => p.y)), Math.max(...pts.map(p => p.x)), Math.max(...pts.map(p => p.y))];
  }
  function samples(light: LightState, casters: PlaneFrame[], drawn: PlaneFrame[] = casters) {
    const inside: Array<[number, number]> = [], outside: Array<[number, number]> = [];
    const rects = drawn.map(screenRect);
    const onCaster = (x: number, y: number) => rects.some(([x0, y0, x1, y1]) => x >= x0 - 6 && x <= x1 + 6 && y >= y0 - 6 && y <= y1 + 6);
    const at = (x: number, y: number) => floorWithShadow(x, y, light, casters).occl;
    for (let y = 8; y < H - 8; y += 6) for (let x = 8; x < W - 8; x += 6) {
      if (onCaster(x, y)) continue;
      const o = at(x, y);
      const around = [at(x - 4, y), at(x + 4, y), at(x, y - 4), at(x, y + 4)];
      if (o === 1 && around.every(v => v === 1)) inside.push([x, y]);
      if (o === 0 && around.every(v => v === 0)) outside.push([x, y]);
    }
    return { inside, outside };
  }
  const shadowScene = (casters: unknown[], light: LightState = SUN, lightExtra: Record<string, unknown> = {}) => [lightSpec(AMB), lightSpec(light, lightExtra), ...casters, floor()];
  const pick = <T,>(a: T[], n: number): T[] => Array.from({ length: n }, (_, i) => a[Math.floor((i + 0.5) * a.length / n)]!);

  it('a hard shadow: where the caster\'s shadow falls on the floor is dark and everywhere else is lit, to within 2/255 of the reference', async () => {
    await withPage(async (cdp) => {
      const caster = blocker('block', 160, 90, 0, { castsShadows: true });
      const url = await frame(cdp, shadowScene([caster], SUN, { castsShadows: true }));
      const { inside, outside } = samples(SUN, [planeOf(160, 90, 0)]);
      expect(inside.length, 'the reference finds an umbra to look at').toBeGreaterThan(20);
      expect(outside.length).toBeGreaterThan(200);
      for (const [x, y] of [...pick(inside, 8), ...pick(outside, 8)]) {
        const want = floorWithShadow(x, y, SUN, [planeOf(160, 90, 0)]).value;
        near(await rgb(cdp, url, x, y), [want, want, want], `floor at (${x},${y})`);
      }
    });
  });

  it('shadows need both halves: castsShadows on the light AND on the layer; either alone leaves the floor as if there were no shadow', async () => {
    await withPage(async (cdp) => {
      const none = await frame(cdp, shadowScene([blocker('block', 160, 90, 0, { castsShadows: false })], SUN, { castsShadows: true }));
      const layerOnly = await frame(cdp, shadowScene([blocker('block', 160, 90, 0)], L({ ...SUN, castsShadows: false })));
      expect(await diff(cdp, none, layerOnly)).toBe(0);
      const withShadow = await frame(cdp, shadowScene([blocker('block', 160, 90, 0)], SUN, { castsShadows: true }));
      expect(await diff(cdp, none, withShadow)).toBeGreaterThan(40);
    });
  });

  it('a soft shadow (shadowDiffusion) has a wider edge than a hard one, and the same dark middle', async () => {
    await withPage(async (cdp) => {
      const caster = blocker('block', 160, 90, 0);
      const hardUrl = await frame(cdp, shadowScene([caster], SUN, { castsShadows: true }));
      const soft = L({ ...SUN });
      const softSeq = [lightSpec(AMB), { ...lightSpec(soft, { castsShadows: true }), initial: { ...lightSpec(soft).initial, shadowDiffusion: 30 } }, caster, floor()];
      const softUrl = await frame(cdp, softSeq);
      const { inside } = samples(SUN, [planeOf(160, 90, 0)]);
      // the umbra sample nearest the umbra's centre of mass: far enough from every edge for a 13 px penumbra not to reach it
      const mx = inside.reduce((a, [x]) => a + x, 0) / inside.length, my = inside.reduce((a, [, y]) => a + y, 0) / inside.length;
      const [cx, cy] = inside.reduce((best, p) => (Math.hypot(p[0] - mx, p[1] - my) < Math.hypot(best[0] - mx, best[1] - my) ? p : best))!;
      // count the pixels of the row through the umbra that are neither the lit level nor the shadow level
      const x0 = Math.ceil(screenRect(planeOf(160, 90, 0))[2]) + 8;                 // right of the red caster: only the floor and its shadow are there
      const band = async (url: string) => {
        const row: number[] = (await cdp.eval(`row(${JSON.stringify(url)}, ${cy})`)).filter((_: number, x: number) => x > x0 && x < 300);
        const lo = Math.min(...row), hi = Math.max(...row);
        return row.filter(v => v > lo + 0.1 * (hi - lo) && v < hi - 0.1 * (hi - lo)).length;
      };
      const hard = await band(hardUrl), softBand = await band(softUrl);
      expect(softBand, `the soft edge (${softBand} px) is wider than the hard one (${hard} px)`).toBeGreaterThan(hard + 4);
      const mid = await rgb(cdp, softUrl, cx, cy), midHard = await rgb(cdp, hardUrl, cx, cy);
      near(mid, midHard, 'the middle of the umbra is as dark as with a hard shadow');
    });
  });

  it('two casters: the shadows join by the strongest, not by adding up (an overlap is no darker than one shadow alone)', async () => {
    await withPage(async (cdp) => {
      const a = blocker('a', 160, 90, 0), b = blocker('b', 170, 95, -40);
      const planes = [planeOf(160, 90, 0), planeOf(170, 95, -40)];
      const url = await frame(cdp, shadowScene([a, b], SUN, { castsShadows: true }));
      const { inside } = samples(SUN, planes);
      for (const [x, y] of pick(inside, 8)) {
        const want = floorWithShadow(x, y, SUN, planes).value;
        near(await rgb(cdp, url, x, y), [want, want, want], `two casters at (${x},${y})`);
      }
    });
  });

  it('a caster that is hidden (alpha 0, or outside its life) casts nothing', async () => {
    await withPage(async (cdp) => {
      const none = await frame(cdp, shadowScene([], SUN, { castsShadows: true }));
      const clear = await frame(cdp, shadowScene([blocker('block', 160, 90, 0, {}, { alpha: 0 })], SUN, { castsShadows: true }));
      expect(await diff(cdp, none, clear)).toBe(0);
      const gone = await frame(cdp, shadowScene([blocker('block', 160, 90, 0, { at: 1, duration: 1 })], SUN, { castsShadows: true }), 0, { duration: 2 });
      expect(await diff(cdp, none, gone)).toBe(0);
    });
  });

  it('a caster turned on its axis casts the shadow of its turned outline', async () => {
    await withPage(async (cdp) => {
      const turned = blocker('block', 160, 90, 0, {}, { rotationY: 40 });
      const plane = planeOf(160, 90, 0, 40);
      const url = await frame(cdp, shadowScene([turned], SUN, { castsShadows: true }));
      const { inside, outside } = samples(SUN, [plane]);
      expect(inside.length).toBeGreaterThan(10);
      for (const [x, y] of [...pick(inside, 6), ...pick(outside, 6)]) {
        const want = floorWithShadow(x, y, SUN, [plane]).value;
        near(await rgb(cdp, url, x, y), [want, want, want], `turned caster, floor at (${x},${y})`);
      }
    });
  });

  it('up to four casters shade one receiver: each of the four shadows is where the reference says; a fifth caster is not read (the build says so)', async () => {
    await withPage(async (cdp) => {
      const spots: Array<[number, number]> = [[80, 50], [200, 40], [90, 140], [210, 140], [150, 95]];
      const names = spots.map((_, i) => 'c' + i);
      const planes = spots.map(([x, y]) => planeOf(x, y, 0));
      const url = await frame(cdp, shadowScene(spots.map(([x, y], i) => blocker(names[i]!, x, y, 0)), SUN, { castsShadows: true }));
      const four = samples(SUN, planes.slice(0, 4), planes);
      const onlyFifth = samples(SUN, [planes[4]!], planes).inside.filter(([x, y]) => planes.slice(0, 4).every(p => floorWithShadow(x, y, SUN, [p]).occl === 0));
      expect(four.inside.length, 'the reference finds the four umbras to look at').toBeGreaterThan(40);
      for (const [x, y] of pick(four.inside, 16)) {
        const want = floorWithShadow(x, y, SUN, planes.slice(0, 4)).value;
        near(await rgb(cdp, url, x, y), [want, want, want], `four casters at (${x},${y})`);
      }
      // where only the fifth caster's shadow would fall the floor is lit: the fifth is not read
      expect(onlyFifth.length, 'there is floor that only the fifth caster would shade').toBeGreaterThan(3);
      for (const [x, y] of pick(onlyFifth, 3)) {
        const want = floorWithShadow(x, y, SUN, []).value;
        near(await rgb(cdp, url, x, y), [want, want, want], `fifth caster ignored at (${x},${y})`);
      }
    });
  });

  it('a caster below the floor (the floor hides it) casts nothing onto the floor', async () => {
    await withPage(async (cdp) => {
      const none = await frame(cdp, shadowScene([], SUN, { castsShadows: true }));
      const below = await frame(cdp, shadowScene([blocker('block', 200, 100, -220)], SUN, { castsShadows: true }));
      expect(await diff(cdp, none, below)).toBe(0);
    });
  });

  it('a caster does not shade itself, and a layer with lit: false receives no shadow', async () => {
    await withPage(async (cdp) => {
      const caster = blocker('block', 160, 90, 0);
      const withFloorUnlit = await frame(cdp, [lightSpec(AMB), lightSpec(SUN, { castsShadows: true }), caster, { ...floor(), lit: false }]);
      near(await rgb(cdp, withFloorUnlit, 40, 150), [128, 128, 128], 'an unlit floor is not shadowed');
      // the caster's own face: it is lit by the light as any card is (no self shadow): its pixel at the centre follows the reference without a shadow
      const lit = await frame(cdp, shadowScene([caster], SUN, { castsShadows: true }));
      const P = pointAt(160, 90, { o: { x: 0, y: 0, z: 0 }, n: { x: 0, y: 0, z: 1 } });
      const m = shadeReference(P, { x: 0, y: 0, z: 1 }, { x: CAM.x, y: CAM.y, z: CAM.z }, [AMB, SUN])[0]!;
      near(await rgb(cdp, lit, 160, 90), [Math.min(m, 1) * 255, 0, 0], 'the caster\'s own face, lit and unshadowed');
    });
  });

  it('with shadows, every seek order gives the same pictures and nothing is warned', async () => {
    await withPage(async (cdp) => {
      const caster = blocker('block', 160, 90, 0, {}, { rotationY: 0 });
      const move = { ...lightSpec(SUN, { castsShadows: true }), keyframes: [{ at: 0, to: { x: 260 }, duration: 2, ease: 'none' }] };
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: { sequences: [lightSpec(AMB), move, { ...caster, keyframes: [{ at: 0, to: { rotationY: 80 }, duration: 2, ease: 'none' }] }, floor()] } })})`);
      const o = await cdp.eval('orders([0, 7, 15, 22, 30, 38, 45, 52, 59])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
      expect(mine(await cdp.eval('__logs'))).toEqual([]);
    });
  });

  // ── from the final review ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  it('a camera with fog that is over (outside its life) leaves no fog behind: any seek order shows the same pictures as a composition without that camera', async () => {
    await withPage(async (cdp) => {
      const plain = await frame(cdp, [farCard()], 45, { duration: 2 });
      const seq = [{ type: 'camera', at: 0, duration: 1, initial: FOGGED }, farCard()];
      await cdp.eval(`mk(${JSON.stringify({ duration: 2, composition: { sequences: seq } })})`);
      const early: string = await cdp.eval('snap(15)');                          // inside the camera's life: fogged
      const late: string = await cdp.eval('snap(45)');                           // after it: the home camera, no fog
      near(await rgb(cdp, early, 160, 90), [0, 1, 2].map(k => 128 * (1 - fogAmount(CAM.z + 200, FOGGED.fogNear, FOGGED.fogFar, FOGGED.fogAmount)) + [0x20, 0x40, 0x60][k]! * fogAmount(CAM.z + 200, FOGGED.fogNear, FOGGED.fogFar, FOGGED.fogAmount)), 'fogged inside the camera\'s life');
      expect(await diff(cdp, plain, late)).toBe(0);
      const o = await cdp.eval('orders([0, 10, 15, 25, 35, 45, 59])');
      expect(o.bwdMax).toBe(0);
      expect(o.jmpMax).toBe(0);
    });
  });

  it('destroying a movie that drew shadows leaves no "destroyed while still bound" warning from the renderer', async () => {
    await withPage(async (cdp) => {
      await frame(cdp, shadowScene([blocker('block', 160, 90, 0)], SUN, { castsShadows: true }));
      const logs: string[] = await cdp.eval('destroyMovie()');
      expect(logs.filter(l => /destroyed|still bound/i.test(l)), JSON.stringify(logs)).toEqual([]);
    });
  });
});
