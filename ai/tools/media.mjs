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

const isUrl = (s) => /^https?:\/\//i.test(s);
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** A path or a URL as a mediabunny input; a sentence for a path that cannot be read. */
async function openInput(file) {
  const mb = await import('mediabunny');
  mb.Logging.level = mb.LogLevel.Silent;                          // its own console lines ("Retrying failed fetch" with a stack) are not for an agent's output
  let source;
  if (isUrl(file)) source = new mb.UrlSource(file, { getRetryDelay: (attempts) => (attempts < 3 ? 0.3 * attempts : null) });       // seconds; its default never gives up, and a dead URL must be a sentence, not a hang
  else {
    const full = path.resolve(file);
    if (!fs.existsSync(full)) throw new Error(`no such file: ${file}`);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) throw new Error(`${file} is a folder, not a media file`);
    if (stat.size === 0) throw new Error(`${file} is empty`);
    source = new mb.FilePathSource(full);
  }
  const input = new mb.Input({ source, formats: mb.ALL_FORMATS });
  let format;
  try { format = await input.getFormat(); }
  catch (e) {
    if (isUrl(file)) throw new Error(`could not read ${file}: ${e && e.message ? e.message : e}`);
    throw new Error(`${file} is not a media file this tool can read (${String(e && e.message ? e.message : e).split('\n')[0]})`);
  }
  return { mb, input, format };
}

/** What is in a file: container, duration, size, one row per track, key packet times with `keyframes`, and notes about what an author would trip on. */
export async function probeFile(file, { keyframes = false } = {}) {
  const { mb, input, format } = await openInput(file);
  const notes = [];
  let duration;
  try { duration = await input.computeDuration(); }
  catch (e) { throw new Error(isUrl(file) ? `could not read ${file}: ${e.message}` : `${file}: could not read its duration (${e.message})`); }
  const bytes = isUrl(file) ? null : fs.statSync(path.resolve(file)).size;
  const video = [], audio = [];
  let keys;
  for (const track of await input.getTracks()) {
    if (track.isVideoTrack()) {
      const sink = new mb.EncodedPacketSink(track);
      const pts = [];
      for await (const p of sink.packets(undefined, undefined, { metadataOnly: true })) { pts.push(p.timestamp); if (pts.length >= 300) break; }       // the first 300 frames say how the rest are paced
      pts.sort((a, b) => a - b);
      const gaps = pts.slice(1).map((t, i) => t - pts[i]).filter(g => g > 0).sort((a, b) => a - b);
      const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
      const fpsVaries = gaps.length > 4 && median > 0 && (gaps[gaps.length - 1] - gaps[0]) / median > 0.35;
      const stats = await track.computePacketStats(300);
      const rotation = await track.getRotation();
      video.push({
        codec: track.codec, width: await track.getDisplayWidth(), height: await track.getDisplayHeight(), rotation,
        fps: round(stats.averagePacketRate, 2), fpsVaries, bitrate: Math.round(stats.averageBitrate),
      });
      if (rotation) notes.push(`rotated ${rotation}° (the file stores it sideways and asks players to turn it; frames, and anything that places the picture, need that turn)`);
      if (fpsVaries) notes.push(`variable frame rate (the gaps between frames range from ${round(gaps[0] * 1000, 1)} to ${round(gaps[gaps.length - 1] * 1000, 1)} ms): a clip from a phone or a screen recording; cut and sample by time, not by frame number`);
      if (keyframes && !keys) {
        keys = [];
        let packet = await sink.getFirstPacket({ metadataOnly: true });
        if (packet && packet.type !== 'key') packet = await sink.getNextKeyPacket(packet, { metadataOnly: true });
        while (packet && keys.length < 5000) { keys.push(round(packet.timestamp, 3)); packet = await sink.getNextKeyPacket(packet, { metadataOnly: true }); }
      }
    } else if (track.isAudioTrack()) {
      audio.push({ codec: track.codec, sampleRate: track.sampleRate, channels: track.numberOfChannels, bitrate: await track.getBitrate() });
    }
  }
  if (!video.length) notes.push('no video');
  if (!audio.length) notes.push('no audio');
  const report = { file, container: format.name, duration: round(duration, 3), bytes, video, audio, notes };
  if (keyframes) report.keyframes = keys ?? [];
  return report;
}

const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function probeText(r, keyframes) {
  const L = [`${r.file}`, `  ${r.container} · ${r.duration} s${r.bytes != null ? ` · ${kb(r.bytes)}` : ''}`];
  for (const v of r.video) L.push(`  video  ${v.codec} ${v.width}×${v.height} · ${v.fps}${v.fpsVaries ? ' (varies)' : ''} fps${v.bitrate ? ` · ${Math.round(v.bitrate / 1000)} kb/s` : ''}${v.rotation ? ` · rotated ${v.rotation}°` : ''}`);
  for (const a of r.audio) L.push(`  audio  ${a.codec} ${a.sampleRate} Hz · ${a.channels} ch${a.bitrate ? ` · ${Math.round(a.bitrate / 1000)} kb/s` : ''}`);
  if (keyframes) L.push(`  key packets at: ${r.keyframes.slice(0, 12).join(', ')}${r.keyframes.length > 12 ? `, … (${r.keyframes.length})` : ''} s`);
  for (const n of r.notes) L.push(`  note   ${n}`);
  return L.join('\n');
}

commands.probe = async ({ file, opts }, io) => {
  const r = await probeFile(file, { keyframes: !!opts.keyframes });
  io.log(opts.json ? JSON.stringify(r, null, 2) : probeText(r, !!opts.keyframes));
  return 0;
};



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
