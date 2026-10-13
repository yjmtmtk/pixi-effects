#!/usr/bin/env node
/**
 * pixi-effects probe | trim | frames | sound — look at, listen to and cut footage, with no ffmpeg installed.
 *
 *   npx pixi-effects probe  <file|url> [--keyframes] [--json]            what is in a file: container, duration, tracks, codecs, size, notes
 *   npx pixi-effects trim   <file|url> <start> <end> -o <out> [--exact] [--force] [--json]
 *                                                                        cut [start, end] (seconds, or 1:02.5): by COPY when it can (no re-encode, no loss),
 *                                                                        and it says the real times; --exact re-encodes so the start is the frame asked for
 *   npx pixi-effects frames <file|url> [--at 1,3.5,50%,f120,end,"every 2s"] [--size 480] [--sheet] [-o dir] [--json]
 *                                                                        PNGs of the frames at those times (default: 0, 25%, 50%, 75%, end), and a contact sheet
 *   npx pixi-effects sound  <file|url> [--waveform] [-o dir] [--json]    loudness (LUFS), true peak, clipping, silences, level over time; a waveform picture
 *
 * Every command prints a short report, or the same facts as JSON with --json. Exit code: 0 done · 1 a problem (the file, the browser, the job as asked) · 2 usage.
 * `probe` and `trim` (copy) read and write containers in Node and need no browser. `frames`, `sound` and `trim --exact` decode or re-encode, so they use the headless
 * Chrome that `check` and `render` use (--chrome PATH or CHROME_PATH). mediabunny comes from this package, so it works offline. Where ffmpeg is installed and the job is
 * a long transcode, use ffmpeg: this is for looking, listening and cutting, with structured answers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, '../..');

export class UsageError extends Error { constructor(message) { super(message); this.name = 'UsageError'; this.exitCode = 2; } }

export const USAGE = `usage:
  pixi-effects probe  <file|url> [--keyframes] [--json]
  pixi-effects trim   <file|url> <start> <end> -o <out> [--exact] [--force] [--json]
  pixi-effects frames <file|url> [--at 1,3.5,50%,f120,end] [--size 480] [--sheet] [-o dir] [--json]
  pixi-effects sound  <file|url> [--waveform] [-o dir] [--json]`;

/** How each command reads its command line: the positional words, and each option with the kind of value it takes. */
const COMMANDS = {
  probe:  { positional: ['file'], flags: { '--keyframes': 'bool', '--json': 'bool' } },
  trim:   { positional: ['file', 'start', 'end'], flags: { '-o': 'str', '--out': 'str', '--exact': 'bool', '--force': 'bool', '--json': 'bool', '--chrome': 'str' } },
  frames: { positional: ['file'], flags: { '--at': 'str', '--size': 'num', '--sheet': 'bool', '-o': 'str', '--out': 'str', '--force': 'bool', '--json': 'bool', '--chrome': 'str' } },
  sound:  { positional: ['file'], flags: { '--waveform': 'bool', '-o': 'str', '--out': 'str', '--force': 'bool', '--json': 'bool', '--chrome': 'str' } },
};
export const MEDIA_COMMANDS = Object.keys(COMMANDS);

function distance(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}
const nearest = (word, list) => { const best = list.map(k => [k, distance(word, k)]).sort((x, y) => x[1] - y[1])[0]; return best && best[1] <= 2 ? best[0] : null; };

/** `12.5`, `1:02.5` (m:ss) or `1:02:03` (h:mm:ss) → seconds. */
export function parseTime(text, what = 'a time') {
  const s = String(text).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  throw new UsageError(`${what} must be seconds (12.5) or m:ss (1:02.5), got "${text}"`);
}

/** The command line → `{ command, file, opts }`. A mistake is a UsageError (exit code 2) that says what to write. */
export function parseMediaArgs(argv) {
  const [command, ...rest] = argv;
  const spec = COMMANDS[command];
  if (!spec) throw new UsageError(`unknown command "${command ?? ''}"${command && nearest(command, MEDIA_COMMANDS) ? `; did you mean "${nearest(command, MEDIA_COMMANDS)}"?` : ''}`);
  const words = [], opts = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a.startsWith('-') && a.length > 1 && !/^-\d/.test(a)) {
      const kind = spec.flags[a];
      if (!kind) {
        const guess = nearest(a, Object.keys(spec.flags));
        throw new UsageError(`${command}: unknown option ${a}${guess ? `; did you mean ${guess}?` : ''} (options: ${Object.keys(spec.flags).join(' ')})`);
      }
      const key = a.replace(/^-+/, '');
      if (kind === 'bool') opts[key] = true;
      else {
        const v = rest[++i];
        if (v === undefined) throw new UsageError(`${command}: ${a} needs a value`);
        opts[key] = kind === 'num' ? Number(v) : v;
        if (kind === 'num' && !Number.isFinite(opts[key])) throw new UsageError(`${command}: ${a} must be a number, got "${v}"`);
      }
    } else words.push(a);
  }
  if (opts.out && opts.o === undefined) opts.o = opts.out;
  delete opts.out;
  if (words.length < spec.positional.length) throw new UsageError(`${command}: needs ${spec.positional.map(p => `<${p}>`).join(' ')}${words.length ? ` (got ${words.length})` : ''}`);
  if (words.length > spec.positional.length) throw new UsageError(`${command}: unexpected "${words[spec.positional.length]}" (a path with spaces needs quotes)`);
  const file = words[0];
  if (command === 'trim') {
    opts.start = parseTime(words[1], 'start');
    opts.end = parseTime(words[2], 'end');
    if (!opts.o) throw new UsageError('trim: needs -o <output file> (for example -o cut.mp4)');
    opts.out = opts.o; delete opts.o;
  }
  return { command, file, opts };
}

