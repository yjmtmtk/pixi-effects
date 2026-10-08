#!/usr/bin/env node
/**
 * pixi-effects check — review a composition page in ONE command, without driving a browser by hand.
 *
 *   node ai/tools/check.mjs my-video.html            (or:  npx pixi-effects-check my-video.html)
 *
 * It starts a private static server and a private headless Chrome (nothing shared with other sessions), opens the page,
 * waits for `window.__ready === true`, then checks: console warnings / errors, `movie.inspect` over the whole timeline
 * (grouped), `movie.inspectAudio()`, a contact sheet (a PNG you can look at), and a real export (`movie.render`) that it
 * decodes again: video size / length, audio length, loudness per second, silence. Output goes to `check-out/<name>/`
 * (`sheet.png`, `<name>.<format>`, `report.json`; a presentation with `stops` also gets `stops.png`, one picture per stop) and a short summary is printed. Exit code 0 = nothing to fix, 1 = problems.
 *
 * Needs: Node >= 22 (built-in WebSocket), Chrome / Chromium installed (or --chrome PATH / CHROME=PATH). No npm dependencies.
 * The page must follow ai/template.html: it exposes `window.movie` and sets `window.__ready = true` (and `window.__logs`).
 *
 * Options: --draft (the export is a draft: half size, low quality, no motion blur: a much smaller file; the drawing itself is not faster) · --at LIST (pictures at moments you name: 3.5, 50%, f120, title@end → frames/*.png and at.png) ·
 *          --query "a=1&b=2" (added to the page address: for a page that reads it, such as one video of a batch) ·
 *          --onion A:B (one picture of the movement between A and B seconds, frames overlaid: onion.png) ·
 *          --strict (text overlaps and stops where the picture is still changing fail the check; by default they are only listed for review) · --out DIR · --frames N (contact sheet tiles, default 12) · --formats mp4,webm (default mp4) · --no-export ·
 *          --timeout SECONDS (default 240) · --root DIR (static server root; default: the nearest folder above the page with dist/) · --chrome PATH
 */
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ───────────────────────────── pure helpers (unit-tested) ─────────────────────────────

/** Chrome / Chromium executable: $CHROME, then the usual install paths. Null if none is found. */
export function findChrome(env = process.env, exists = fs.existsSync, platform = process.platform) {
  if (env.CHROME && exists(env.CHROME)) return env.CHROME;
  const candidates = platform === 'darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    : platform === 'win32'
      ? [`${env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`, `${env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`, `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`]
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  return candidates.find(c => c && exists(c)) ?? null;
}

