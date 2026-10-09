#!/usr/bin/env node
/**
 * pixi-effects render — turn a composition page into a video file, headless, in ONE command.
 *
 *   node ai/tools/render.mjs my-video.html -o my-video.mp4        (or:  npx pixi-effects-render my-video.html -o out.mp4)
 *
 * It starts a private static server and a private headless Chrome, opens the page, waits for `window.__ready === true`
 * (the contract of skills/pixi-effects/template.html), runs `movie.render()` in the page and streams the file to disk. Nothing is decoded or
 * reviewed: that is `pixi-effects-check`'s job. Use this one to produce the file (a script, CI, a batch).
 *
 * Needs: Node >= 22 (built-in WebSocket), Chrome / Chromium installed (or CHROME=PATH / --chrome PATH). No npm dependencies.
 * Exit code: 0 = the file was written, 1 = the page or the render failed (no file), 2 = bad usage.
 *
 * Options: -o, --out FILE (default ./<page name>.<format>; the container follows the extension: mp4 webm mov mkv) ·
 *          --format mp4|webm|mov|mkv|pdf (a .pdf is the deck as pages: one picture per page of a movie with `stops`; --all-stops makes a page of every stop) · --quality very-low|low|medium|high|very-high (video and audio bitrate, default high) ·
 *          --range A:B (only seconds A to B; 2: runs to the end, :5 starts at the beginning) · --scene NAME (the span of a top-level layer: a movie's scene) · --scale S (output size, 0 < S <= 1: smaller picture, smaller file) ·
 *          --draft (for looking: half size, low quality, no motion blur; a --quality you give still wins) ·
 *          --motion-blur SAMPLES (2-64: each frame is drawn that many times over the shutter and averaged; overrides the page's own motionBlur) ·
 *          --shutter FRACTION (with --motion-blur: how long the shutter is open, 0-1 of a frame, default 0.5) ·
 *          --video-codec C · --audio-codec C · --query "a=1&b=2" (added to the page URL) · --fail-on-warn (exit 1 when the page
 *          logged a warning; the file is still written) · --quiet (no progress line) · --timeout SECONDS (default 900) ·
 *          --root DIR (static server root; default: the nearest folder above the page with dist/) · --chrome PATH
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { findChrome, findRoot, serve, launchChrome, shown, sleep } from './check.mjs';

const FORMATS = ['mp4', 'webm', 'mov', 'mkv', 'pdf'];
const QUALITIES = ['very-low', 'low', 'medium', 'high', 'very-high'];

/** 'clip.WEBM' → 'webm'; no extension → null; any other extension is an error. */
export function formatFromPath(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  if (!ext) return null;
  if (!FORMATS.includes(ext)) throw new Error(`cannot tell the container from ".${ext}": use an output ending in mp4, webm, mov, mkv or pdf (or --format)`);
  return ext;
}

export function defaultOutput(page, format) {
  return path.resolve(path.basename(page).replace(/\.[^.]+$/, '') + '.' + format);
}

