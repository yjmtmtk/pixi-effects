// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// the first test of a file starts a browser tab and loads the page; under the whole suite's load that can pass the 5 s default
vi.setConfig({ testTimeout: 60000 });
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';
import { shadeReference, fogAmount, type LightState } from '../../src/space/lighting';
import { cameraBasis, homeCamera, layerToWorld, DEG, type Vec3 } from '../../src/space/math';

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
const lightSpec = (s: LightState, extra: Record<string, unknown> = {}) => ({
  type: 'light', kind: s.kind, falloff: s.falloff, ...extra,
  initial: { x: s.x, y: s.y, z: s.z, lookAtX: s.lookAtX, lookAtY: s.lookAtY, lookAtZ: s.lookAtZ, intensity: s.intensity, coneAngle: s.coneAngle, coneFeather: s.coneFeather, radius: s.radius, falloffDistance: s.falloffDistance },
});
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
});
