#!/usr/bin/env node
// Plays a sample page like a person would, one frame at a time, and writes what the screen shows: a clip for the promo.
//   node examples/interactive/promo/capture.mjs <scene> [--frames N] [--only a:b]      (after `npm run build`)
// Nothing runs in real time: the page's movie is paused and stepped, the cursor is drawn by this script, and every click, key, slider move
// and scroll is a real event on the real page, so what the clip shows is what the page really does. Clips go to promo/clips/<scene>.mp4.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome, findRoot, serve, launchChrome, sleep } from '../../../ai/tools/check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = findRoot(here);
const FPS = 30, VIEW = { width: 1440, height: 810 }, SCALE = 4 / 3;                  // 1440 x 810 CSS pixels at 4/3 = a 1920 x 1080 picture

const sceneId = process.argv[2];
const flag = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const { SCENES } = await import(pathToFileURL(path.join(here, 'scenes.mjs')).href);
const scene = SCENES[sceneId];
if (!scene) { console.error(`scene "${sceneId}" is not one of: ${Object.keys(SCENES).join(', ')}`); process.exit(2); }
const total = flag('--frames') ? Number(flag('--frames')) : Math.round(scene.seconds * FPS);
const [only0, only1] = flag('--only') ? flag('--only').split(':').map(Number) : [0, total];

const ease = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - ((-2 * x + 2) ** 3) / 2);
const framesDir = path.join(here, 'frames', sceneId);
fs.rmSync(framesDir, { recursive: true, force: true });
fs.mkdirSync(framesDir, { recursive: true });

const { server, port } = await serve(root);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-promo-'));
const { proc, cdp } = await launchChrome(findChrome(), userDataDir);
const ev = (js) => cdp.eval(js);
try {
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { ...VIEW, deviceScaleFactor: SCALE, mobile: false });
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/interactive/${scene.page}.html${scene.query ?? ''}` });
  for (let i = 0; i < 200; i++) { if (await ev('window.__ready === true').catch(() => false)) break; await sleep(300); }
  await sleep(600);
  // the page's movie is stepped by this script, never by the clock; the cursor and a ripple are drawn on top
  await ev(`(() => {
    movie.pause(); movie.play = () => {}; window.__noRealtime = true;
    const style = document.createElement('style');
    style.textContent = '.sound-hint{display:none!important} .movie-controller{--mc-idle:0} * { caret-color: #fff }';
    document.head.append(style);
    const cur = document.createElement('div'); cur.id = '__cursor';
    cur.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;pointer-events:none;width:32px;height:32px;will-change:transform';
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="32" height="32"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.7 L11 13.2 L18 13 Z" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    const rip = document.createElement('div'); rip.id = '__ripple';
    rip.style.cssText = 'position:fixed;left:0;top:0;z-index:99998;pointer-events:none;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;border:4px solid #fff;opacity:0';
    document.body.append(rip, cur);
    window.__cursor = (x, y) => { cur.style.transform = 'translate(' + x + 'px,' + y + 'px)'; };
    window.__ripple = (x, y, k) => { rip.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + (0.3 + k * 1.2) + ')'; rip.style.opacity = String(k > 0 && k < 1 ? 1 - k : 0); };
    window.__settle = async () => { for (let i = 0; i < 40; i++) { const r = movie._rebuildRun; if (!r && !movie._rebuildNext) break; await Promise.race([r, new Promise(res => setTimeout(res, 50))]); } await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); };
  })()`);

  const api = {
    ev,
    center: async (sel, dx = 0, dy = 0) => { const r = await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; })()`); return [r[0] + dx, r[1] + dy]; },
    rect: (sel) => ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { left: b.left, top: b.top, width: b.width, height: b.height }; })()`),
  };
  const plan = await scene.plan(api);                      // { cursor: [{ t, x, y }], clicks: [t…], acts: [{ t, d?, run(page, k, i) }], inner(i, t) → frame | null }

  fs.mkdirSync(path.join(here, 'clips'), { recursive: true });
  if (plan.meta) fs.writeFileSync(path.join(here, 'clips', `${sceneId}.json`), JSON.stringify(plan.meta, null, 2));   // where things are on screen, for the promo to point at them
  let doneActs = new Set();
  for (let i = 0; i < total; i++) {
    const t = i / FPS;
    // cursor: eased between the waypoints
    const wp = plan.cursor;
    let x = wp[0].x, y = wp[0].y;
    for (let k = 0; k < wp.length; k++) {
      if (t >= wp[k].t) { x = wp[k].x; y = wp[k].y; }
      if (k + 1 < wp.length && t >= wp[k].t && t < wp[k + 1].t) { const u = ease((t - wp[k].t) / (wp[k + 1].t - wp[k].t)); x = wp[k].x + (wp[k + 1].x - wp[k].x) * u; y = wp[k].y + (wp[k + 1].y - wp[k].y) * u; }
    }
    let ripple = 0, rx = x, ry = y;
    for (const c of plan.clicks ?? []) if (t >= c.t && t < c.t + 0.45) { ripple = (t - c.t) / 0.45; rx = c.x ?? x; ry = c.y ?? y; }
    await ev(`__cursor(${x.toFixed(1)}, ${y.toFixed(1)}); __ripple(${rx.toFixed(1)}, ${ry.toFixed(1)}, ${ripple.toFixed(3)})`);
    // acts: once at their time, or every frame while they last
    for (const [n, a] of plan.acts.entries()) {
      const d = a.d ?? 0;
      if (d === 0 ? (t >= a.t && !doneActs.has(n)) : (t >= a.t && t <= a.t + d + 1e-6)) {
        doneActs.add(n);
        await a.run(api, d === 0 ? 1 : Math.min(1, (t - a.t) / d), i);
      }
    }
    const f = plan.inner ? plan.inner(i, t) : null;
    if (f !== null && f !== undefined) await ev(`movie.gotoFrame(${Math.round(f)}, true)`);
    await ev('__settle()');
    await ev(`document.querySelectorAll('.movie-controller').forEach(e => e.setAttribute('data-state', 'visible'))`);
    if (i >= only0 && i < only1) {
      const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93 });
      fs.writeFileSync(path.join(framesDir, `${String(i).padStart(5, '0')}.jpg`), Buffer.from(shot.data, 'base64'));
    }
    if (i % 30 === 0) process.stdout.write(`\r${sceneId}: ${i}/${total}`);
  }
  process.stdout.write('\n');
} finally { try { proc.kill(); } catch { /* gone */ } server.close(); await sleep(200); fs.rmSync(userDataDir, { recursive: true, force: true }); }

const clips = path.join(here, 'clips'); fs.mkdirSync(clips, { recursive: true });
const out = path.join(clips, `${sceneId}.mp4`);
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-start_number', String(only0), '-i', path.join(framesDir, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(1);
console.log(`wrote ${path.relative(root, out)} (${total} frames)`);
