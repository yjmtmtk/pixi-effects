#!/usr/bin/env node
/**
 * pixi-effects check — review a composition page in ONE command, without driving a browser by hand.
 *
 *   node ai/tools/check.mjs my-video.html            (or:  npx pixi-effects check my-video.html)
 *
 * It starts a private static server and a private headless Chrome (nothing shared with other sessions), opens the page,
 * waits for `window.__ready === true`, then checks: console warnings / errors, `movie.inspect` over the whole timeline
 * (grouped), `movie.inspectAudio()`, a contact sheet (a PNG you can look at), and a real export (`movie.render`) that it
 * decodes again: video size / length, audio length, loudness per second, silence. Output goes to `check-out/<name>/` (`--out DIR` writes straight into DIR, with no <name>/ inside it)
 * (`sheet.png`, `<name>.<format>`, `report.json`; a presentation with `stops` also gets `stops.png`, one picture per stop) and a short summary is printed. Exit code 0 = nothing to fix, 1 = problems.
 *
 * Needs: Node >= 22 (built-in WebSocket), Chrome / Chromium installed (or --chrome PATH / CHROME=PATH). No npm dependencies.
 * The page must follow skills/pixi-effects/template.html: it exposes `window.movie` and sets `window.__ready = true` (and `window.__logs`).
 *
 * Options: --draft (the export is a draft: half size, low quality, no motion blur: a much smaller file; the drawing itself is not faster) · --at LIST (pictures at moments you name: 3.5, 50%, f120, title@end → frames/*.png and at.png) ·
 *          --query "a=1&b=2" (added to the page address: for a page that reads it, such as one video of a batch) ·
 *          --crop X,Y,W,H (with --at: each picture is that part of the canvas, in canvas pixels, enlarged up to 4x so a small figure can be judged) ·
 *          --pick X,Y (with --at, repeatable: what is under that canvas point at each moment, the top layer first, and the object a three layer met: `movie.pick`) ·

 *          --do "click Lime; hover 640,360; drag card > 770,240; wait 1; key Space" (real mouse and key events on the page, one step after the other, after everything else: what was under the pointer, which
 *          variables changed, whether the page warned, one picture per step in steps/; a point is x,y in canvas pixels or a layer name (the middle of its box); repeatable) ·
 *          --onion A:B (one picture of the movement between A and B seconds, frames overlaid: onion.png) ·
 *          --seam (a movie made to loop: the last frame to the first is compared with the steps between ordinary neighbouring frames; a jump is a problem) ·
 *          --strict (text overlaps and stops where the picture is still changing fail the check; by default they are only listed for review) · --out DIR · --frames N (contact sheet tiles, default 12) · --formats mp4,webm (default mp4) · --no-export ·
 *          --timeout SECONDS (default 240) · --root DIR (static server root; default: the nearest folder above the page with dist/) · --chrome PATH
 */
import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseVar, parseSizes, applyToPage } from './varArgs.mjs';

// ───────────────────────────── pure helpers (unit-tested) ─────────────────────────────

/**
 * A music layer's score read back, so the author can check it without listening: the length of every track in bars (a track that ends early or
 * has a short bar is named), the names that start in each bar, and where the drums play. One header line per music layer; none for other sources.
 */
export function formatMusic(sources) {
  const out = [];
  const pad = '            ';
  const num = x => String(Math.round(x * 100) / 100);
  for (const s of sources ?? []) {
    const m = s.music;
    if (!m) continue;
    const assumed = m.meterSet === false ? ` (no meter set: ${m.meter} assumed; a waltz is meter: 3)` : '';
    out.push(`  music     ${s.layer} · ${num(m.bpm)} bpm · ${num(m.beats)} beats = ${num(m.bars)} bars of ${m.meter} beats${assumed} · ${num(Math.round(m.seconds * 10) / 10)} s (+ ${num(m.tail)} s tail)`);
    for (const t of m.tracks) {
      const whole = Math.abs(t.bars - Math.round(t.bars)) < 1e-6;
      // a track shorter than the longest stops early (whatever its length in bars; decimal note lengths add up with float noise, so a gap under 1e-4 of a beat is none); a short BAR can only be the longest track's, and only the author's meter can say so
      const note = t.beats < m.beats - 1e-4 ? ` (ends early: silent from beat ${num(t.beats)})` : !whole && m.meterSet !== false ? ' (not a whole number of bars: a bar is short)' : '';
      const cell = names => { const n = names.match(/\[[^\]]*\]\S*|\S+/g) ?? []; return n.length === 0 ? '–' : n.length > 4 ? `${n.slice(0, 4).join(' ')} …` : n.join(' '); };
      const shown = t.perBar.slice(0, 16).map(cell).join(' | ');
      out.push(`${pad}${t.inst.padEnd(6)} ${num(t.bars)} bar${t.bars === 1 ? '' : 's'}${note} | ${shown}${t.perBar.length > 16 ? ` | … (${t.perBar.length - 16} more)` : ''}`);
    }
    for (const d of m.drums) {
      if (!d.kinds.length) continue;
      out.push(`${pad}drums  ${d.kinds.join(', ')} · beats ${num(d.from)}–${num(d.to)} (bars ${Math.floor(d.from / m.meter + 1e-9) + 1}–${Math.max(1, Math.ceil(d.to / m.meter - 1e-9))})`);
    }
  }
  return out;
}

/** `assets 0.1 s · build 2.4 s (slowest) · sound 0.6 s · frames 0.2 s` from `movie.loadStages` (milliseconds); the slowest stage is named only when the load took 1 s or more. */
export function formatLoadStages(stages) {
  if (!stages) return '';
  const names = ['assets', 'build', 'sound', 'frames'];
  const total = names.reduce((n, k) => n + (stages[k] ?? 0), 0);
  const slowest = total >= 1000 ? names.reduce((a, k) => ((stages[k] ?? 0) > (stages[a] ?? 0) ? k : a), 'assets') : null;
  const sec = ms => `${Math.round((ms ?? 0) / 100) / 10} s`;
  return names.map(k => `${k} ${sec(stages[k])}${k === slowest ? ' (slowest)' : ''}`).join(' · ');
}

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

export const USAGE = 'usage: node ai/tools/check.mjs <page.html> [--out DIR] [--frames N] [--formats mp4,webm] [--no-export] [--draft] [--at 3.5,title@end] [--crop X,Y,W,H] [--pick X,Y] [--do "click Lime; drag card > 770,240"] [--onion 1:3] [--seam] [--query a=1&b=2] [--var name=value] [--size 1920x1080,1080x1920] [--timeout S] [--root DIR] [--chrome PATH] [--strict] [--help]\n(the header of ai/tools/check.mjs explains each option)';