export function parseArgs(argv) {
  const o = { page: null, out: null, frames: 12, formats: ['mp4'], export: true, timeout: 240, root: null, chrome: null, strict: false, at: null, draft: false, onion: null, query: null };
  const need = (i, name) => { if (i + 1 >= argv.length) throw new Error(`${name} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = need(i++, a);
    else if (a === '--frames') o.frames = Math.max(1, Math.round(Number(need(i++, a))) || 12);
    else if (a === '--formats') o.formats = need(i++, a).split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--no-export') o.export = false;
    else if (a === '--strict') o.strict = true;
    else if (a === '--draft') o.draft = true;
    else if (a === '--query') o.query = need(i++, a).replace(/^\?/, '');
    else if (a === '--at') o.at = need(i++, a);
    else if (a === '--onion') {
      const m = need(i++, a).match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
      if (!m || !(Number(m[1]) < Number(m[2]))) throw new Error(`--onion must look like 1:3 (seconds, from before to), got "${argv[i]}"`);
      o.onion = [Number(m[1]), Number(m[2])];
    }
    else if (a === '--timeout') o.timeout = Math.max(10, Number(need(i++, a)) || 240);
    else if (a === '--root') o.root = need(i++, a);
    else if (a === '--chrome') o.chrome = need(i++, a);
    else if (a.startsWith('--')) throw new Error(`unknown option ${a} (see the header of check.mjs)`);
    else if (!o.page) o.page = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.wasm': 'application/wasm', '.map': 'application/json', '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

/** A plain static server for `root` (no redirects, so `?query` survives). Resolves { server, port }. */
export function serve(root, onRequest = null, port = 0) {
  const server = http.createServer((req, res) => {
    try {
      if (onRequest && onRequest(req, res)) return;               // a hook (the render tool receives its file this way)
      let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = path.join(root, rel);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
      if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });   // like GitHub Pages: a page with no origin (a sandboxed iframe) may load these files
      fs.createReadStream(file).pipe(res);
    } catch { res.writeHead(500).end(); }
  });
  return new Promise(resolve => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

/** The nearest folder at or above `dir` that contains dist/index.js (the library build), else `dir`. */
export function findRoot(dir, exists = fs.existsSync) {
  for (let d = path.resolve(dir); ; d = path.dirname(d)) {
    if (exists(path.join(d, 'dist', 'index.js'))) return d;
    if (path.dirname(d) === d) return path.resolve(dir);
  }
}

// ───────────────────────────── Chrome DevTools Protocol, minimal ─────────────────────────────

export class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.onmessage = ev => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
      } else if (msg.method) for (const fn of this.listeners) fn(msg);
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  on(fn) { this.listeners.push(fn); }
  /** Run an expression in the page and return its value (JSON-able). Awaits promises. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'page evaluation failed');
    return r.result.value;
  }
}

/** Start a private headless Chrome. `extraArgs`: more command-line flags (the tests use it for `--enable-features=WebMCP`). */
export async function launchChrome(chrome, userDataDir, extraArgs = []) {
  const args = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--window-size=1400,900', ...extraArgs, 'about:blank',
  ];
  // Chrome and its helpers must not outlive this process. A run that is killed or times out never reaches its own cleanup, and a page stuck
  // in an endless loop then burns a CPU core (and holds the audio device) for hours. So a small shell keeps watch: when this process (or the
  // browser) is gone it stops everything that was started with this profile directory. (No shell on Windows: plain spawn there.)
  const watched = process.platform !== 'win32' && fs.existsSync('/bin/sh');
  const stopAll = () => { spawnSync('pkill', ['-KILL', '-f', '--', `--user-data-dir=${userDataDir}`], { stdio: 'ignore' }); };
  const proc = watched
    ? spawn('/bin/sh', ['-c', '"$@" & chrome=$!; owner=$PPID; ( while kill -0 "$owner" 2>/dev/null && kill -0 "$chrome" 2>/dev/null; do sleep 2; done; pkill -KILL -f -- "--user-data-dir=$PE_PROFILE" ) >/dev/null 2>&1 & wait "$chrome"', 'sh', chrome, ...args],
      { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, PE_PROFILE: userDataDir } })
    : spawn(chrome, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  if (watched) proc.kill = () => { stopAll(); return true; };                // the browser, its helpers and the shell: all of them, at once

  const endpoint = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome did not start (no DevTools endpoint within 20 s)')), 20000);
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(t); resolve(m[1]); } });
    proc.on('exit', code => reject(new Error(`Chrome exited early (code ${code})`)));
  });
  const port = new URL(endpoint).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('could not connect to Chrome')); });
  return { proc, cdp: new Cdp(ws) };
}

// ───────────────────────────── in-page scripts ─────────────────────────────

const INFO = `(() => { const m = window.movie; if (!m) return { hasMovie: false, logs: window.__logs || [] };
  const c = document.querySelector('canvas');
  return { hasMovie: true, logs: window.__logs || [], totalFrames: m.totalFrames, frameRate: m.frameRate, duration: m.duration,
           width: m.width ?? (c && c.width), height: m.height ?? (c && c.height), hasAudio: !!m.audioBuffer, hasReview: typeof m.review === 'function' }; })()`;

const exportScript = (format, draft = false) => `(() => {
  window.__x = { state: 'running' };
  (async () => {
    try {
      const blob = await movie.render({ format: ${JSON.stringify(format)}${draft ? ', draft: true' : ''} });
      const info = { bytes: blob.size, type: blob.type };
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.src = url;
      try {
        await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('the exported file has no readable video')); setTimeout(() => rej(new Error('video metadata timed out')), 15000); });
        info.video = { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
      } catch (e) { info.video = { error: String(e.message || e) }; }
      try {
        if (!movie.audioBuffer) throw null;                          // a movie with no sound has no audio track to decode: not an error
        const buf = await new OfflineAudioContext(2, 1, 48000).decodeAudioData(await blob.arrayBuffer());
        const L = buf.getChannelData(0), R = buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0), sr = buf.sampleRate;
        const rmsDb = [];
        let peak = 0;
        for (let s = 0; s < Math.ceil(buf.duration); s++) {
          let sum = 0, n = 0;
          for (let i = Math.floor(s * sr); i < Math.min(L.length, Math.floor((s + 1) * sr)); i++) { sum += L[i] * L[i] + R[i] * R[i]; n += 2; peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); }
          rmsDb.push(Math.round(20 * Math.log10(Math.max(Math.sqrt(sum / Math.max(1, n)), 1e-6)) * 10) / 10);
        }
        info.audio = { duration: Math.round(buf.duration * 1000) / 1000, sampleRate: sr, peakDb: Math.round(20 * Math.log10(Math.max(peak, 1e-6)) * 10) / 10, rmsDbPerSecond: rmsDb };
      } catch (e) { info.audio = e === null ? null : { error: String(e.message || e) }; }
      info.dataUrl = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
      window.__x = { state: 'done', info };
    } catch (e) { window.__x = { state: 'error', message: String((e && e.message) || e) }; }
  })();
  return 0;
})()`;

/** The mix as a picture (in the page, no dependency): loudness per window as bars, the peak as a line, scene edges and the start of every sound. */
const waveformScript = (audio, duration) => `(() => {
  const a = ${JSON.stringify({ windows: audio.windows, scenes: audio.scenes, cues: audio.cues })}, D = ${duration};
  const W = 1200, H = 300, L = 44, R = 12, T = 22, B = 58;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#10131c'; g.fillRect(0, 0, W, H);
  const x = t => L + (t / D) * (W - L - R);
  const y = db => T + (1 - (Math.max(-60, Math.min(0, db)) + 60) / 60) * (H - T - B);
  g.font = '11px system-ui, sans-serif'; g.textBaseline = 'middle';
  for (const db of [0, -12, -24, -36, -48, -60]) {
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(L, y(db)); g.lineTo(W - R, y(db)); g.stroke();
    g.fillStyle = '#9aa5c4'; g.fillText(String(db), 8, y(db));
  }
  const bw = Math.max(1, (W - L - R) / Math.max(1, a.windows.length));
  g.fillStyle = '#7fb4ff';
  for (const w of a.windows) { const top = y(w.rmsDb); g.fillRect(x(w.t), top, Math.max(1, bw - 0.5), (H - B) - top); }
  g.strokeStyle = '#f2c14e'; g.lineWidth = 1; g.beginPath();
  a.windows.forEach((w, i) => { const px = x(w.t) + bw / 2, py = y(w.peakDb); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
  g.stroke();
  if (a.scenes.length > 1 && a.scenes.length <= 16) {
    let lastLabel = -1e9;
    a.scenes.forEach(s => {
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(x(s.from), T - 8); g.lineTo(x(s.from), H - B); g.stroke();
      if (x(s.from) - lastLabel < 70) return;                                    // scenes that start together share one label
      lastLabel = x(s.from);
      g.fillStyle = '#e8ecf8'; g.fillText(s.name.slice(0, 18), x(s.from) + 3, T - 10, Math.max(20, x(s.to) - x(s.from) - 6));
    });
  }
  a.cues.forEach((q, i) => { g.fillStyle = '#ff5a3c'; g.fillRect(x(q.t) - 1, H - B + 2, 2, 8); if (a.cues.length <= 40) g.fillText(String(i + 1), x(q.t) - 3, H - B + 20); });
  g.fillStyle = '#9aa5c4';
  const step = D > 120 ? 30 : D > 40 ? 10 : D > 12 ? 5 : 1;
  for (let t = 0; t <= D + 1e-9; t += step) { g.fillText(t + ' s', x(t) - 8, H - 22); }
  g.fillText('mix level (dBFS): bars = RMS, line = peak; red ticks = when a sound starts', L, H - 7);
  return c.toDataURL('image/png');
})()`;

// ───────────────────────────── the check ─────────────────────────────

export const sleep = ms => new Promise(r => setTimeout(r, ms));
/** A path for display: relative to the cwd when it is inside it, absolute otherwise. */
export const shown = f => { const r = path.relative(process.cwd(), f); return r.startsWith('..') || path.isAbsolute(r) ? f : r; };
const kb = n => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export async function runCheck(opts, log = console.log) {
  const pagePath = path.resolve(opts.page);
  if (!fs.existsSync(pagePath)) throw new Error(`page not found: ${opts.page}`);
  const name = path.basename(pagePath).replace(/\.[^.]+$/, '');
  const outDir = path.resolve(opts.out ?? path.join('check-out', name));
  fs.mkdirSync(outDir, { recursive: true });
  const chrome = opts.chrome ?? findChrome();
  if (!chrome) throw new Error('Chrome / Chromium not found: install it, or set CHROME=/path/to/chrome (or --chrome PATH)');
  const root = path.resolve(opts.root ?? findRoot(path.dirname(pagePath)));
  if (!pagePath.startsWith(root)) throw new Error(`the page must be inside the server root (${root}); use --root`);
  const deadline = Date.now() + opts.timeout * 1000;
  const left = () => { if (Date.now() > deadline) throw new Error(`timed out after ${opts.timeout} s`); };

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixi-effects-check-'));
  const { server, port } = await serve(root);
  let chromeProc = null;
  const report = { page: shown(pagePath), problems: [], files: {} };
  try {
    const { proc, cdp } = await launchChrome(chrome, userDataDir);
    chromeProc = proc;
    const consoleLines = [];
    cdp.on(m => {
      if (m.method === 'Runtime.exceptionThrown') consoleLines.push(`uncaught: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    const t0 = Date.now();
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${path.relative(root, pagePath).split(path.sep).join('/')}${opts.query ? `?${opts.query}` : ''}` });

    // wait for the movie to be ready (or the page to say it failed)
    let info = null;
    for (;;) {
      left();
      await sleep(400);
      try {
        const ready = await cdp.eval('window.__ready === true');
        info = await cdp.eval(INFO);
        const failed = (info.logs || []).some(l => /^(init:|uncaught)/.test(l));
        if (ready || failed || consoleLines.length) break;
      } catch { /* the page is still loading */ }
      if (Date.now() - t0 > 60000) break;
    }
    info = await cdp.eval(INFO).catch(() => info) ?? info;
    report.ready = !!info?.hasMovie && (await cdp.eval('window.__ready === true').catch(() => false));
    report.readySeconds = Math.round((Date.now() - t0) / 100) / 10;
    report.logs = [...new Set([...(info?.logs ?? []), ...consoleLines])];
    if (!report.ready) {
      report.problems.push(`the page did not become ready (window.__ready !== true within 60 s${info?.hasMovie ? '' : '; window.movie is missing'})`);
      return finish(report, outDir, log);
    }
    Object.assign(report, { width: info.width, height: info.height, frameRate: info.frameRate, totalFrames: info.totalFrames, duration: info.duration, hasAudio: info.hasAudio });
    if (report.logs.length) report.problems.push(`${report.logs.length} console warning(s) / error(s) — each says what to change`);

    // the library reviews the movie (layout over the whole timeline, fonts, sound): the same call the Playground and the WebMCP tools make
    if (!info.hasReview) throw new Error("this page's pixi-effects is older than the check tool: use 0.18 or newer (the version in the page's import map)");

    // a mistake in --at or --onion is a usage error: say so now, not after the slow work
    let atList = null;
    if (opts.at) {
      // the page's error is returned as a value: thrown, it would arrive with the page's stack trace
      const r = JSON.parse(await cdp.eval(`(() => { try { return JSON.stringify({ at: movie.resolveAt(${JSON.stringify(opts.at)}) }); } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); } })()`));
      if (r.error) throw new Error(r.error.replace(/^pixi-effects: /, ''));
      atList = r.at;
    }
    if (opts.onion && opts.onion[1] > info.duration + 1e-9) throw new Error(`--onion ${opts.onion[0]}:${opts.onion[1]} goes past the end: the movie is ${info.duration} s`);

    const rv = await cdp.eval(`movie.review(${JSON.stringify({ strict: !!opts.strict })})`);
    report.inspect = { checkedFrames: rv.frames, issues: rv.problems, review: rv.review };
    if (rv.problems.length) report.problems.push(`${rv.problems.length} kind(s) of layout issue from movie.inspect`);
    // fonts: a web font whose file did not load is a problem (the library lists a layer with no available font for review)
    report.fonts = rv.fonts;
    if (rv.fonts.failed.length) report.problems.push(`${rv.fonts.failed.length} web font(s) failed to load: ${rv.fonts.failed.join(', ')} (the layers that use them are drawn in a fallback)`);
    left();

    // contact sheet
    const sheet = await cdp.eval(`movie.contactSheet({ count: ${opts.frames}, as: 'dataURL' })`);
    const sheetFile = path.join(outDir, 'sheet.png');
    fs.writeFileSync(sheetFile, Buffer.from(sheet.slice(sheet.indexOf(',') + 1), 'base64'));
    report.files.sheet = shown(sheetFile);

    // --at: the pictures at moments you name (seconds, 50%, f120, title@end), one file each and one sheet
    if (opts.at) {
      const wanted = atList;
      const framesDir = path.join(outDir, 'frames');
      fs.mkdirSync(framesDir, { recursive: true });
      for (const w of wanted) {
        const png = await cdp.eval(`movie.snapshot(${w.frame}, { as: 'dataURL' })`);
        fs.writeFileSync(path.join(framesDir, `${w.label}.png`), Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
      }
      const atSheet = await cdp.eval(`movie.contactSheet({ frames: ${JSON.stringify(wanted.map(w => w.frame))}, as: 'dataURL' })`);
      const atFile = path.join(outDir, 'at.png');
      fs.writeFileSync(atFile, Buffer.from(atSheet.slice(atSheet.indexOf(',') + 1), 'base64'));
      report.files.at = shown(atFile);
      report.files.frames = shown(framesDir);
      report.at = wanted;
    }

    // --onion A:B: one picture of the movement between A and B seconds (8 frames overlaid, the later the stronger)
    if (opts.onion) {
      const [from, to] = opts.onion;
      const onion = await cdp.eval(`movie.onionSkin({ from: ${from}, to: ${to}, count: 8, as: 'dataURL' })`);
      const onionFile = path.join(outDir, 'onion.png');
      fs.writeFileSync(onionFile, Buffer.from(onion.slice(onion.indexOf(',') + 1), 'base64'));
      report.files.onion = shown(onionFile);
    }

    // a presentation (composition.stops): one picture of every stop, in order, so the pages and steps can be read at a glance
    const stops = await cdp.eval(`(() => { const s = movie.stops || []; return s.length ? { count: s.length, pages: movie.pageCount, items: s.map(x => ({ at: Math.round(x.at * 100) / 100, frame: x.frame, page: x.page, pageStart: x.pageStart, notes: !!x.notes, pdf: x.pdf })) } : null; })()`).catch(() => null);
    if (stops) {
      report.stops = stops;
      // is the picture at each stop still changing? (the audience, the page overview and a PDF would see a half-finished animation)
      const settled = await cdp.eval('movie.inspectStops()').catch(() => null);
      if (settled) {
        report.stops.review = settled.issues;
        report.stops.moving = settled.stops.map(s => Math.round(s.moving * 10000) / 10000);
        if (opts.strict && settled.issues.length) report.problems.push(`${settled.issues.length} stop(s) where the picture is still changing (movie.inspectStops)`);
      }
      const stopsSheet = await cdp.eval(`movie.contactSheet({ frames: movie.stops.map(s => s.frame), as: 'dataURL' })`).catch(() => null);
      if (stopsSheet) {
        const stopsFile = path.join(outDir, 'stops.png');
        fs.writeFileSync(stopsFile, Buffer.from(stopsSheet.slice(stopsSheet.indexOf(',') + 1), 'base64'));
        report.files.stops = shown(stopsFile);
      }
    }

    // the poster: the picture that stands for the movie (its poster time, or the first frame)
    const poster = await cdp.eval(`movie.posterImage({ as: 'dataURL', type: 'image/jpeg', scale: 0.5 })`).catch(() => null);
    if (poster) {
      const posterFile = path.join(outDir, 'poster.jpg');
      fs.writeFileSync(posterFile, Buffer.from(poster.slice(poster.indexOf(',') + 1), 'base64'));
      report.files.poster = shown(posterFile);
    }

    // the timeline: every layer as a bar on a time axis (for a human to open in a browser)
    const timeline = await cdp.eval(`movie.timelineChart({ title: ${JSON.stringify(name)} })`).catch(() => null);
    if (timeline) {
      const timelineFile = path.join(outDir, 'timeline.html');
      fs.writeFileSync(timelineFile, timeline);
      report.files.timeline = shown(timelineFile);
    }

    // audio
    report.audio = info.hasAudio ? rv.audio : null;
    if (report.audio) {
      const wave = await cdp.eval(waveformScript(report.audio, info.duration)).catch(() => null);
      if (wave) {
        const waveFile = path.join(outDir, 'waveform.png');
        fs.writeFileSync(waveFile, Buffer.from(wave.slice(wave.indexOf(',') + 1), 'base64'));
        report.files.waveform = shown(waveFile);
      }
    }
    if (report.audio?.issues?.length) report.problems.push(`${report.audio.issues.length} audio issue(s) from movie.inspectAudio`);

    // export, decoded again
    report.exports = [];
    if (opts.export) {
      for (const format of opts.formats) {
        left();
        await cdp.eval(exportScript(format, opts.draft));
        let state;
        for (;;) {
          left();
          await sleep(500);
          state = await cdp.eval('window.__x && window.__x.state');
          if (state && state !== 'running') break;
        }
        const ex = { format, draft: !!opts.draft };
        if (state === 'error') {
          ex.error = await cdp.eval('window.__x.message');
          report.problems.push(`export ${format} failed: ${ex.error}`);
        } else {
          const meta = await cdp.eval('(() => { const i = window.__x.info; return { bytes: i.bytes, type: i.type, video: i.video, audio: i.audio, length: i.dataUrl.length }; })()');
          let data = '';
          for (let a = 0; a < meta.length; a += 8_000_000) data += await cdp.eval(`window.__x.info.dataUrl.slice(${a}, ${a + 8_000_000})`);
          const file = path.join(outDir, `${name}.${format}`);
          fs.writeFileSync(file, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64'));
          report.files[format] = shown(file);
          Object.assign(ex, { bytes: meta.bytes, video: meta.video, audio: meta.audio });
          if (meta.video?.error) report.problems.push(`export ${format}: ${meta.video.error}`);
          else if (Math.abs(meta.video.duration - info.duration) > 0.15) report.problems.push(`export ${format}: the video is ${meta.video.duration.toFixed(2)} s, the movie ${info.duration} s`);
          if (info.hasAudio) {
            if (meta.audio?.error) report.problems.push(`export ${format}: the movie has audio but the file's audio could not be decoded (${meta.audio.error})`);
            else if (meta.audio && Math.abs(meta.audio.duration - info.duration) > 0.15) report.problems.push(`export ${format}: the audio is ${meta.audio.duration} s, the movie ${info.duration} s`);
            else if (meta.audio && meta.audio.rmsDbPerSecond.every(db => db < -60)) report.problems.push(`export ${format}: the exported audio is silent`);
          }
        }
        report.exports.push(ex);
      }
    }
    return finish(report, outDir, log);
  } finally {
    try { chromeProc?.kill(); } catch { /* already gone */ }
    server.close();
    await sleep(200);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
  }
}

