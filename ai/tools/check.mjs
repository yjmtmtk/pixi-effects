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
 * Options: --strict (text overlaps fail the check; by default they are only listed for review) · --out DIR · --frames N (contact sheet tiles, default 12) · --formats mp4,webm (default mp4) · --no-export ·
 *          --timeout SECONDS (default 240) · --root DIR (static server root; default: the nearest folder above the page with dist/) · --chrome PATH
 */
import { spawn } from 'node:child_process';
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
  const o = { page: null, out: null, frames: 12, formats: ['mp4'], export: true, timeout: 240, root: null, chrome: null, strict: false };
  const need = (i, name) => { if (i + 1 >= argv.length) throw new Error(`${name} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = need(i++, a);
    else if (a === '--frames') o.frames = Math.max(1, Math.round(Number(need(i++, a))) || 12);
    else if (a === '--formats') o.formats = need(i++, a).split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--no-export') o.export = false;
    else if (a === '--strict') o.strict = true;
    else if (a === '--timeout') o.timeout = Math.max(10, Number(need(i++, a)) || 240);
    else if (a === '--root') o.root = need(i++, a);
    else if (a === '--chrome') o.chrome = need(i++, a);
    else if (a.startsWith('--')) throw new Error(`unknown option ${a} (see the header of check.mjs)`);
    else if (!o.page) o.page = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  return o;
}

/** [{ frame, issues[] }] → [{ message, count, firstFrame, lastFrame }]: issues that differ only by numbers are one. */
export function groupIssues(perFrame) {
  const groups = new Map();
  for (const { frame, issues } of perFrame) {
    for (const message of issues) {
      const key = message.replace(/-?\d+(\.\d+)?/g, '#');
      const g = groups.get(key);
      if (g) { g.count++; g.lastFrame = frame; }
      else groups.set(key, { message, count: 1, firstFrame: frame, lastFrame: frame });
    }
  }
  return [...groups.values()];
}

/**
 * Layout issues → { problems, review }. Cut off by an edge, outside the canvas and "no size" are exact: problems. Text that
 * overlaps text is judged on layout boxes, not ink, so intentional designs trip it (ghost layers, a glow copy under a title,
 * per-letter boxes, a wipe between two scenes: 7 of 30 gallery pieces): those are `review` items to look at on the contact
 * sheet. `strict` makes every issue a problem.
 */
export function splitIssues(groups, strict = false) {
  if (strict) return { problems: groups, review: [] };
  const overlap = g => /\boverlap\b/.test(g.message);
  return { problems: groups.filter(g => !overlap(g)), review: groups.filter(overlap) };
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
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
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

export async function launchChrome(chrome, userDataDir) {
  const proc = spawn(chrome, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--window-size=1400,900', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
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
           width: m.width ?? (c && c.width), height: m.height ?? (c && c.height), hasAudio: !!m.audioBuffer }; })()`;

const sweepScript = stride => `(async () => {
  const total = movie.totalFrames, frames = new Set([0, total]);
  for (let f = 0; f <= total; f += ${stride}) frames.add(Math.min(f, total));
  const perFrame = [];
  for (const f of [...frames].sort((a, b) => a - b)) {
    const r = await movie.inspect(f, { layers: 'none' });
    if (r.issues.length) perFrame.push({ frame: f, issues: r.issues });
  }
  return { checked: frames.size, perFrame };
})()`;

const exportScript = format => `(() => {
  window.__x = { state: 'running' };
  (async () => {
    try {
      const blob = await movie.render({ format: ${JSON.stringify(format)} });
      const info = { bytes: blob.size, type: blob.type };
      const url = URL.createObjectURL(blob);
      const v = document.createElement('video'); v.muted = true; v.preload = 'metadata'; v.src = url;
      try {
        await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('the exported file has no readable video')); setTimeout(() => rej(new Error('video metadata timed out')), 15000); });
        info.video = { duration: v.duration, width: v.videoWidth, height: v.videoHeight };
      } catch (e) { info.video = { error: String(e.message || e) }; }
      try {
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
      } catch (e) { info.audio = { error: String(e.message || e) }; }
      info.dataUrl = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); });
      window.__x = { state: 'done', info };
    } catch (e) { window.__x = { state: 'error', message: String((e && e.message) || e) }; }
  })();
  return 0;
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
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${path.relative(root, pagePath).split(path.sep).join('/')}` });

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

    // layout: inspect over the whole timeline
    const stride = Math.max(1, Math.round(info.totalFrames / 60));
    const sweep = await cdp.eval(sweepScript(stride));
    const grouped = splitIssues(groupIssues(sweep.perFrame), opts.strict);
    report.inspect = { checkedFrames: sweep.checked, issues: grouped.problems, review: grouped.review };
    if (grouped.problems.length) report.problems.push(`${grouped.problems.length} kind(s) of layout issue from movie.inspect`);
    left();

    // contact sheet
    const sheet = await cdp.eval(`movie.contactSheet({ count: ${opts.frames}, as: 'dataURL' })`);
    const sheetFile = path.join(outDir, 'sheet.png');
    fs.writeFileSync(sheetFile, Buffer.from(sheet.slice(sheet.indexOf(',') + 1), 'base64'));
    report.files.sheet = shown(sheetFile);

    // a presentation (composition.stops): one picture of every stop, in order, so the pages and steps can be read at a glance
    const stops = await cdp.eval(`(() => { const s = movie.stops || []; return s.length ? { count: s.length, pages: movie.pageCount, items: s.map(x => ({ at: Math.round(x.at * 100) / 100, frame: x.frame, page: x.page, pageStart: x.pageStart, notes: !!x.notes, pdf: x.pdf })) } : null; })()`).catch(() => null);
    if (stops) {
      report.stops = stops;
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
    report.audio = info.hasAudio ? await cdp.eval('movie.inspectAudio()') : null;
    if (report.audio?.issues?.length) report.problems.push(`${report.audio.issues.length} audio issue(s) from movie.inspectAudio`);

    // export, decoded again
    report.exports = [];
    if (opts.export) {
      for (const format of opts.formats) {
        left();
        await cdp.eval(exportScript(format));
        let state;
        for (;;) {
          left();
          await sleep(500);
          state = await cdp.eval('window.__x && window.__x.state');
          if (state && state !== 'running') break;
        }
        const ex = { format };
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
      L.push(`  review    ${rv.length} text overlap(s) — often intentional (ghost / glow copies, per-letter boxes, a wipe); check them on the contact sheet, or use --strict to fail on them:`);
      for (const i of rv.slice(0, 4)) L.push(line(i));
      if (rv.length > 4) L.push(`            … ${rv.length - 4} more (report.json)`);
    }
  }
  if (report.stops) {
    const s = report.stops;
    L.push(`  stops     ${s.count} stop(s) on ${s.pages} page(s) — stops.png shows each one in order; the picture at a stop is what the audience sees while it waits`);
  }
  if (report.audio !== undefined) {
    const a = report.audio;
    L.push(a ? `  audio     ${a.sources.length} source(s) · mix peak ${a.peakDb} dBFS · ${a.issues.length ? a.issues.join(' | ') : 'no issues (movie.inspectAudio)'}` : '  audio     none');
  }
  for (const ex of report.exports ?? []) {
    if (ex.error) { L.push(`  export    ${ex.format}: FAILED — ${ex.error}`); continue; }
    const v = ex.video?.error ? `video: ${ex.video.error}` : `video ${ex.video.duration.toFixed(2)} s ${ex.video.width}×${ex.video.height}`;
    const au = ex.audio ? (ex.audio.error ? `audio: ${ex.audio.error}` : `audio ${ex.audio.duration} s, peak ${ex.audio.peakDb} dBFS, rms/s [${ex.audio.rmsDbPerSecond.join(' ')}]`) : 'no audio track';
    L.push(`  export    ${ex.format} ok · ${kb(ex.bytes)} · ${v} · ${au}`);
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
      console.error('usage: node ai/tools/check.mjs <page.html> [--out DIR] [--frames N] [--formats mp4,webm] [--no-export] [--timeout S] [--root DIR] [--chrome PATH]');
      process.exit(2);
    }
    const report = await runCheck(opts);
    process.exit(report.ok ? 0 : 1);
  } catch (e) {
    console.error(`pixi-effects check failed: ${e.message}`);
    process.exit(2);
  }
}