/** One failed request, as a sentence the person (or the AI) can act on. `f` is { url, status? , error?, type? }. */
export function describeLoadFailure(f) {
  const how = f.status ? `answered ${f.status}${f.status === 404 ? ' (not found)' : ''}` : `could not be fetched (${f.error || 'a network error'})`;
  return `${f.url} ${how}`;
}
/** A failure worth one more try: the network failed or the server had a bad moment (5xx, 429) on another site (a CDN); a missing file of the page's own server never gets better. */
export function isTransientLoadFailure(f, ownOrigin) {
  const foreign = !String(f.url).startsWith(ownOrigin);
  if (f.error) return foreign;
  return foreign && (f.status >= 500 || f.status === 429);
}
/** The kinds of request without which the page cannot start. */
const CRITICAL_TYPES = new Set(['Script', 'Document', 'Stylesheet', 'Other', undefined]);

const DO_VERBS = ['click', 'hover', 'drag', 'wait', 'key'];
const pointOf = (text) => { const m = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/); return m ? { x: Number(m[1]), y: Number(m[2]) } : { name: text.trim() }; };
/**
 * `--do` steps: "click 640,360; hover Lime; drag card > 770,240; wait 0.5; key Space" (`;` or a new line between steps). A point is `x,y` in canvas pixels or a layer name; the points of a
 * drag are separated by `>` or by spaces (a name with spaces needs `>`). Returns [{ verb, points?, seconds?, key? }].
 */
export function parseDo(text) {
  const steps = [];
  for (const raw of String(text).split(/[;\n]/).map(s => s.trim()).filter(Boolean)) {
    const [verb, ...rest] = raw.split(/\s+/);
    const arg = rest.join(' ');
    if (!DO_VERBS.includes(verb)) throw new Error(`--do: "${verb}" is not a step; the steps are ${DO_VERBS.join(', ')} (for example --do "click 640,360; drag card > 770,240")`);
    if (verb === 'wait') {
      if (!arg || !Number.isFinite(Number(arg)) || Number(arg) < 0) throw new Error(`--do: wait needs a number of seconds, got "${arg}"`);
      steps.push({ verb, seconds: Number(arg) });
    } else if (verb === 'key') {
      if (!arg) throw new Error('--do: key needs a key name (Space, Enter, ArrowLeft, a, …)');
      steps.push({ verb, key: arg });
    } else if (verb === 'drag') {
      const parts = arg.includes('>') ? arg.split('>') : arg.split(/\s+/);
      const points = parts.map(p => p.trim()).filter(Boolean).map(pointOf);
      if (points.length < 2) throw new Error(`--do: drag needs two points or more (from > to), got "${arg}"`);
      steps.push({ verb, points });
    } else {
      if (!arg) throw new Error(`--do: ${verb} needs a point (x,y in canvas pixels, or a layer name), for example "${verb} 640,360"`);
      steps.push({ verb, points: [pointOf(arg)] });
    }
  }
  return steps;
}

export function parseArgs(argv) {
  const o = { page: null, out: null, frames: 12, formats: ['mp4'], export: true, timeout: 240, root: null, chrome: null, strict: false, at: null, crop: null, draft: false, onion: null, seam: false, query: null, pick: [], do: [], vars: [], sizes: [], help: false };
  const need = (i, name) => { if (i + 1 >= argv.length) throw new Error(`${name} needs a value`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--out') o.out = need(i++, a);
    else if (a === '--frames') o.frames = Math.max(1, Math.round(Number(need(i++, a))) || 12);
    else if (a === '--formats') o.formats = need(i++, a).split(',').map(s => s.trim()).filter(Boolean);
    else if (a === '--no-export') o.export = false;
    else if (a === '--strict') o.strict = true;
    else if (a === '--draft') o.draft = true;
    else if (a === '--query') o.query = need(i++, a).replace(/^\?/, '');
    else if (a === '--at') o.at = need(i++, a);
    else if (a === '--crop') {
      const m = need(i++, a).split(',').map(Number);
      if (m.length !== 4 || !m.every(Number.isFinite) || m[0] < 0 || m[1] < 0 || m[2] < 1 || m[3] < 1) throw new Error(`--crop must look like 100,200,400,300 (x, y, width, height in canvas pixels, width and height at least 1), got "${argv[i]}"`);
      o.crop = { x: Math.round(m[0]), y: Math.round(m[1]), width: Math.round(m[2]), height: Math.round(m[3]) };
    }
    else if (a === '--pick') {
      const m = need(i++, a).split(',').map(Number);
      if (m.length !== 2 || !m.every(Number.isFinite)) throw new Error(`--pick must look like 640,360 (x, y in canvas pixels), got "${argv[i]}"`);
      o.pick.push({ x: m[0], y: m[1] });
    }
    else if (a === '--do') o.do.push(...parseDo(need(i++, a)));
    else if (a === '--var') o.vars.push(parseVar(need(i++, a)));
    else if (a === '--size') o.sizes.push(...parseSizes(need(i++, a)));
    else if (a === '--seam') o.seam = true;
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
  if (o.crop && !o.at) throw new Error('--crop crops the pictures of --at: give --at too (for example --at 3.5 --crop 100,200,400,300)');
  if (o.pick.length && !o.at) throw new Error('--pick asks about the moments of --at: give --at too (for example --at 3.5 --pick 640,360)');
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
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = []; this.closed = false;
    /** Opt-in limit (ms) for one call; none by default, because an export or a render legitimately takes minutes. */
    this.timeout = null;
    ws.onmessage = ev => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result);
      } else if (msg.method) for (const fn of this.listeners) fn(msg);
    };
    // a browser that is gone (killed, crashed) never answers: end every call that waits for it, instead of waiting for ever
    ws.onclose = () => {
      this.closed = true;
      for (const [, p] of this.pending) p.reject(new Error('connection to Chrome closed'));
      this.pending.clear();
    };
  }
  send(method, params = {}) {
    if (this.closed) return Promise.reject(new Error('connection to Chrome closed'));
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = this.timeout ? setTimeout(() => { this.pending.delete(id); reject(new Error(`Chrome did not answer ${method} in ${this.timeout} ms`)); }, this.timeout) : null;
      this.pending.set(id, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    });
  }
  on(fn) { this.listeners.push(fn); }
  /** Run an expression in the page and return its value (JSON-able). Awaits promises. */
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'page evaluation failed');
    return r.result.value;
  }
}

/** The file in a private profile folder that names the process that started the browser: the next tool start can tell a profile that is still in use from one whose owner is gone. */
export const OWNER_FILE = 'pixi-owner.pid';

/**
 * Sweep what a dead owner left: every `pixi-effects-*` folder in `tmp` whose owner file names a process that no longer exists has everything that was
 * started with it stopped (found with `ps`, stopped by process id: no pkill, which a sandbox may refuse) and is removed. A profile whose owner is alive
 * (another tool running right now), one with no owner file (a tool that is just starting) and any folder that is not ours are left alone.
 * Never throws: a launch must not fail because of a cleanup. Returns `{ removed: [folders], stopped: number }`. (POSIX only; nothing to do elsewhere.)
 */