function finish(report, outDir, log) {
  const reportFile = path.join(outDir, 'report.json');
  report.files.report = shown(reportFile);
  report.ok = report.problems.length === 0;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  const L = [];
  L.push(`pixi-effects check — ${report.page}`);
  if (report.ready) L.push(`  page      ready in ${report.readySeconds} s · ${report.width}×${report.height} · ${report.frameRate} fps · ${report.totalFrames} frames (${report.duration} s)${report.hasAudio ? ' · audio' : ''}`);
  else L.push('  page      NOT READY');
  L.push(`  warnings  ${report.logs?.length ? report.logs.length + ' — ' + report.logs.slice(0, 5).map(l => l.length > 220 ? l.slice(0, 217) + '…' : l).join('\n            ') + (report.logs.length > 5 ? `\n            … ${report.logs.length - 5} more (report.json)` : '') : 'none'}`);
  if (report.inspect) {
    const g = report.inspect.issues;
    const line = i => `            - ${i.message}${i.count > 1 ? `  [${i.count} frames, ${i.firstFrame}–${i.lastFrame}]` : `  [frame ${i.firstFrame}]`}`;
    L.push(`  layout    ${g.length ? g.length + ' kind(s) of issue over ' + report.inspect.checkedFrames + ' frames:' : 'no cut-off / off-canvas text over ' + report.inspect.checkedFrames + ' frames (movie.inspect)'}`);
    for (const i of g.slice(0, 8)) L.push(line(i));
    if (g.length > 8) L.push(`            … ${g.length - 8} more (report.json)`);
    const rv = report.inspect.review;
    if (rv.length) {
      L.push(`  review    ${rv.length} to look at — text overlaps are often intentional (ghost / glow copies, per-letter boxes, a wipe), and a font that is not available is drawn in a fallback; check them on the contact sheet, or use --strict to fail on them:`);
      for (const i of rv.slice(0, 4)) L.push(line(i));
      if (rv.length > 4) L.push(`            … ${rv.length - 4} more (report.json)`);
    }
  }
  if (report.stops) {
    const s = report.stops;
    L.push(`  stops     ${s.count} stop(s) on ${s.pages} page(s) — stops.png shows each one in order; the picture at a stop is what the audience sees while it waits`);
    if (s.review?.length) {
      L.push(`  review    ${s.review.length} stop(s) where the picture is still changing (may be on purpose, e.g. something always moving; use --strict to fail on them):`);
      for (const r of s.review.slice(0, 4)) L.push(`            - ${r}`);
      if (s.review.length > 4) L.push(`            … ${s.review.length - 4} more (report.json)`);
    } else if (s.review) L.push('  settled   every stop is a settled picture (movie.inspectStops)');
  }
  if (report.audio !== undefined) {
    const a = report.audio;
    L.push(a ? `  audio     ${a.sources.length} source(s) · mix peak ${a.peakDb} dBFS · ${a.loudness?.integratedLufs ?? 'n/a'} LUFS · true peak ${a.loudness?.truePeakDb ?? 'n/a'} dBTP · ${a.issues.length ? a.issues.join(' | ') : 'no issues (movie.inspectAudio)'}` : '  audio     none');
    for (const n of a?.notes ?? []) L.push(`  note      ${n}`);
  }
  for (const ex of report.exports ?? []) {
    if (ex.error) { L.push(`  export    ${ex.format}: FAILED — ${ex.error}`); continue; }
    const v = ex.video?.error ? `video: ${ex.video.error}` : `video ${ex.video.duration.toFixed(2)} s ${ex.video.width}×${ex.video.height}`;
    const au = ex.audio ? (ex.audio.error ? `audio: ${ex.audio.error}` : `audio ${ex.audio.duration} s, peak ${ex.audio.peakDb} dBFS, rms/s [${ex.audio.rmsDbPerSecond.join(' ')}]`) : 'no audio track';
    L.push(`  export    ${ex.format}${ex.draft ? ' (draft)' : ''} ok · ${kb(ex.bytes)} · ${v} · ${au}`);
  }
  L.push(`  files     ${Object.values(report.files).join('  ')}`);
  L.push(report.problems.length ? `RESULT: ${report.problems.length} PROBLEM(S)\n  - ${report.problems.join('\n  - ')}` : 'RESULT: OK — nothing to fix. Look at the contact sheet before you call it done.');
  log(L.join('\n'));
  return report;
}

// ───────────────────────────── CLI ─────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (typeof WebSocket === 'undefined') throw new Error('Node >= 22 is needed (built-in WebSocket)');
    const opts = parseArgs(process.argv.slice(2));
    if (!opts.page) {
      console.error('usage: node ai/tools/check.mjs <page.html> [--out DIR] [--frames N] [--formats mp4,webm] [--no-export] [--draft] [--at 3.5,title@end] [--onion 1:3] [--query a=1&b=2] [--timeout S] [--root DIR] [--chrome PATH]');
      process.exit(2);
    }
    const report = await runCheck(opts);
    process.exit(report.ok ? 0 : 1);
  } catch (e) {
    console.error(`pixi-effects check failed: ${e.message}`);
    process.exit(2);
  }
}
