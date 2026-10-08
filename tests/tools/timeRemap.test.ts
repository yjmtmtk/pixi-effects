// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function withPage<T>(fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'tremap-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/time-remap.html` });
    for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const FPS = 30;
const LAST = 89;                                  // the clip has 90 frames
/** The clip frame a video at file time `src` shows: the frame whose time is at or before it. */
const shown = (src: number, loop = false): number => {
  const w = loop ? (((src % 3) + 3) % 3) : Math.min(Math.max(src, 0), 3);
  return Math.min(LAST, Math.floor(w * FPS + 1e-4));
};

/** An accelerating, eased ramp: 0 -> 1 s of the file in the first second, then 1 -> 3 s with an ease. Only checked for order and seeks (no closed form). */
const RAMP = { keyframes: [{ at: 0, from: { time: 0 }, to: { time: 1 }, duration: 1 }, { at: 1, to: { time: 3 }, duration: 1, ease: 'power2.inOut' }] };

/** [name, layer extras, layer duration, file time at output time t] */
const CASES: Array<[string, Record<string, any>, number, (t: number) => number]> = [
  ['speed 2', { speed: 2 }, 1.5, t => 2 * t],
  ['speed 0.5', { speed: 0.5 }, 3, t => 0.5 * t],
  ['speed 0.37', { speed: 0.37 }, 3, t => 0.37 * t],
  ['reverse', { speed: -1 }, 3, t => 3 - t],
  ['freeze', { keyframes: [{ at: 0, from: { time: 0 }, to: { time: 1 }, duration: 1 }, { at: 1, to: { time: 1 }, duration: 1 }, { at: 2, to: { time: 2 }, duration: 1 }] }, 3, t => (t < 1 ? t : t < 2 ? 1 : t - 1)],
  ['yoyo', { keyframes: [{ at: 0, from: { time: 0 }, to: { time: 1 }, duration: 1, repeat: 2, yoyo: true }] }, 3, t => (Math.floor(t) % 2 === 0 ? t % 1 : 1 - (t % 1))],
  ['repeat', { keyframes: [{ at: 0, from: { time: 1 }, to: { time: 2 }, duration: 1, repeat: 2 }] }, 3, t => 1 + (t % 1)],
  ['initial.time + speed', { speed: 1, initial: { time: 1 } }, 2, t => 1 + t],
  ['negative time = from the end', { speed: 1, initial: { time: -1 } }, 1, t => 2 + t],
];

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('time remap of a video, on a real browser', () => {
  it('every frame is the clip frame the clock says, and the same going forwards, by jumps and backwards', async () => {
    await withPage(async (cdp) => {
      for (const [name, extra, dur, at] of CASES) {
        const layer = { type: 'video', asset: 'clip', duration: dur, audio: false, ...extra, initial: { scale: 2, ...(extra.initial ?? {}) } };
        await cdp.eval(`mk({ duration: ${dur}, composition: { sequences: [${JSON.stringify(layer)}] } })`);
        const frames: number[] = [];
        // frame 0, then every fourth frame from 1: never ON a seam of a repeat / yoyo / freeze (30, 60, 90), where a tween legitimately shows
        // either the end of one play or the start of the next
        frames.push(0);
        for (let f = 1; f < dur * FPS - 1; f += 4) frames.push(f);
        const got: number[] = [];
        for (const f of frames) got.push(await cdp.eval(`frameAt(${f})`));
        const want = frames.map(f => shown(at(f / FPS)));
        // a sampled time that lands exactly on a frame boundary may legitimately be either side by one frame (the clip's own rounding): allow 1
        got.forEach((g, i) => expect(Math.abs(g - want[i]!), `${name}: output frame ${frames[i]} showed clip frame ${g}, wanted ${want[i]}`).toBeLessThanOrEqual(1));
        const r = await cdp.eval(`orders(${JSON.stringify(frames)})`);
        expect(r, name).toEqual({ bwdMax: 0, jmpMax: 0, jmp2Max: 0 });
        const logs = (await cdp.eval('window.__logs')).filter((l: string) => !/\[Resolver\]/.test(l));    // pixi's note that mk() registers the same asset name again
        expect(logs, `${name}: ${JSON.stringify(logs)}`).toEqual([]);
      }
    });
  }, 600000);

  it('a ramp (accelerating, eased) is the same going forwards, by jumps and backwards, and moves forward only', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk({ duration: 2, composition: { sequences: [{ type: 'video', asset: 'clip', duration: 2, audio: false, initial: { scale: 2 }, ...${JSON.stringify(RAMP)} }] } })`);
      const frames = Array.from({ length: 29 }, (_, i) => i * 2);
      const got: number[] = [];
      for (const f of frames) got.push(await cdp.eval(`frameAt(${f})`));
      for (let i = 1; i < got.length; i++) expect(got[i]!).toBeGreaterThanOrEqual(got[i - 1]!);
      expect(got[0]).toBe(0);
      expect(got[got.length - 1]!).toBeGreaterThan(80);
      expect(await cdp.eval(`orders(${JSON.stringify(frames)})`)).toEqual({ bwdMax: 0, jmpMax: 0, jmp2Max: 0 });
    });
  }, 300000);

  it('the export (Movie.render to mp4, played back) shows the same clip frames as the snapshots, for a reversed and a doubled video', async () => {
    await withPage(async (cdp) => {
      for (const extra of [{ speed: -1, dur: 3 }, { speed: 2, dur: 1.5 }]) {
        await cdp.eval(`mk({ duration: ${extra.dur}, composition: { sequences: [{ type: 'video', asset: 'clip', duration: ${extra.dur}, audio: false, initial: { scale: 2 }, speed: ${extra.speed} }] } })`);
        const frames = [0, 10, 20, 30, 40].filter(f => f < extra.dur * FPS - 2);
        const snaps: number[] = [];
        for (const f of frames) snaps.push(await cdp.eval(`frameAt(${f})`));
        const exported: Record<string, number> = await cdp.eval(`exportFrames(${JSON.stringify(frames)})`);
        frames.forEach((f, i) => expect(Math.abs(exported[f]! - snaps[i]!), `speed ${extra.speed}: output frame ${f}`).toBeLessThanOrEqual(1));
      }
    });
  }, 600000);

  it('a loop wraps (a negative speed too); speed alone makes the layer as long as the file divided by |speed|', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk({ duration: 6, composition: { sequences: [{ type: 'video', asset: 'clip', duration: 6, loop: true, audio: false, initial: { scale: 2 }, speed: -1 }] } })`);
      expect(await cdp.eval('frameAt(0)')).toBe(89);                                  // starts at the end of the file ... counting back
      const f = await cdp.eval('frameAt(100)');                                       // 3.33 s: wrapped, counting back from 6 - 3.33 = 2.67 s in file time
      expect(Math.abs(f - shown(((6 - 100 / FPS) % 3 + 3) % 3))).toBeLessThanOrEqual(1);
      const lasts = async (extra: string) => {
        await cdp.eval(`mk({ duration: 8, composition: { sequences: [{ type: 'video', asset: 'clip', audio: false, ${extra} initial: { scale: 2 } }] } })`);
        const row = await cdp.eval(`window.movie.timelineData().rows.find(r => r.type === 'video')`);
        return row.end - row.start;
      };
      const plain = await lasts('');                                                  // the file's own length (a little over 3 s: the container rounds)
      expect(plain).toBeGreaterThan(2.9);
      expect(await lasts('speed: 2,')).toBeCloseTo(plain / 2, 3);                     // duration not given: the file's length divided by |speed|
      expect(await lasts('speed: -0.5,')).toBeCloseTo(plain * 2, 3);
    });
  }, 300000);
});