export function reapStaleChrome(tmp = os.tmpdir()) {
  const result = { removed: [], stopped: 0 };
  if (process.platform === 'win32') return result;
  try {
    const alive = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
    let stale = [];
    for (const name of fs.readdirSync(tmp)) {
      if (!name.startsWith('pixi-effects-')) continue;
      const dir = path.join(tmp, name);
      let owner;
      try { owner = Number(fs.readFileSync(path.join(dir, OWNER_FILE), 'utf8').trim()); } catch { continue; }       // no owner file: not ours to take yet
      if (Number.isInteger(owner) && owner > 0 && !alive(owner)) stale.push(dir);
    }
    if (!stale.length) return result;
    const ps = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    const lines = ps.status === 0 ? ps.stdout.split('\n') : [];
    for (const dir of stale) {
      const flag = `--user-data-dir=${dir}`;
      for (const line of lines) {
        const at = line.indexOf(flag);
        if (at < 0 || (line[at + flag.length] !== undefined && line[at + flag.length] !== ' ')) continue;       // the whole folder name, not one that only starts like it
        const pid = Number(line.trim().split(/\s+/, 1)[0]);
        if (!Number.isInteger(pid) || pid === process.pid) continue;
        try { process.kill(pid, 'SIGKILL'); result.stopped++; } catch { /* already gone */ }
      }
      try { fs.rmSync(dir, { recursive: true, force: true }); result.removed.push(dir); } catch { /* held a moment longer: the next start takes it */ }
    }
  } catch { /* a cleanup never stops a launch */ }
  return result;
}