/** The output file's folder is made; an existing file is only replaced with --force. */
export function prepareOutput(out, { force = false } = {}) {
  if (fs.existsSync(out) && !force) throw new Error(`${out} already exists: pass --force to overwrite it`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
}

const defaultIo = { log: (s) => console.log(s), err: (s) => console.error(s) };

/** Filled in by the commands (probe, trim, frames, sound). Each is `(parsed, io) => exit code`. */
export const commands = {};

/** Runs a media command line; resolves to the exit code (0 done, 1 a problem, 2 usage). */
export async function runMedia(argv, io = defaultIo) {
  let parsed;
  try { parsed = parseMediaArgs(argv); }
  catch (e) { if (e instanceof UsageError) { io.err(`pixi-effects: ${e.message}\n${USAGE}`); return 2; } throw e; }
  const run = commands[parsed.command];
  if (!run) { io.err(`pixi-effects ${parsed.command}: not available in this build`); return 1; }
  try { return await run(parsed, io); }
  catch (e) {
    if (e instanceof UsageError) { io.err(`pixi-effects: ${e.message}\n${USAGE}`); return 2; }
    io.err(`pixi-effects ${parsed.command}: ${e && e.message ? e.message : String(e)}`);       // a sentence, never a stack
    return 1;
  }
}

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

/** One file by path, with `Range` (what the page's UrlSource reads by). */
function sendFile(req, res, file) {
  const stat = fs.statSync(file), size = stat.size;
  const headers = { 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' };
  const m = String(req.headers.range ?? '').match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] !== '' || m[2] !== '')) {
    const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);          // bytes=-n is the last n bytes
    const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start >= size || start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }).end(); return; }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).pipe(res);
}

/** Where mediabunny's browser bundle is (this package's own copy, so the page works offline and with the version pixi-effects uses). */
export function mediabunnyBundle() {
  const main = createRequire(import.meta.url).resolve('mediabunny');                  // .../dist/bundles/mediabunny.cjs (its package.json is not exported)
  return path.join(path.dirname(main), 'mediabunny.min.mjs');
}

/**
 * The tool's local server: the package folder as static files (the page `ai/tools/media-page.html`), plus
 *   GET|HEAD /__in/<id>      one registered input file, with Range (only the ids in `inputs`)
 *   PUT      /__out/<name>   a file the page made, into `outDir` (a plain file name only)
 *   GET      /__mb/mediabunny.min.mjs   mediabunny's bundle from this package
 *   GET      /__lib/<name>.js           a file of this package's dist/ by name (the sound measurement), nothing else
 * Resolves `{ server, port, close() }`.
 */
export async function serveMedia({ inputs, outDir, root = PACKAGE_ROOT }) {
  const { serve } = await import(pathToFileURL(path.join(HERE, 'check.mjs')).href);
  const onRequest = (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    let m;
    if ((m = p.match(/^\/__in\/([A-Za-z0-9_-]+)$/)) && (req.method === 'GET' || req.method === 'HEAD')) {
      const file = inputs.get(m[1]);
      if (!file || !fs.existsSync(file)) { res.writeHead(404).end('not found'); return true; }
      sendFile(req, res, file); return true;
    }
    if ((m = p.match(/^\/__out\/(.+)$/)) && req.method === 'PUT') {
      const name = m[1];
      if (!SAFE_NAME.test(name) || /^\.+$/.test(name)) { res.writeHead(400).end('bad file name'); return true; }
      fs.mkdirSync(outDir, { recursive: true });
      const ws = fs.createWriteStream(path.join(outDir, name));
      req.pipe(ws);
      ws.on('finish', () => res.writeHead(204).end());
      ws.on('error', () => res.writeHead(500).end());
      return true;
    }
    if (p === '/__mb/mediabunny.min.mjs') {
      const file = mediabunnyBundle();
      if (!fs.existsSync(file)) { res.writeHead(404).end('mediabunny is not installed next to pixi-effects'); return true; }
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res); return true;
    }
    if ((m = p.match(/^\/__lib\/([A-Za-z0-9._-]+\.js)$/))) {
      const file = path.join(root, 'dist', m[1]);
      if (!fs.existsSync(file)) { res.writeHead(404).end('not found'); return true; }
      res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res); return true;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end('this server only reads, and takes files at /__out/<name>'); return true; }
    return false;
  };
  const { server, port } = await serve(root, onRequest);
  return { server, port, close: () => new Promise(r => { server.close(r); server.closeAllConnections?.(); }) };
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(self)) {
  runMedia(process.argv.slice(2)).then(code => process.exit(code));
}
