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
const run = describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS);

async function withPage(query: string, fn: (cdp: any) => Promise<void>): Promise<void> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'thumbnail-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/films/thumbnail.html${query}` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    await cdp.eval(`window.pixels = (c) => c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      window.differing = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.max(Math.abs(a[i]-b[i]), Math.abs(a[i+1]-b[i+1]), Math.abs(a[i+2]-b[i+2])) > 8) n++; return n; };
      window.shot = () => { const c = document.createElement('canvas'); c.width = 160; c.height = 90; c.getContext('2d').drawImage(window.movie.app.canvas, 0, 0, 160, 90); return window.pixels(c); };
      window.settle = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));`);
    await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

run('movie.thumbnail(): a small picture of any frame, the playhead and the canvas untouched (real browser)', () => {
  it('is the picture snapshot() gives, from a cold start, for moving shapes, a 2.5D card, a counter and a time-driven grain', async () => {
    await withPage('', async (cdp) => {
      const r = await cdp.eval(`(async () => { const m = window.movie; const frames = [0, 17, 45, 63, 90, 119]; const out = [];
        for (const f of frames) { const c = await m.thumbnail(f, { width: 160 }); out.push({ f, ok: !!c, w: c && c.width, h: c && c.height, px: c && window.pixels(c) }); }
        const truth = []; await m.peek(async () => { for (const f of frames) { const img = new Image(); img.src = await m.snapshot(f, { scale: 0.25, as: 'dataURL', motionBlur: false }); await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); truth.push(window.pixels(c)); } });
        return out.map((o, i) => ({ f: o.f, ok: o.ok, size: o.w + 'x' + o.h, diff: o.ok ? window.differing(o.px, truth[i]) : -1 })); })()`);
      for (const x of r) { expect(x.ok, `frame ${x.f}`).toBe(true); expect(x.size).toBe('160x90'); expect(x.diff, `frame ${x.f} differs from snapshot`).toBe(0); }
    });
  }, 120_000);

  it('leaves the canvas and the playhead as they were (paused at a frame, and still showing the poster)', async () => {
    for (const query of ['', '?poster=1']) {
      await withPage(query, async (cdp) => {
        const r = await cdp.eval(`(async () => { const m = window.movie; if (!${query === '?poster=1'}) await m.gotoFrame(50, true); await window.settle();
          const frame = m.currentFrame, before = window.shot(); for (let f = 0; f < 120; f += 7) await m.thumbnail(f, { width: 80 }); await window.settle();
          return { sameFrame: m.currentFrame === frame, changed: window.differing(before, window.shot()) }; })()`);
        expect(r.sameFrame, query || 'plain').toBe(true);
        expect(r.changed, `the canvas changed (${query || 'plain'})`).toBe(0);
      });
    }
  }, 120_000);

  it('while the movie plays: the playhead keeps going forward and every picture is still right', async () => {
    await withPage('', async (cdp) => {
      const r = await cdp.eval(`(async () => { const m = window.movie; await m.gotoFrame(0, true); m.play(); let prev = -1, back = 0, made = 0, nulls = 0; const pics = [];
        await new Promise(res => { const end = performance.now() + 1500; const tick = async () => { const f = (made * 11) % 119; const c = await m.thumbnail(f, { width: 80 }); if (c) { made++; if (pics.length < 12) pics.push({ f, px: window.pixels(c) }); } else nulls++; if (m.currentFrame < prev) back++; prev = m.currentFrame; if (performance.now() < end) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
        const advanced = m.currentFrame; m.pause(); await window.settle();
        const here = m.currentFrame, shown = window.shot(); await m.gotoFrame(here, true); await window.settle();
        let wrong = 0; await m.peek(async () => { for (const p of pics) { const img = new Image(); img.src = await m.snapshot(p.f, { scale: 0.125, as: 'dataURL', motionBlur: false }); await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); if (window.differing(p.px, window.pixels(c)) > 0) wrong++; } });
        return { advanced, back, made, nulls, checked: pics.length, wrong, canvasIsThePlayhead: window.differing(shown, window.shot()) }; })()`);
      expect(r.back).toBe(0);
      expect(r.advanced).toBeGreaterThan(30);                 // 1.5 s at 30 fps = 45 frames: the playhead was not held back
      expect(r.made).toBeGreaterThan(10);
      expect(r.checked).toBeGreaterThan(5);
      expect(r.wrong, 'pictures made during playback that differ from snapshot()').toBe(0);
      expect(r.canvasIsThePlayhead, 'the picture on the canvas was the playhead\'s').toBe(0);
    });
  }, 120_000);

  it('is off for a movie that declares variables or has a video layer: thumbnailsOff says why, thumbnail() gives null; a plain movie says null', async () => {
    const reasons: Record<string, unknown> = {};
    for (const [name, query] of [['plain', ''], ['variables', '?vars=1'], ['video', '?video=1']] as const) {
      await withPage(query, async (cdp) => {
        reasons[name] = await cdp.eval(`(async () => { const m = window.movie; return { off: m.thumbnailsOff, picture: (await m.thumbnail(10, { width: 80 })) === null ? 'null' : 'canvas' }; })()`);
      });
    }
    expect(reasons.plain).toEqual({ off: null, picture: 'canvas' });
    expect(reasons.variables).toEqual({ off: 'variables', picture: 'null' });
    expect(reasons.video).toEqual({ off: 'video', picture: 'null' });
  }, 180_000);

  it('gives null while the movie is moving somewhere else (a seek in flight), and a seek right after a thumbnail is not held up', async () => {
    await withPage('', async (cdp) => {
      const r = await cdp.eval(`(async () => { const m = window.movie; const seek = m.gotoFrame(80, true); const during = await m.thumbnail(20, { width: 80 }); await seek;
        const t = m.thumbnail(30, { width: 80 }); const s2 = m.gotoFrame(60, true); await Promise.all([t, s2]); await window.settle();
        const shown = window.shot(); const img = new Image(); img.src = await m.snapshot(60, { scale: 0.25, as: 'dataURL', motionBlur: false }); await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
        return { duringIsNull: during === null, frame: m.currentFrame, canvasDiffers: window.differing(shown, window.pixels(c)) }; })()`);
      expect(r.duringIsNull).toBe(true);
      expect(r.frame).toBe(60);
      expect(r.canvasDiffers, 'the canvas shows frame 60').toBe(0);
    });
  }, 120_000);

  it('started together with a motion-blurred snapshot (time-driven grain), both pictures are what they are when made alone', async () => {
    await withPage('', async (cdp) => {
      const r = await cdp.eval(`(async () => { const m = window.movie; const mb = { samples: 4 };
        const toPx = async (url) => { const img = new Image(); img.src = url; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0); return window.pixels(c); };
        const aloneThumb = window.pixels(await m.thumbnail(10, { width: 160 })); const aloneSnap = await toPx(await m.snapshot(20, { scale: 0.25, as: 'dataURL', motionBlur: mb }));
        const [t, snapUrl] = await Promise.all([m.thumbnail(10, { width: 160 }), m.snapshot(20, { scale: 0.25, as: 'dataURL', motionBlur: mb })]);
        return { thumb: t ? window.differing(window.pixels(t), aloneThumb) : -1, snap: window.differing(await toPx(snapUrl), aloneSnap) }; })()`);
      expect(r.thumb, 'the thumbnail changed').toBe(0);
      expect(r.snap, 'the motion-blurred snapshot changed').toBe(0);
    });
  }, 120_000);

  it('says what is wrong with its options', async () => {
    await withPage('', async (cdp) => {
      const r = await cdp.eval(`(async () => { const m = window.movie; const msgs = []; const w = console.warn; console.warn = (...a) => { msgs.push(a.join(' ')); };
        await m.thumbnail(10, { wdith: 80 }); let thrown = ''; try { await m.thumbnail(10, { width: -5 }); } catch (e) { thrown = String(e.message); } console.warn = w; return { msgs, thrown }; })()`);
      expect(r.msgs.join(' ')).toMatch(/wdith.*did you mean "width"/);
      expect(r.thrown).toMatch(/width must be/);
    });
  }, 120_000);
});