/** Start a private headless Chrome. `extraArgs`: more command-line flags (the tests use it for `--enable-features=WebMCP`). */
export async function launchChrome(chrome, userDataDir, extraArgs = []) {
  reapStaleChrome();                                                           // what an earlier run left behind (its owner is gone) goes first
  try { fs.writeFileSync(path.join(userDataDir, OWNER_FILE), String(process.pid)); } catch { /* a profile that cannot be marked is simply never swept */ }
  const args = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--disable-audio-output', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--window-size=1400,900', ...extraArgs, 'about:blank',
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
  return { proc, cdp: new Cdp(ws), port: Number(port), endpoint };
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

/**
 * JavaScript, as text, for the page: it resolves to the page's own `pixi-effects/present` module (stops, pages, PDF). The page's import map names it
 * (`pixi-effects/present`); a page that only maps `pixi-effects` gets the `present.js` that sits beside the library.
 */
export const LOAD_PRESENT = `(async () => {
  try { return await import('pixi-effects/present'); } catch (e) { /* not in the import map: look beside the library */ }
  let lib = null;
  try { lib = JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports['pixi-effects']; } catch (e) { /* none */ }
  if (!lib) throw new Error('the page has no "pixi-effects" in its import map');
  return import(new URL('present.js', new URL(lib, document.baseURI)).href);
})()`;
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
    // the requests that failed (a wrong path in the import map, a CDN that is down): a module that cannot be loaded raises nothing in the page, so without this the only sign is a page that never gets ready
    const requests = new Map(), loadFailures = [];
    let failureAt = 0;
    cdp.on(m => {
      if (m.method === 'Runtime.exceptionThrown') consoleLines.push(`uncaught: ${m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text}`);
      else if (m.method === 'Network.requestWillBeSent') requests.set(m.params.requestId, { url: m.params.request.url, type: m.params.type });
      else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
        loadFailures.push({ url: m.params.response.url, status: m.params.response.status, type: m.params.type }); failureAt = Date.now();
      } else if (m.method === 'Network.loadingFailed' && !m.params.canceled) {
        const r = requests.get(m.params.requestId) ?? {};
        if (r.url && !/favicon\.ico/.test(r.url)) { loadFailures.push({ url: r.url, error: m.params.errorText, type: m.params.type ?? r.type }); failureAt = Date.now(); }
      }
    });
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    const pageUrl = `http://127.0.0.1:${port}/${path.relative(root, pagePath).split(path.sep).join('/')}${opts.query ? `?${opts.query}` : ''}`;
    const t0 = Date.now();
    await cdp.send('Page.navigate', { url: pageUrl });

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
      // a script or the page itself could not be loaded and nothing has started since: no use in waiting out the minute
      const critical = loadFailures.filter(f => CRITICAL_TYPES.has(f.type) && !/\.(png|jpe?g|gif|webp|svg|woff2?|ttf|otf|mp3|mp4|wav)(\?|$)/i.test(f.url));
      if (critical.length && Date.now() - failureAt > 2500) {
        if (critical.some(f => isTransientLoadFailure(f, `http://127.0.0.1:${port}`)) && !report.retried) {      // a hiccup of a CDN: once more, from the start
          report.retried = true; loadFailures.length = 0; failureAt = 0; requests.clear();
          await cdp.send('Page.navigate', { url: pageUrl });
          continue;
        }
        break;
      }
      if (Date.now() - t0 > 60000) break;
    }
    info = await cdp.eval(INFO).catch(() => info) ?? info;
    report.ready = !!info?.hasMovie && (await cdp.eval('window.__ready === true').catch(() => false));
    report.readySeconds = Math.round((Date.now() - t0) / 100) / 10;
    report.loadStages = await cdp.eval('(window.movie && window.movie.loadStages) || null').catch(() => null);
    report.logs = [...new Set([...(info?.logs ?? []), ...consoleLines])];
    if (loadFailures.length) report.loadFailures = loadFailures.map(({ url, status, error, type }) => ({ url, ...(status ? { status } : {}), ...(error ? { error } : {}), ...(type ? { type } : {}) }));
    if (!report.ready) {
      const lost = (report.loadFailures ?? []).filter(f => CRITICAL_TYPES.has(f.type));
      if (lost.length) {
        const own = lost.every(f => String(f.url).startsWith(`http://127.0.0.1:${port}`));
        report.problems.push(`the page could not be loaded completely: ${lost.slice(0, 3).map(describeLoadFailure).join('; ')}${lost.length > 3 ? ` (+${lost.length - 3} more)` : ''}${report.retried ? ' — tried twice' : ''}. `
          + (own ? `That is a file of the page's own server (the folder served is ${root}): check the path in the page's import map or its <script src>.` : 'That address is not served here (a CDN or another site): check it is spelled right and reachable, then run the check again.'));
      }
      report.problems.push(`the page did not become ready (window.__ready !== true${lost.length ? ', because of the failed load above' : ' within 60 s'}${info?.hasMovie ? '' : '; window.movie is missing'})`);
      return finish(report, outDir, log);
    }
    // --var / --size: the page is rebuilt once with what the command line gave (the first size; the others are looked at after the export)
    if (opts.vars.length || opts.sizes.length) {
      report.rebuilt = await applyToPage(cdp, opts.vars, opts.sizes[0] ?? null);
      info = await cdp.eval(INFO).catch(() => info) ?? info;
      report.logs = [...new Set([...(info?.logs ?? []), ...consoleLines])];
    }
    report.vars = await cdp.eval('JSON.parse(JSON.stringify((window.movie && window.movie.vars) || {}))').catch(() => ({}));
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
    if (opts.crop && (opts.crop.x + opts.crop.width > info.width || opts.crop.y + opts.crop.height > info.height)) throw new Error(`--crop ${opts.crop.x},${opts.crop.y},${opts.crop.width},${opts.crop.height} goes past the canvas (${info.width}×${info.height})`);
    if (opts.onion && opts.onion[1] > info.duration + 1e-9) throw new Error(`--onion ${opts.onion[0]}:${opts.onion[1]} goes past the end: the movie is ${info.duration} s`);

    const rv = await cdp.eval(`movie.review(${JSON.stringify({ strict: !!opts.strict })})`);
    const layoutProblems = rv.problems.filter(g => g.kind !== 'canvas'), canvasProblems = rv.problems.filter(g => g.kind === 'canvas');
    report.inspect = { checkedFrames: rv.frames, issues: layoutProblems, review: rv.review, canvas: canvasProblems.map(g => g.message), canvasLayers: rv.canvas ?? [] };
    if (layoutProblems.length) report.problems.push(`${layoutProblems.length} kind(s) of layout issue from movie.inspect`);
    if (canvasProblems.length) report.problems.push(`${canvasProblems.length} layer(s) (canvas / three) that do not draw the same picture for the same time (movie.canvasProblems)`);
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
      for (const old of fs.readdirSync(framesDir)) if (old.endsWith('.png')) fs.rmSync(path.join(framesDir, old));        // the pictures of an earlier run: frames/ shows this run's moments only
      // --crop: that part of the canvas, enlarged by a whole factor (up to 4x, the longer side to about 800 px) with no smoothing, so small figures and fine lines can be judged
      const crop = opts.crop ? { ...opts.crop, scale: Math.max(1, Math.min(4, Math.floor(800 / Math.max(opts.crop.width, opts.crop.height)))) } : null;
      const cropped = [];
      for (const w of wanted) {
        let png = await cdp.eval(`movie.snapshot(${w.frame}, { as: 'dataURL' })`);
        if (crop) {
          png = await cdp.eval(`(async (url, c) => { const img = new Image(); img.src = url; await img.decode(); const cv = document.createElement('canvas'); cv.width = c.width * c.scale; cv.height = c.height * c.scale; const g = cv.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(img, c.x, c.y, c.width, c.height, 0, 0, cv.width, cv.height); return cv.toDataURL('image/png'); })(${JSON.stringify(png)}, ${JSON.stringify(crop)})`);
          cropped.push(png);
        }
        fs.writeFileSync(path.join(framesDir, `${w.label}.png`), Buffer.from(png.slice(png.indexOf(',') + 1), 'base64'));
        // depth of field: the blur (px) each threeD layer has at this moment, so a focus pull can be read as numbers (0 = sharp)
        const rows = await cdp.eval(`movie.inspect(${w.frame}).then(r => r.layers.filter(l => l.depthBlur !== undefined).map(l => [l.path, l.depthBlur]))`).catch(() => []);
        if (rows.some(([, px]) => px > 0)) w.depthBlur = Object.fromEntries(rows);
        // pick: what is under each --pick point at this moment (the frame is on screen after the snapshot above)
        if (opts.pick.length) {
          w.pick = await cdp.eval(`(${JSON.stringify(opts.pick)}).map(p => ({ x: p.x, y: p.y, hits: movie.pickAll(p.x, p.y).map(h => ({ name: h.name ?? h.path, path: h.path, kind: h.kind, object: h.three ? h.three.object : undefined })) }))`).catch(() => []);
        }
        // light: how lit each threeD layer is at this moment (left out when the composition has no light)
        const lit = await cdp.eval(`movie.inspect(${w.frame}).then(r => r.layers.filter(l => l.light !== undefined).map(l => [l.path, l.light]))`).catch(() => []);
        if (lit.length) w.light = Object.fromEntries(lit);
      }
      const atSheet = crop
        ? await cdp.eval(`(async (urls) => { const imgs = await Promise.all(urls.map(async u => { const i = new Image(); i.src = u; await i.decode(); return i; })); const cols = Math.min(imgs.length, 3), rows = Math.ceil(imgs.length / cols), w = imgs[0].width, h = imgs[0].height; const cv = document.createElement('canvas'); cv.width = cols * w; cv.height = rows * h; const g = cv.getContext('2d'); imgs.forEach((im, k) => g.drawImage(im, (k % cols) * w, Math.floor(k / cols) * h)); return cv.toDataURL('image/png'); })(${JSON.stringify(cropped)})`)
        : await cdp.eval(`movie.contactSheet({ frames: ${JSON.stringify(wanted.map(w => w.frame))}, as: 'dataURL' })`);
      const atFile = path.join(outDir, 'at.png');
      fs.writeFileSync(atFile, Buffer.from(atSheet.slice(atSheet.indexOf(',') + 1), 'base64'));
      report.files.at = shown(atFile);
      report.files.frames = shown(framesDir);
      report.at = wanted;
      if (crop) report.crop = crop;
    }

    // --onion A:B: one picture of the movement between A and B seconds (8 frames overlaid, the later the stronger)
    if (opts.onion) {
      const [from, to] = opts.onion;
      const onion = await cdp.eval(`movie.onionSkin({ from: ${from}, to: ${to}, count: 8, as: 'dataURL' })`);
      const onionFile = path.join(outDir, 'onion.png');
      fs.writeFileSync(onionFile, Buffer.from(onion.slice(onion.indexOf(',') + 1), 'base64'));
      report.files.onion = shown(onionFile);
    }

    // --seam: a movie made to loop must not jump where it starts again
    if (opts.seam) {
      const m = await cdp.eval(SEAM_SCRIPT);
      if (m.error) report.problems.push(`--seam: ${m.error}`);
      else {
        report.seam = { ...seamVerdict(m), frames: m.frames };
        if (!report.seam.ok) report.problems.push(`the loop jumps at its seam: the last frame to the first differs by ${report.seam.seam}, ${report.seam.ratio}× the largest ordinary step (${report.seam.max})`);
      }
    }

    // the motion: how much of the movie moves, when the last movement ends, the longest hold, and how it starts and ends (numbers for review, never a failure)
    {
      const m = await cdp.eval(MOTION_SCRIPT).catch(() => null);
      if (m && !m.error && m.samples) {
        report.motion = motionVerdict(m.samples, { duration: m.duration, hasStops: m.hasStops });
        report.motion.line = motionLine(report.motion, m.duration);
      }
    }

    // a presentation (composition.stops): one picture of every stop, in order, so the pages and steps can be read at a glance
    const stops = await cdp.eval(`(() => { const s = movie.stops || []; return s.length ? { count: s.length, pages: new Set(s.map(x => x.pageIndex)).size, items: s.map(x => ({ at: Math.round(x.at * 100) / 100, frame: x.frame, page: x.page, pageStart: x.pageStart, notes: !!x.notes, pdf: x.pdf })) } : null; })()`).catch(() => null);
    if (stops) {
      report.stops = stops;
      // is the picture at each stop still changing? (the audience, the page overview and a PDF would see a half-finished animation)
      let skipped = '';
      const settled = await cdp.eval(`${LOAD_PRESENT}.then(p => p.inspectStops(movie))`).catch(e => { skipped = String((e && e.message) || e); return null; });
      if (!settled) report.stops.reviewSkipped = `${skipped || 'no answer'} (the page needs "pixi-effects/present": ".../dist/present.js" in its import map, from the same version as the library)`;
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

    // --size A,B,…: the same movie at the other sizes, a layout review and a contact sheet each (the export above was the first size)
    if (opts.sizes.length) {
      report.sizes = [{ size: `${info.width}x${info.height}`, sheet: report.files.sheet, issues: report.inspect.issues, review: report.inspect.review }];
      for (const size of opts.sizes.slice(1)) {
        left();
        const label = `${size.width}x${size.height}`;
        await applyToPage(cdp, [], size);
        const r = await cdp.eval(`movie.review(${JSON.stringify({ strict: !!opts.strict })})`);
        const sheetAt = await cdp.eval(`movie.contactSheet({ count: ${opts.frames}, as: 'dataURL' })`);
        const file = path.join(outDir, `sheet-${label}.png`);
        fs.writeFileSync(file, Buffer.from(sheetAt.slice(sheetAt.indexOf(',') + 1), 'base64'));
        report.files[`sheet ${label}`] = shown(file);
        report.sizes.push({ size: label, sheet: shown(file), issues: r.problems, review: r.review });
        if (r.problems.length) report.problems.push(`${r.problems.length} kind(s) of layout issue from movie.inspect at ${label}`);
      }
    }
    // what the page said while the other sizes were built (the first list was taken before)
    const later = await cdp.eval('window.__logs || []').catch(() => []);
    const fresh = [...new Set([...later, ...consoleLines])].filter(l => !report.logs.includes(l));
    if (fresh.length) {
      report.logs.push(...fresh);
      report.problems.push(`${fresh.length} more console warning(s) / error(s) while the page was built at the other size(s) — each says what to change`);
    }
    // --do: real clicks, hovers, drags and keys on the page, last (they change what the page shows and remembers)
    if (opts.do.length) {
      report.steps = await runSteps(cdp, opts.do, outDir, { width: info.width, height: info.height }, consoleLines, report.logs);
      report.files.steps = shown(path.join(outDir, 'steps'));
      report.steps.forEach((st, i) => {
        if (st.error) report.problems.push(`step ${i + 1} (${st.label}): ${st.error}`);
        if (st.warnings?.length) report.problems.push(`step ${i + 1} (${st.label}): ${st.warnings.length} console warning(s) — ${st.warnings[0].slice(0, 200)}`);
      });
    }
    return finish(report, outDir, log);
  } finally {
    try { chromeProc?.kill(); } catch { /* already gone */ }
    server.close();
    await sleep(200);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
  }
}