export function parseRenderArgs(argv) {
  const o = { range: null, scene: null, scale: null, draft: false, qualityGiven: false, page: null, out: null, format: null, quality: 'high', videoCodec: null, audioCodec: null, allStops: false, motionBlur: null, shutter: null, query: null, failOnWarn: false, quiet: false, timeout: 900, root: null, chrome: null };
  const need = (i, name) => { if (i + 1 >= argv.length) throw new Error(`${name} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o' || a === '--out') o.out = need(i++, a);
    else if (a === '--format') {
      o.format = need(i++, a).toLowerCase();
      if (!FORMATS.includes(o.format)) throw new Error(`--format must be mp4, webm, mov, mkv or pdf (got "${o.format}")`);
    } else if (a === '--quality') {
      o.qualityGiven = true;
      o.quality = need(i++, a);
      if (!QUALITIES.includes(o.quality)) throw new Error(`--quality must be very-low, low, medium, high or very-high (got "${o.quality}")`);
    } else if (a === '--video-codec') o.videoCodec = need(i++, a);
    else if (a === '--audio-codec') o.audioCodec = need(i++, a);
    else if (a === '--motion-blur') {
      o.motionBlur = Number(need(i++, a));
      if (!(Number.isInteger(o.motionBlur) && o.motionBlur >= 2 && o.motionBlur <= 64)) throw new Error(`--motion-blur must be a whole number of samples from 2 to 64 (got "${argv[i]}")`);
    } else if (a === '--shutter') {
      o.shutter = Number(need(i++, a));
      if (!(o.shutter > 0 && o.shutter <= 1)) throw new Error(`--shutter must be above 0 and at most 1 (0.5 is a 180° shutter), got "${argv[i]}"`);
    } else if (a === '--range') {
      const m = need(i++, a).match(/^(\d+(?:\.\d+)?)?:(\d+(?:\.\d+)?)?$/);
      if (!m || (m[1] === undefined && m[2] === undefined)) throw new Error(`--range must look like 2:5 (seconds; 2: runs to the end, :5 starts at the beginning), got "${argv[i]}"`);
      o.range = [m[1] === undefined ? null : Number(m[1]), m[2] === undefined ? null : Number(m[2])];
      if (o.range[0] !== null && o.range[1] !== null && !(o.range[0] < o.range[1])) throw new Error(`--range ${argv[i]}: it must start before it ends (2:5 is seconds 2 to 5)`);
    } else if (a === '--scene') o.scene = need(i++, a);
    else if (a === '--scale') {
      o.scale = Number(need(i++, a));
      if (!(o.scale > 0 && o.scale <= 1)) throw new Error(`--scale must be above 0 and at most 1 (0.5 is half size), got "${argv[i]}"`);
    } else if (a === '--draft') o.draft = true;
    else if (a === '--query') o.query = need(i++, a).replace(/^\?/, '');
    else if (a === '--all-stops') o.allStops = true;
    else if (a === '--fail-on-warn') o.failOnWarn = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--timeout') o.timeout = Math.max(10, Number(need(i++, a)) || 900);
    else if (a === '--root') o.root = need(i++, a);
    else if (a === '--chrome') o.chrome = need(i++, a);
    else if (a.startsWith('-')) throw new Error(`unknown option ${a} (see the header of render.mjs)`);
    else if (!o.page) o.page = a;
    else throw new Error(`unexpected argument ${a}`);
  }
  if (o.shutter !== null && o.motionBlur === null) throw new Error('--shutter goes with --motion-blur SAMPLES');
  if (o.allStops && o.format !== 'pdf' && !(o.out && formatFromPath(o.out) === 'pdf')) throw new Error('--all-stops goes with a PDF (-o deck.pdf)');
  o.format ??= (o.out ? formatFromPath(o.out) : null) ?? 'mp4';
  if (o.range && o.scene !== null) throw new Error('--range and --scene cannot be used together: a scene is a range');
  if (o.format === 'pdf' && (o.range || o.scene !== null || o.scale !== null || o.draft)) throw new Error('--range, --scene, --scale and --draft are not for a PDF (a PDF is the pages of a deck)');
  return o;
}

const UPLOAD = '/__pixi_effects_out';
const kb = n => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** The page's side: render, and PUT the Blob to our server (so a long video never goes through base64). */
const renderScript = (format, quality, videoCodec, audioCodec, motionBlur, shutter, allStops, part = {}) => `(() => {
  window.__r = { state: 'running', progress: 0 };
  movie.on('progress', e => { window.__r.progress = e.progress; });
  (async () => {
    try {
      const video = { ${[part.draft && !part.qualityGiven ? null : `bitrate: ${JSON.stringify(quality)}`, videoCodec ? `codec: ${JSON.stringify(videoCodec)}` : null].filter(Boolean).join(', ')} };
      const audio = { bitrate: ${JSON.stringify(quality)}${audioCodec ? `, codec: ${JSON.stringify(audioCodec)}` : ''} };
      const blob = ${JSON.stringify(format)} === 'pdf'
        ? await movie.exportPDF({ which: ${allStops ? "'stops'" : "'pages'"}, title: document.title })
        : await movie.render({ format: ${JSON.stringify(format)}, video, audio${part.range ? `, range: [${part.range[0] ?? 0}, ${part.range[1] ?? 'movie.duration'}]` : ''}${part.scene ? `, range: ${JSON.stringify(part.scene)}` : ''}${part.scale ? `, scale: ${part.scale}` : ''}${part.draft ? ', draft: true' : ''}${motionBlur ? `, motionBlur: { samples: ${motionBlur}${shutter ? `, shutter: ${shutter}` : ''} }` : ''} });
      const res = await fetch(${JSON.stringify(UPLOAD)}, { method: 'PUT', body: blob });
      if (!res.ok) throw new Error('could not hand the file to the command (' + res.status + ')');
      window.__r = { state: 'done', bytes: blob.size, type: blob.type };
    } catch (e) { window.__r = { state: 'error', message: String((e && e.message) || e) }; }
  })();
  return 0;
})()`;

export async function runRender(opts, log = console.log, progress = () => {}) {
  const pagePath = path.resolve(opts.page);
  if (!fs.existsSync(pagePath)) throw new Error(`page not found: ${opts.page}`);
  const out = path.resolve(opts.out ?? defaultOutput(pagePath, opts.format));
  const chrome = opts.chrome ?? findChrome();
  if (!chrome) throw new Error('Chrome / Chromium not found: install it, or set CHROME=/path/to/chrome (or --chrome PATH)');
  const root = path.resolve(opts.root ?? findRoot(path.dirname(pagePath)));
  if (!pagePath.startsWith(root)) throw new Error(`the page must be inside the server root (${root}); use --root`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const part = out + '.part';
  const deadline = Date.now() + opts.timeout * 1000;
  const left = () => { if (Date.now() > deadline) throw new Error(`timed out after ${opts.timeout} s`); };

  let written = 0;
  const upload = (req, res) => {
    if (req.method !== 'PUT' || !req.url.startsWith(UPLOAD)) return false;
    const ws = fs.createWriteStream(part);
    req.pipe(ws);
    ws.on('finish', () => { written = ws.bytesWritten; res.writeHead(204).end(); });
    ws.on('error', () => res.writeHead(500).end());
    return true;
  };

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixi-effects-render-'));
  const { server, port } = await serve(root, upload);
  let chromeProc = null;
  const result = { page: shown(pagePath), file: null, logs: [], problems: [] };
  try {
    const { proc, cdp } = await launchChrome(chrome, userDataDir);
    chromeProc = proc;
    const consoleLines = [];
    cdp.on(m => { if (m.method === 'Runtime.exceptionThrown') consoleLines.push(`uncaught: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`); });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    const url = `http://127.0.0.1:${port}/${path.relative(root, pagePath).split(path.sep).join('/')}${opts.query ? '?' + opts.query : ''}`;
    const t0 = Date.now();
    await cdp.send('Page.navigate', { url });

    let info = null;
    for (;;) {
      left();
      await sleep(300);
      try {
        const ready = await cdp.eval('window.__ready === true');
        info = await cdp.eval(`(() => { const m = window.movie; return { hasMovie: !!m, logs: window.__logs || [], duration: m && m.duration, totalFrames: m && m.totalFrames, width: m && m.width, height: m && m.height, frameRate: m && m.frameRate }; })()`);
        if (ready || (info.logs || []).some(l => /^(init|uncaught)/.test(l)) || consoleLines.length) break;
      } catch { /* the page is still loading */ }
      if (Date.now() - t0 > 60000) break;
    }
    const ready = await cdp.eval('window.__ready === true').catch(() => false);
    result.logs = [...new Set([...(info?.logs ?? []), ...consoleLines])];
    if (!ready || !info?.hasMovie) {
      result.problems.push(`the page did not become ready (window.__ready !== true${info?.hasMovie ? '' : '; window.movie is missing'})${result.logs.length ? ': ' + result.logs[0] : ''}`);
      return result;
    }
    Object.assign(result, { duration: info.duration, frames: info.totalFrames, width: info.width, height: info.height, frameRate: info.frameRate });

    await cdp.eval(renderScript(opts.format, opts.quality, opts.videoCodec, opts.audioCodec, opts.motionBlur, opts.shutter, opts.allStops, { range: opts.range, scene: opts.scene, scale: opts.scale, draft: opts.draft, qualityGiven: opts.qualityGiven }));
    let state;
    for (;;) {
      left();
      await sleep(400);
      const r = await cdp.eval('window.__r');
      state = r.state;
      progress(r.progress ?? 0);
      if (state !== 'running') { result.render = r; break; }
    }
    result.logs = [...new Set([...result.logs, ...(await cdp.eval('window.__logs || []').catch(() => []))])];
    if (state === 'error') { result.problems.push(`render failed: ${result.render.message}`); return result; }
    if (!written) { result.problems.push('the render finished but no file reached the command'); return result; }
    fs.renameSync(part, out);
    result.file = out;
    result.bytes = written;
    result.seconds = Math.round((Date.now() - t0) / 100) / 10;
    return result;
  } finally {
    try { chromeProc?.kill(); } catch { /* already gone */ }
    server.close();
    await sleep(200);
    try { fs.rmSync(part, { force: true }); } catch { /* nothing to clean */ }
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
  }
}

// ───────────────────────────── CLI ─────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (typeof WebSocket === 'undefined') throw new Error('Node >= 22 is needed (built-in WebSocket)');
    const opts = parseRenderArgs(process.argv.slice(2));
    if (!opts.page) {
      console.error('usage: node ai/tools/render.mjs <page.html> [-o out.mp4] [--format mp4|webm|mov|mkv|pdf] [--range A:B | --scene NAME] [--scale S] [--draft] [--quality very-low|low|medium|high|very-high] [--query a=1] [--fail-on-warn] [--quiet] [--timeout S] [--root DIR] [--chrome PATH]');
      process.exit(2);
    }
    let last = -1;
    const progress = p => {
      if (opts.quiet || !process.stderr.isTTY) return;
      const pct = Math.min(100, Math.round(p));
      if (pct !== last) { last = pct; process.stderr.write(`\rrendering ${pct}%`); }
    };
    const r = await runRender(opts, console.log, progress);
    if (!opts.quiet && process.stderr.isTTY) process.stderr.write('\r              \r');
    for (const w of r.logs) console.error(`page: ${w.length > 300 ? w.slice(0, 297) + '…' : w}`);
    if (r.problems.length || !r.file) {
      console.error(`pixi-effects render failed: ${r.problems.join('; ') || 'no file written'}`);
      process.exit(1);
    }
    console.log(`${shown(r.file)}  ${kb(r.bytes)} · ${r.duration} s · ${r.width}×${r.height} @ ${r.frameRate} fps · ${opts.format} · rendered in ${r.seconds} s`);
    process.exit(opts.failOnWarn && r.logs.length ? 1 : 0);
  } catch (e) {
    console.error(`pixi-effects render failed: ${e.message}`);
    process.exit(2);
  }
}
