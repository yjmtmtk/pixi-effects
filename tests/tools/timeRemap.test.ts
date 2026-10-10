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
    for (let i = 0; i < 600; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }       // up to 2 minutes: the page renders its own clip first
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

/** [name, the composition's own keys, the local time at output time t, the content length in seconds] */
const MAPS: Array<[string, Record<string, unknown>, string, number]> = [
  ['speed 2', { speed: 2 }, 't => 2 * t', 8],
  ['reverse', { speed: -1 }, 't => 4 - t', 4],
  ['slow', { speed: 0.5 }, 't => 0.5 * t', 4],
  ['loop + hold + backward ramp', { keyframes: [
    { at: 0, from: { time: 0 }, to: { time: 1 }, duration: 1, repeat: 1 },      // 0..2 s: 0 -> 1 twice
    { at: 2, to: { time: 1 }, duration: 1 },                                     // 2..3 s: hold at 1
    { at: 3, to: { time: 0 }, duration: 1 },                                     // 3..4 s: back to 0
  ] }, 't => (t < 2 ? t % 1 : t < 3 ? 1 : 1 - (t - 3))', 4],
];
const OUTER = Array.from({ length: 16 }, (_, i) => i * 7 + 3);                  // output frames 3 .. 108

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('time remap of a composition, on a real browser', () => {
  for (const [name, extra, map, content] of MAPS) {
    it(`${name}: every frame equals the unremapped composition at the mapped time (to, from, set, gradient, spring, a nested video) and every seek order agrees`, async () => {
      await withPage(async (cdp) => {
        // The oracle shows whole frames, so compare only where the mapped local time IS a whole frame (speed 0.5 lands between frames on odd ones)
        const mapped = new Function(`return ${map}`)() as (t: number) => number;
        const exact = OUTER.filter(f => Math.abs(mapped(f / FPS) * FPS - Math.round(mapped(f / FPS) * FPS)) < 1e-6);
        expect(exact.length, `${name}: frames compared`).toBeGreaterThanOrEqual(7);
        const want = await cdp.eval(`plainAt(${map}, ${JSON.stringify(exact)}, ${content})`);
        await cdp.eval(`mk({ duration: 4, composition: { sequences: [{ ...stage(), ...${JSON.stringify(extra)} }] } })`);
        let worst = 0;
        for (const f of exact) worst = Math.max(worst, await cdp.eval(`snap(${f}).then(s => diff(s, ${JSON.stringify(want[f])}))`));
        expect(worst, `${name}: largest difference from the unremapped composition`).toBeLessThanOrEqual(60);          // antialiased edges only (the clock is rounded to 1e-7 s)
        expect(await cdp.eval(`orders(${JSON.stringify(OUTER)})`)).toEqual({ bwdMax: 0, jmpMax: 0, jmp2Max: 0 });
        const logs = (await cdp.eval('window.__logs')).filter((l: string) => !/\[Resolver\]/.test(l));
        expect(logs, `${name}: ${JSON.stringify(logs)}`).toEqual([]);
      });
    }, 600000);
  }

  it('a negative initial.time counts back from the end of the content: -1 on a 4 s composition starts at local 3 s', async () => {
    await withPage(async (cdp) => {
      const frames = [3, 9, 15, 21, 27];
      const want = await cdp.eval(`plainAt(t => 3 + t, ${JSON.stringify(frames)}, 4)`);
      await cdp.eval(`mk({ duration: 1, composition: { sequences: [{ ...stage(), initial: { time: -1 } }] } })`);
      let worst = 0;
      for (const f of frames) worst = Math.max(worst, await cdp.eval(`snap(${f}).then(s => diff(s, ${JSON.stringify(want[f])}))`));
      expect(worst).toBeLessThanOrEqual(60);
    });
  }, 300000);

  it('a jump BACKWARD first, to a place a from / to tween reaches only going backward, still gives the same picture', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk({ duration: 4, composition: { sequences: [{ ...stage(), speed: -1 }] } })`);
      const first = await cdp.eval('snap(100)');                       // backward-first: the very first render is at the far end of the local timeline
      await cdp.eval('snap(0)'); await cdp.eval('snap(60)');
      expect(await cdp.eval(`snap(100).then(s => diff(s, ${JSON.stringify(first)}))`)).toBe(0);
    });
  }, 300000);

  it('speed above 1 does not cut the content at the composition length (the local time runs to 8 s)', async () => {
    await withPage(async (cdp) => {
      const at = async (f: number) => cdp.eval(`frameAt(${f})`);
      await cdp.eval(`mk({ duration: 4, composition: { sequences: [{ type: 'composition', duration: 4, speed: 2, sequences: [{ type: 'video', asset: 'clip', audio: false, duration: 3, at: 5, initial: { scale: 2 } }] }] } })`);
      // local time 5 s starts at output 2.5 s (frame 75); the video has a 3 s clip, so output frame 90 shows clip frame (6 - 5) * 30
      expect(Math.abs((await at(90)) - 30)).toBeLessThanOrEqual(1);
    });
  }, 300000);

  it('particles, grain on a child, a camera with a threeD card stay frame-exact in a reversed and a doubled composition, in every seek order', async () => {
    await withPage(async (cdp) => {
      const content = `[
        { type: 'shape', shape: 'rect', name: 'film', width: 320, height: 180, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: '#303040' }, filters: [{ type: 'grain', amount: 0.3, fps: 30, seed: 5 }] },
        ...particles({ count: 40, at: 0.2, life: [1, 1.6], area: { x: 160, y: 90 }, angle: [0, 360], speed: [40, 120], seed: 3, size: [3, 5], colors: ['#ff7a00', '#ffd23f'] }),
        { type: 'shape', shape: 'rect', name: 'card', threeD: true, width: 80, height: 50, initial: { x: 160, y: 90, z: 0, fillColor: '#2f6bff' }, keyframes: [{ at: 0, to: { rotationY: 60 }, duration: 3 }] },
        { type: 'camera', name: 'cam', keyframes: [{ at: 0, to: { z: 400 }, duration: 3 }] },
      ]`;
      for (const c of [{ speed: -1, map: '(t => 4 - t)', len: 4 }, { speed: 2, map: '(t => 2 * t)', len: 8 }]) {
        // the oracle: the same content, unremapped (as long as the remapped one's content), at the mapped local time
        const want = await cdp.eval(`(async () => { await mk({ duration: ${c.len}, composition: { sequences: [{ type: 'composition', duration: ${c.len}, sequences: ${content} }] } }); const out = {}; for (const f of ${JSON.stringify(OUTER)}) out[f] = await snap(Math.round(${c.map}(f / 30) * 30)); return out; })()`);
        await cdp.eval(`mk({ duration: 4, composition: { sequences: [{ type: 'composition', duration: 4, speed: ${c.speed}, sequences: ${content} }] } })`);
        let worst = 0;
        for (const f of OUTER) worst = Math.max(worst, await cdp.eval(`snap(${f}).then(s => diff(s, ${JSON.stringify(want[f])}))`));
        expect(worst, `speed ${c.speed}`).toBeLessThanOrEqual(60);
        expect(await cdp.eval(`orders(${JSON.stringify(OUTER)})`), `speed ${c.speed}`).toEqual({ bwdMax: 0, jmpMax: 0, jmp2Max: 0 });
        const logs = (await cdp.eval('window.__logs')).filter((l: string) => !/\[Resolver\]/.test(l));
        expect(logs, `speed ${c.speed}: ${JSON.stringify(logs)}`).toEqual([]);
      }
    });
  }, 900000);

  it('motion blur of a reversed composition equals the blur of the plain one at the mapped time (up to the order the samples are summed)', async () => {
    await withPage(async (cdp) => {
      const mb = '{ samples: 8, shutter: 0.5 }';
      const move = `[{ type: 'shape', shape: 'rect', width: 40, height: 40, initial: { x: 40, y: 90, fillColor: '#ffffff' }, keyframes: [{ at: 0, to: { x: 280 }, duration: 4, ease: 'none' }] }]`;
      await cdp.eval(`mk({ duration: 4, motionBlur: ${mb}, composition: { sequences: [{ type: 'composition', duration: 4, sequences: ${move} }] } })`);
      const plain: Record<number, string> = {};
      for (const f of [30, 60, 90]) plain[f] = await cdp.eval(`snap(${f})`);
      await cdp.eval(`mk({ duration: 4, motionBlur: ${mb}, composition: { sequences: [{ type: 'composition', duration: 4, speed: -1, sequences: ${move} }] } })`);
      for (const f of [30, 60, 90]) {
        const d = await cdp.eval(`snap(${f}).then(s => diff(s, ${JSON.stringify(plain[120 - f])}))`);
        expect(d, `frame ${f} against the plain composition at frame ${120 - f}`).toBeLessThanOrEqual(6);
      }
    });
  }, 300000);

  it('destroy kills the local timeline and the clock: nothing a remapped composition made is left behind', async () => {
    await withPage(async (cdp) => {
      await cdp.eval(`mk({ duration: 4, composition: { sequences: [{ ...stage(), speed: -1 }, { ...stage(), speed: 2 }] } })`);
      await cdp.eval('snap(30)');
      await cdp.eval('(window.__tl = window.movie.timeline, 0)');
      expect(await cdp.eval('window.__tl.segments().length')).toBeGreaterThan(0);          // the movie and its local timelines exist
      await cdp.eval('window.movie.destroy().then(() => { window.movie = null; })');
      expect(await cdp.eval('window.__tl.segments().length'), 'timelines left behind by a destroyed movie').toBe(0);
    });
  }, 300000);
});