/**
 * `check --seam`: does a movie made to loop close without a jump? `seam` is how much the last frame differs from the first (mean absolute difference of the colour
 * channels, 0 to 1), `steps` are the same number for ordinary neighbouring frames of the movie, so the movie is its own measure. A seam up to 1.5 times the largest
 * ordinary step (or under the noise floor of 0.001) closes; more is a jump.
 */
export function seamVerdict({ seam, steps }) {
  const sorted = [...steps].sort((a, b) => a - b);
  const median = sorted.length ? sorted[sorted.length >> 1] : 0, max = sorted.length ? sorted[sorted.length - 1] : 0;
  const ok = seam <= Math.max(max * 1.5, 0.001);
  const ratio = max > 0 ? seam / max : (seam > 0 ? Infinity : 0);
  const n = x => (x < 0.1 ? x.toFixed(4) : x.toFixed(3));
  const line = ok
    ? `  seam      the loop closes: the last frame to the first differs by ${n(seam)}, an ordinary step by ${n(median)} (largest ${n(max)})`
    : `  seam      JUMP: the last frame to the first differs by ${n(seam)}, ${Number.isFinite(ratio) ? `${(Math.round(ratio * 10) / 10).toFixed(1)}×` : 'against nothing'} the largest ordinary step (${n(max)}): the picture jumps when the movie loops (make every motion periodic over the duration)`;
  return { seam: Math.round(seam * 1e6) / 1e6, median: Math.round(median * 1e6) / 1e6, max: Math.round(max * 1e6) / 1e6, ratio: Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : null, ok, line };
}

/** In the page: the seam (last frame against the first) and nine ordinary steps (the first and the last of them next to the seam), on pictures a quarter of the size. */
const MOVING = 0.001;                                           // the mean change of a pixel between two samples above which the picture is moving (0..1)
const PLAIN = 0.012;                                            // the spread of the picture below which it is one plain colour (0..1)
const hex2 = v => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
const sec = x => +x.toFixed(1);
/**
 * `check`'s motion line: from samples of the picture over the movie (`{ t, diff, spread, mean }`: how much it changed since the sample before, how much is on screen, its average colour) say how much of the
 * movie moves, when the last movement ends, the longest stretch that does not move, and whether the first and last frames are one plain colour. These are for review, never a failure: a hold or a fade to black
 * may be the point. A presentation (stops) is meant to stand still and is not reviewed.
 */
