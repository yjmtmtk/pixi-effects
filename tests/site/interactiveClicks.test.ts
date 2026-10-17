// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

// The Interactive page's click, drag and drop samples (examples/interactive/click.html, drop.html, move3d.html), driven by real mouse events in Chrome:
// each shows one of movie.hover / movie.pick / hit.three.grab, so each must really react.
const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function withSample<T>(page: string, fn: (s: { cdp: any; ev: <U = any>(e: string) => Promise<U>; mouse: (type: string, cx: number, cy: number) => Promise<void> }) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'ic-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1500, height: 1100, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/interactive/${page}` });
    let ready = false;
    for (let i = 0; i < 200 && !ready; i++) { ready = await cdp.eval('window.__ready === true').catch(() => false); if (!ready) await check.sleep(150); }
    expect(ready, `${page} never became ready: ${JSON.stringify(await cdp.eval('window.__logs').catch(() => null))}`).toBe(true);
    // canvas pixels -> page coordinates, whatever size the canvas is shown at
    const box = await cdp.eval(`(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`);
    const mouse = async (type: string, cx: number, cy: number) => {
      const x = box.x + cx * box.w / 1280, y = box.y + cy * box.h / 720;
      await cdp.send('Input.dispatchMouseEvent', type === 'mouseMoved' ? { type, x, y } : { type, x, y, button: 'left', clickCount: 1 });
      await check.sleep(120);
    };
    const out = await fn({ cdp, ev: (e) => cdp.eval(e), mouse });
    expect(await cdp.eval('window.__logs'), `${page} warned`).toEqual([]);
    return out;
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(150); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the click, drag and drop samples of the Interactive page, with real mouse events', () => {
  it('click.html: the pointer over a bubble raises it, leaving puts it back, a click pops it (and a click on nothing does not), and it comes back', async () => {
    await withSample('click.html', async ({ ev, mouse }) => {
      const vars = () => ev<Record<string, number | string>>('({ ...movie.vars })');
      await mouse('mouseMoved', 700, 292);                                    // Lime (index 2)
      await check.sleep(250);
      expect((await vars()).h2, 'hover').toBe(1);
      await mouse('mouseMoved', 40, 300);                                      // the background
      await check.sleep(250);
      expect((await vars()).h2, 'left').toBe(0);
      await mouse('mouseMoved', 700, 292); await mouse('mousePressed', 700, 292); await mouse('mouseReleased', 700, 292);
      await check.sleep(250);
      const popped = await vars();
      expect(popped.p2, 'popped').toBe(1);
      expect(popped.score).toBe(1);
      await mouse('mouseMoved', 40, 300); await mouse('mousePressed', 40, 300); await mouse('mouseReleased', 40, 300);
      await check.sleep(250);
      expect((await vars()).score, 'a click on nothing').toBe(1);
      await check.sleep(1900);
      const back = await vars();
      expect(back.p2, 'it comes back').toBe(0);
      expect(back.score).toBe(0);
    });
  }, 90_000);

  it('drop.html: a card dropped on a zone stays in it (the zone lights while the card is over it), a card dropped elsewhere goes back to the tray, and the button puts them all back', async () => {
    await withSample('drop.html', async ({ ev, mouse }) => {
      const vars = () => ev<Record<string, number | string>>('({ ...movie.vars })');
      expect(await vars()).toMatchObject({ c0x: 190, c0y: 170 });
      await mouse('mouseMoved', 190, 170); await mouse('mousePressed', 190, 170);
      await mouse('mouseMoved', 600, 300); await mouse('mouseMoved', 770, 200);
      expect((await vars()).doneLit, 'the zone under the card lights').toBeGreaterThan(0);
      await mouse('mouseReleased', 770, 200);
      await check.sleep(250);
      const inDone = await vars();
      expect([inDone.c0x, inDone.c0y], 'in the first slot of Done').toEqual([770, 240]);
      expect(inDone.doneLit).toBe(0);
      expect(inDone.status).toBe('Done 1 · Later 0');
      // the second card to Later, the third dropped on empty ground
      await mouse('mouseMoved', 190, 360); await mouse('mousePressed', 190, 360); await mouse('mouseMoved', 700, 500); await mouse('mouseMoved', 1100, 200); await mouse('mouseReleased', 1100, 200);
      await mouse('mouseMoved', 190, 550); await mouse('mousePressed', 190, 550); await mouse('mouseMoved', 500, 650); await mouse('mouseReleased', 500, 650);
      await check.sleep(250);
      const v = await vars();
      expect([v.c1x, v.c1y]).toEqual([1100, 240]);
      expect([v.c2x, v.c2y], 'dropped on nothing: back in the tray').toEqual([190, 550]);
      expect(v.status).toBe('Done 1 · Later 1');
      await ev('document.getElementById("reset").click()');
      await check.sleep(250);
      expect(await vars()).toMatchObject({ c0x: 190, c0y: 170, c1x: 190, c1y: 360, status: 'Done 0 · Later 0' });
    });
  }, 90_000);

  it("move3d.html: an object is taken where it is drawn and slides along the floor (it never leaves it), and a click on the floor moves nothing", async () => {
    await withSample('move3d.html', async ({ ev, mouse }) => {
      const pos = () => ev<Record<string, { x: number; z: number }>>('JSON.parse(JSON.stringify(window.__pos))');
      const before = await pos();
      // where the cube is drawn: scan the picture for a point whose pick is the cube
      const at = await ev<{ x: number; y: number } | null>(`(() => { for (let y = 120; y < 720; y += 6) for (let x = 100; x < 1200; x += 6) if (movie.pick(x, y, { only: ['world'] })?.three?.object === 'cube') return { x, y }; return null; })()`);
      expect(at, 'the cube is somewhere in the picture').not.toBeNull();
      await mouse('mouseMoved', 100, 640); await mouse('mousePressed', 100, 640); await mouse('mouseMoved', 300, 640); await mouse('mouseReleased', 300, 640);
      expect(await pos(), 'dragging the floor moves nothing').toEqual(before);
      await mouse('mouseMoved', at!.x, at!.y); await mouse('mousePressed', at!.x, at!.y); await mouse('mouseMoved', at!.x + 120, at!.y); await mouse('mouseMoved', at!.x + 240, at!.y + 60); await mouse('mouseReleased', at!.x + 240, at!.y + 60);
      const after = await pos();
      expect(after.cube!.x - before.cube!.x, 'the cube slid to the right').toBeGreaterThan(100);
      expect(after.cube!.z - before.cube!.z, 'and toward the viewer').toBeGreaterThan(10);
      expect(after.ball).toEqual(before.ball);
      expect(after.knot).toEqual(before.knot);
      await ev('document.getElementById("reset").click()');
      expect(await pos()).toEqual(before);
    });
  }, 90_000);
});