export function motionVerdict(samples, { duration, hasStops = false }) {
  const steps = samples.slice(1);
  const moving = steps.filter(s => s.diff > MOVING);
  const out = { steps: steps.length, movingShare: steps.length ? moving.length / steps.length : 0, lastMotionAt: moving.length ? moving[moving.length - 1].t : 0, longestStill: null, first: { plain: false, visibleFrom: 0 }, last: { plain: false, plainFrom: null, color: null }, review: [], presentation: hasStops };
  let run = null;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].diff <= MOVING) { if (!run) run = { from: samples[i - 1].t, i0: i - 1 }; run.to = samples[i].t; run.i1 = i; }
    else run = null;
    if (run && (!out.longestStill || run.to - run.from > out.longestStill.seconds)) out.longestStill = { from: sec(run.from), to: sec(run.to), seconds: sec(run.to - run.from), i0: run.i0, i1: run.i1 };
  }
  const visible = samples.find(s => s.spread >= PLAIN);
  out.first = { plain: samples[0].spread < PLAIN, visibleFrom: visible ? visible.t : null };
  const lastS = samples[samples.length - 1];
  if (lastS && lastS.spread < PLAIN) {
    let k = samples.length - 1;
    while (k > 0 && samples[k - 1].spread < PLAIN) k--;
    out.last = { plain: true, plainFrom: samples[k].t, color: `#${hex2(lastS.mean[0])}${hex2(lastS.mean[1])}${hex2(lastS.mean[2])}` };
  }
  if (!hasStops) {
    if (out.last.plain && duration - out.last.plainFrom >= 0.4) out.review.push(`the last frame is one plain colour (${out.last.color}): nothing on screen from ${sec(out.last.plainFrom)} s to the end (on purpose for a fade to black or a held background; otherwise the ending is missing)`);
    if (out.first.visibleFrom !== null && out.first.visibleFrom >= 1) out.review.push(`nothing is on screen until ${sec(out.first.visibleFrom)} s (the first second or more is a plain colour: a viewer may think the video is broken)`);
    const still = out.longestStill;
    if (still && still.seconds >= Math.max(3, duration * 0.35)) {
      const emptyInside = samples.slice(still.i0, still.i1 + 1).every(s => s.spread < PLAIN);          // an empty picture is told by its first or last frame above, not twice
      const inEmptyTail = out.last.plain && still.from >= out.last.plainFrom - 0.5;
      if (!emptyInside && !inEmptyTail) out.review.push(`the picture does not move from ${still.from} s to ${still.to} s (${still.seconds} s of ${sec(duration)} s): a long hold; give it a slow drift, a second movement, or a reason to stay (a pause for the music or the reading is fine)`);
    }
  }
  if (out.longestStill) { delete out.longestStill.i0; delete out.longestStill.i1; }
  return out;
}
export function motionLine(v, duration) {
  if (v.presentation) return '  motion    presentation: its stops are meant to stand still, so the motion is not reviewed';
  const still = v.longestStill && v.longestStill.seconds >= 1 ? ` · longest still stretch ${v.longestStill.seconds} s (${v.longestStill.from}–${v.longestStill.to} s)` : '';
  return `  motion    moves in ${Math.round(v.movingShare * 100)} % of the movie · last movement ends at ${sec(v.lastMotionAt)} s of ${sec(duration)} s${still}`;
}
const MOTION_SCRIPT = `(async () => {
  const total = movie.totalFrames, fps = movie.frameRate;
  if (total < 3) return { error: 'a movie of fewer than 3 frames has no motion to measure' };
  const n = Math.min(90, Math.max(3, Math.round(movie.duration * 10) + 1));
  const frames = [...new Set(Array.from({ length: n }, (_, i) => Math.round(i / (n - 1) * (total - 1))))];
  const out = []; let prev = null;
  for (const f of frames) {
    const d = (await movie.snapshot(f, { as: 'imageData', scale: 0.1, motionBlur: false })).data;
    let r = 0, g = 0, b = 0, l = 0, l2 = 0, diff = null; const px = d.length / 4;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; const y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255; l += y; l2 += y * y; }
    if (prev) { let s = 0; for (let i = 0; i < d.length; i += 4) s += Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]); diff = s / (px * 3 * 255); }
    out.push({ t: f / fps, diff, spread: Math.sqrt(Math.max(0, l2 / px - (l / px) ** 2)), mean: [r / px / 255, g / px / 255, b / px / 255] });
    prev = d;
  }
  return { samples: out, hasStops: !!(movie.stops && movie.stops.length), duration: movie.duration };
})()`;

const SEAM_SCRIPT = `(async () => {
  const total = movie.totalFrames;
  if (total < 4) return { error: 'a movie of fewer than 4 frames has no loop to measure' };
  const cache = new Map();
  const grab = async f => { if (!cache.has(f)) cache.set(f, (await movie.snapshot(f, { as: 'imageData', scale: 0.25, motionBlur: false })).data); return cache.get(f); };
  const mae = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4 * 3) / 255; };
  const picks = new Set([0, total - 2]);
  for (let k = 1; k <= 7; k++) picks.add(Math.round((total - 2) * k / 8));
  const steps = [];
  for (const k of [...picks].sort((a, b) => a - b)) steps.push(mae(await grab(k), await grab(k + 1)));
  return { seam: mae(await grab(total - 1), await grab(0)), steps, frames: total };
})()`;

/**
 * The line `check` prints for its own export. That export is made to see that the movie can be written and read back, at a low bitrate and with no way to
 * ask for another: it is not the file to deliver (`render` is: `--video-bitrate`), and the line says so, with the real bitrate so nobody mistakes it for one.
 */
export function exportLine(ex) {
  if (ex.error) return `  export    ${ex.format}: FAILED — ${ex.error}`;
  const v = ex.video?.error ? `video: ${ex.video.error}` : `video ${ex.video.duration.toFixed(2)} s ${ex.video.width}×${ex.video.height}`;
  const au = ex.audio ? (ex.audio.error ? `audio: ${ex.audio.error}` : `audio ${ex.audio.duration} s, peak ${ex.audio.peakDb} dBFS, rms/s [${ex.audio.rmsDbPerSecond.join(' ')}]`) : 'no audio track';
  const seconds = ex.video && !ex.video.error ? ex.video.duration : 0;
  const rate = seconds > 0 ? ` · ${Math.round(ex.bytes * 8 / seconds / 1e5) / 10} Mbps (for looking at; \`render\` writes the file to deliver)` : '';
  return `  export    ${ex.format}${ex.draft ? ' (draft)' : ''} ok · ${kb(ex.bytes)}${rate} · ${v} · ${au}`;
}

const KEYS = { Space: [' ', 'Space'], Enter: ['Enter', 'Enter'], Escape: ['Escape', 'Escape'], Tab: ['Tab', 'Tab'], Backspace: ['Backspace', 'Backspace'], ArrowLeft: ['ArrowLeft', 'ArrowLeft'], ArrowRight: ['ArrowRight', 'ArrowRight'], ArrowUp: ['ArrowUp', 'ArrowUp'], ArrowDown: ['ArrowDown', 'ArrowDown'] };
const keyEvent = (name) => KEYS[name] ? { key: KEYS[name][0], code: KEYS[name][1] } : { key: name, code: /^[a-z]$/i.test(name) ? `Key${name.toUpperCase()}` : /^\d$/.test(name) ? `Digit${name}` : name };

/**
 * `check --do`: the steps, run on the page with real mouse and key events (the page's own handlers run: nothing is simulated), one picture of the canvas after each, in `steps/`.
 * Returns [{ verb, label, hits, vars, frame, playing, warnings, picture, error? }]: what was under the last point, the variables that changed ([before, after]), what the page warned.
 */
export async function runSteps(cdp, steps, outDir, size, consoleLines, seenLogs) {
  const dir = path.join(outDir, 'steps');
  fs.mkdirSync(dir, { recursive: true });
  for (const old of fs.readdirSync(dir)) if (old.endsWith('.png')) fs.rmSync(path.join(dir, old));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.eval(`movie.app.canvas.scrollIntoView({ block: 'center', inline: 'center' })`);
  await sleep(150);
  const seen = new Set(seenLogs);
  const results = [];
  const pageLogs = async () => [...new Set([...(await cdp.eval('window.__logs || []').catch(() => [])), ...consoleLines])];
  const geometry = () => cdp.eval(`(() => { const r = movie.app.canvas.getBoundingClientRect(); return { left: r.left, top: r.top, w: r.width, h: r.height }; })()`);
  const mouse = async (g, p, type, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x: g.left + p.x * g.w / size.width, y: g.top + p.y * g.h / size.height, ...extra });
  let n = 0;
  for (const step of steps) {
    n++;
    const res = { verb: step.verb, label: step.verb + (step.points ? ' ' + step.points.map(pt => pt.name ?? `${pt.x},${pt.y}`).join(' > ') : '') };   // (a name that is found gets its place added below)
    const before = await cdp.eval('JSON.parse(JSON.stringify(movie.vars || {}))').catch(() => ({}));
    let last = null;
    try {
      if (step.verb === 'wait') { res.label = `wait ${step.seconds}`; await sleep(step.seconds * 1000); }
      else if (step.verb === 'key') {
        res.label = `key ${step.key}`;
        const e = keyEvent(step.key);
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...e, text: e.key.length === 1 ? e.key : undefined });
        await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...e });
      } else {
        const points = [];
        for (const pt of step.points) {
          if (pt.name === undefined) { points.push({ ...pt }); continue; }
          const box = await cdp.eval(`(async () => { const r = (await movie.inspect(movie.currentFrame)).layers.find(l => l.name === ${JSON.stringify(pt.name)} || l.path === ${JSON.stringify(pt.name)}); return r && r.bounds ? { x: r.bounds.x + r.bounds.width / 2, y: r.bounds.y + r.bounds.height / 2 } : null; })()`);
          if (!box) throw new Error(`no layer named "${pt.name}" at this moment (it may not be alive yet: put a wait before, or give x,y)`);
          points.push({ x: Math.round(box.x), y: Math.round(box.y), name: pt.name });
        }
        res.label = `${step.verb} ${points.map(pt => pt.name ? `${pt.name} (${pt.x}, ${pt.y})` : `${pt.x},${pt.y}`).join(' > ')}`;
        res.points = points.map(({ x, y }) => ({ x, y }));
        for (const pt of points) if (!(pt.x >= 0 && pt.x <= size.width && pt.y >= 0 && pt.y <= size.height)) throw new Error(`the point ${pt.x},${pt.y} is outside the picture (0..${size.width} × 0..${size.height})`);
        const g = await geometry();
        last = points[points.length - 1];
        if (step.verb === 'hover') await mouse(g, points[0], 'mouseMoved');
        else if (step.verb === 'click') {
          await mouse(g, points[0], 'mouseMoved'); await sleep(60);
          await mouse(g, points[0], 'mousePressed', { button: 'left', clickCount: 1 }); await sleep(40);
          await mouse(g, points[0], 'mouseReleased', { button: 'left', clickCount: 1 });
        } else {                                                           // drag: press at the first point, move through the others in small steps, release at the last
          await mouse(g, points[0], 'mouseMoved'); await sleep(60);
          await mouse(g, points[0], 'mousePressed', { button: 'left', clickCount: 1, buttons: 1 }); await sleep(60);
          for (let i = 1; i < points.length; i++) for (let k = 1; k <= 8; k++) {
            const a = points[i - 1], b = points[i];
            await mouse(g, { x: a.x + (b.x - a.x) * k / 8, y: a.y + (b.y - a.y) * k / 8 }, 'mouseMoved', { buttons: 1 }); await sleep(25);
          }
          await mouse(g, last, 'mouseReleased', { button: 'left', clickCount: 1 });
        }
      }
    } catch (e) { res.error = e.message; }
    await sleep(300);                                                       // the page's handlers and rebuilds settle
    const after = await cdp.eval('JSON.parse(JSON.stringify(movie.vars || {}))').catch(() => ({}));
    res.vars = Object.fromEntries(Object.keys({ ...before, ...after }).filter(k => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map(k => [k, [before[k], after[k]]]));
    if (last) res.hits = await cdp.eval(`movie.pickAll(${last.x}, ${last.y}).map(h => h.kind === 'three' ? h.path + ' (three: ' + (h.three && h.three.object || '?') + ')' : h.path)`).catch(() => []);
    res.frame = await cdp.eval('movie.currentFrame').catch(() => null);
    res.playing = await cdp.eval('!!movie.isPlaying').catch(() => null);
    const now = await pageLogs();
    res.warnings = now.filter(l => !seen.has(l));
    for (const l of res.warnings) seen.add(l);
    const g = await geometry();
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: g.left, y: g.top, width: g.w, height: g.h, scale: 1 } }).catch(() => null);
    if (shot?.data) { const file = path.join(dir, `${String(n).padStart(2, '0')}-${step.verb}.png`); fs.writeFileSync(file, Buffer.from(shot.data, 'base64')); res.picture = shown(file); }
    results.push(res);
  }
  return results;
}

const fmtVar = (v) => typeof v === 'string' ? JSON.stringify(v.length > 24 ? v.slice(0, 21) + '…' : v) : String(v);
function finish(report, outDir, log) {
  const reportFile = path.join(outDir, 'report.json');
  report.files.report = shown(reportFile);
  report.ok = report.problems.length === 0;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));
  const L = [];
  L.push(`pixi-effects check — ${report.page}`);
  if (report.ready) L.push(`  page      ready in ${report.readySeconds} s · ${report.width}×${report.height} · ${report.frameRate} fps · ${report.totalFrames} frames (${report.duration} s)${report.hasAudio ? ' · audio' : ''}`);
  else L.push('  page      NOT READY');
  if (report.loadStages) L.push(`  loading   ${formatLoadStages(report.loadStages)}`);
  if (report.vars && Object.keys(report.vars).length) L.push(`  vars      ${Object.entries(report.vars).map(([k, v]) => `${k}=${typeof v === 'string' && v.length > 40 ? v.slice(0, 37) + '…' : v}`).join(', ')}${report.rebuilt ? ' (after --var / --size: the page was built again)' : ''}`);
  L.push(`  warnings  ${report.logs?.length ? report.logs.length + ' — ' + report.logs.slice(0, 5).map(l => l.length > 220 ? l.slice(0, 217) + '…' : l).join('\n            ') + (report.logs.length > 5 ? `\n            … ${report.logs.length - 5} more (report.json)` : '') : 'none'}`);
  if (report.inspect) {
    const g = report.inspect.issues;
    const line = i => `            - ${i.message}${i.count > 1 ? `  [${i.count} frames, ${i.firstFrame}–${i.lastFrame}]` : `  [frame ${i.firstFrame}]`}`;
    L.push(`  layout    ${g.length ? g.length + ' kind(s) of issue over ' + report.inspect.checkedFrames + ' frames:' : 'no cut-off / off-canvas text over ' + report.inspect.checkedFrames + ' frames (movie.inspect)'}`);
    for (const i of g.slice(0, 8)) L.push(line(i));
    if (g.length > 8) L.push(`            … ${g.length - 8} more (report.json)`);
    const cv = report.inspect.canvas ?? [];
    const rows = report.inspect.canvasLayers ?? [];
    if (cv.length) { L.push(`  canvas    ${cv.length} layer(s) (canvas / three) that do not draw the same picture for the same time:`); for (const m of cv.slice(0, 4)) L.push(`            - ${m}`); }
    for (const kind of ['canvas', 'three']) {                       // silence must not be the only sign that the check ran
      const mine = rows.filter(r => (r.kind ?? 'canvas') === kind);
      if (!mine.length) continue;
      const good = mine.filter(r => r.ok), slow = [...mine].sort((a, b) => b.drawMs - a.drawMs)[0];
      const ms = x => x < 10 ? x.toFixed(1) : String(Math.round(x));
      if (good.length) L.push(`  ${kind.padEnd(9)} ${cv.length ? 'the other ' : ''}${good.length} ${kind} layer(s) drew the same picture twice at ${good[0].moments.length} moments (two orders): deterministic · slowest draw ${ms(slow.drawMs)} ms${kind === 'canvas' ? ' on the CPU' : ''} (${slow.name})`);
    }
    const rv = report.inspect.review;
    if (rv.length) {
      L.push(`  review    ${rv.length} to look at — text overlaps are often intentional (ghost / glow copies, per-letter boxes, a wipe), and a font that is not available is drawn in a fallback; check them on the contact sheet, or use --strict to fail on them:`);
      for (const i of rv.slice(0, 4)) L.push(line(i));
      if (rv.length > 4) L.push(`            … ${rv.length - 4} more (report.json)`);
    }
  }
  if (report.sizes) {
    const g = report.sizes;
    L.push(`  sizes     ${g.map(x => `${x.size} ${x.issues.length ? x.issues.length + ' layout issue kind(s)' : 'no layout issue'}`).join(' · ')}${g.length > 1 ? ' (one contact sheet each: sheet.png, sheet-<size>.png)' : ''}`);
    for (const x of g) for (const i of x.issues.slice(0, 3)) L.push(`            - ${x.size}: ${i.message}`);
  }
  for (const w of (report.at ?? []).filter(x => x.pick)) {
    for (const p of w.pick) {
      const says = p.hits.length ? p.hits.map(h => h.kind === 'three' ? `${h.name} (three: ${h.object || '?'})` : h.name).join(', ') : 'nothing';
      L.push(`  pick      ${w.label} (${p.x}, ${p.y}) — ${says}`);
    }
  }
  for (const w of (report.at ?? []).filter(x => x.depthBlur)) {
    const shown = Object.entries(w.depthBlur).slice(0, 8).map(([k, px]) => `${k} ${px} px`).join(', ');
    L.push(`  depth     ${w.label} — ${shown}${Object.keys(w.depthBlur).length > 8 ? ', …' : ''} (blur of each threeD layer at that moment; 0 = sharp)`);
  }
  for (const w of (report.at ?? []).filter(x => x.light)) {
    const shown = Object.entries(w.light).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v}`).join(', ');   // the most lit first
    L.push(`  light     ${w.label} — ${shown}${Object.keys(w.light).length > 8 ? ', …' : ''} (the most lit threeD layers first: 1 = as bright as with no light, 0 = black; the number is the layer's middle, not what you can see)`);
  }
  for (const [i, st] of (report.steps ?? []).entries()) {
    const vars = Object.entries(st.vars ?? {});
    const changed = vars.length ? vars.slice(0, 6).map(([k, [a, b]]) => `${k} ${fmtVar(a)}→${fmtVar(b)}`).join(', ') + (vars.length > 6 ? `, … (${vars.length - 6} more)` : '') : 'no variable changed';
    const over = st.hits ? ` — over ${st.hits.length ? st.hits.join(', ') : 'nothing'}` : '';
    L.push(`  do        ${i + 1} ${st.label}${over} · ${st.error ? 'NOT RUN: ' + st.error : changed}${st.warnings?.length ? ` · ${st.warnings.length} warning(s)` : ''}${st.picture ? '' : ''}`);
  }
  if (report.stops) {
    const s = report.stops;
    L.push(`  stops     ${s.count} stop(s) on ${s.pages} page(s) — stops.png shows each one in order; the picture at a stop is what the audience sees while it waits`)
    if (s.reviewSkipped) L.push(`            not reviewed for stops that are still moving: ${s.reviewSkipped}`);
    if (s.review?.length) {
      L.push(`  review    ${s.review.length} stop(s) where the picture is still changing (may be on purpose, e.g. something always moving; use --strict to fail on them):`);
      for (const r of s.review.slice(0, 4)) L.push(`            - ${r}`);
      if (s.review.length > 4) L.push(`            … ${s.review.length - 4} more (report.json)`);
    } else if (s.review) L.push('  settled   every stop is a settled picture (movie.inspectStops)');
  }
  if (report.audio !== undefined) {
    const a = report.audio;
    L.push(a ? `  audio     ${a.sources.length} source(s) · mix peak ${a.peakDb} dBFS · ${a.loudness?.integratedLufs ?? 'n/a'} LUFS · true peak ${a.loudness?.truePeakDb ?? 'n/a'} dBTP · ${a.issues.length ? a.issues.join(' | ') : 'no issues (movie.inspectAudio)'}` : '  audio     none');
    for (const l of formatMusic(a?.sources)) L.push(l);
    for (const n of a?.notes ?? []) L.push(`  note      ${n}`);
  }
  if (report.motion) { L.push(report.motion.line); for (const r of report.motion.review) L.push(`            - ${r}`); }
  if (report.seam) L.push(report.seam.line);
  for (const ex of report.exports ?? []) L.push(exportLine(ex));
  L.push(`  files     ${Object.values(report.files).join('  ')}`);
  L.push(report.problems.length ? `RESULT: ${report.problems.length} PROBLEM(S)\n  - ${report.problems.join('\n  - ')}` : 'RESULT: OK — nothing to fix. Look at the contact sheet before you call it done.');
  log(L.join('\n'));
  return report;
}

// ───────────────────────────── CLI ─────────────────────────────

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {   // the real path: npm starts a bin through a symlink
  try {
    if (typeof WebSocket === 'undefined') throw new Error('Node >= 22 is needed (built-in WebSocket)');
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(USAGE); process.exit(0); }
    if (!opts.page) {
      console.error(USAGE);
      process.exit(2);
    }
    const report = await runCheck(opts);
    process.exit(report.ok ? 0 : 1);
  } catch (e) {
    console.error(`pixi-effects check failed: ${e.message}`);
    process.exit(2);
  }
}
