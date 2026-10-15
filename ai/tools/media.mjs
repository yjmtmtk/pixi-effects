#!/usr/bin/env node
/**
 * pixi-effects probe | trim | frames | sound — look at, listen to and cut footage, with no ffmpeg installed.
 *
 *   npx pixi-effects probe  <file|url> [--keyframes] [--json]            what is in a file: container, duration, tracks, codecs, size, notes
 *   npx pixi-effects trim   <file|url> <start> <end> -o <out> [--exact] [--force] [--json]
 *                                                                        cut [start, end] (seconds, or 1:02.5): by COPY when it can (no re-encode, no loss),
 *                                                                        and it says the real times; --exact re-encodes so the start is the frame asked for
 *   npx pixi-effects audio  <file|url> -o <out.m4a> [--force] [--json]  the sound of a file, copied out (no re-encode): .m4a for AAC, .webm for Opus, .mka for any
 *   npx pixi-effects concat <a> <b> [<c> …] -o <out> [--force] [--json] join clips by copy (no re-encode): they must have the same codecs, shown size, rotation and sound; it says where each clip starts
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
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(HERE, '../..');

export class UsageError extends Error { constructor(message) { super(message); this.name = 'UsageError'; this.exitCode = 2; } }

export const USAGE = `usage:
  pixi-effects probe  <file|url> [--keyframes] [--json]
  pixi-effects trim   <file|url> <start> <end> -o <out> [--exact] [--force] [--json]
  pixi-effects audio  <file|url> -o <out.m4a> [--force] [--json]
  pixi-effects concat <a> <b> [<c> …] -o <out> [--force] [--json]
  pixi-effects frames <file|url> [--at 1,3.5,50%,f120,end] [--size 480] [--sheet] [-o dir] [--json]
  pixi-effects sound  <file|url> [--waveform] [-o dir] [--json]`;

/** How each command reads its command line: the positional words, and each option with the kind of value it takes. */
const COMMANDS = {
  probe:  { positional: ['file'], flags: { '--keyframes': 'bool', '--json': 'bool' } },
  trim:   { positional: ['file', 'start', 'end'], flags: { '-o': 'str', '--out': 'str', '--exact': 'bool', '--force': 'bool', '--json': 'bool', '--chrome': 'str' } },
  audio:  { positional: ['file'], flags: { '-o': 'str', '--out': 'str', '--force': 'bool', '--json': 'bool' } },
  concat: { positional: ['file', 'file'], variadic: true, flags: { '-o': 'str', '--out': 'str', '--force': 'bool', '--json': 'bool' } },
  frames: { positional: ['file'], flags: { '--at': 'str', '--size': 'num', '--sheet': 'bool', '-o': 'str', '--out': 'str', '--json': 'bool', '--chrome': 'str' } },
  sound:  { positional: ['file'], flags: { '--waveform': 'bool', '--window': 'num', '-o': 'str', '--out': 'str', '--json': 'bool', '--chrome': 'str' } },
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
  if (command === 'frames' && /^every$/i.test(opts.at ?? '')) throw new UsageError('frames: --at every needs its step in the same argument: write --at every:2s (or quote it: --at "every 2s"), also inside a list: --at "every:2s,end"');
  if (words.length < spec.positional.length) throw new UsageError(`${command}: needs ${spec.variadic ? `at least ${spec.positional.length} files` : spec.positional.map(p => `<${p}>`).join(' ')}${words.length ? ` (got ${words.length})` : ''}`);
  if (words.length > spec.positional.length && !spec.variadic) throw new UsageError(`${command}: unexpected "${words[spec.positional.length]}" (a path with spaces needs quotes)`);
  const file = words[0];
  if (command === 'concat') { opts.inputs = words; if (!opts.o) throw new UsageError('concat: needs -o <output file> (for example -o joined.mp4)'); opts.out = opts.o; delete opts.o; }
  if (command === 'audio') { if (!opts.o) throw new UsageError('audio: needs -o <output file> (for example -o sound.m4a)'); opts.out = opts.o; delete opts.o; }
  if (command === 'sound' && opts.window !== undefined && !(opts.window >= 0.05 && opts.window <= 60)) throw new UsageError(`sound: --window is the width of a level row in seconds, from 0.05 to 60 (got ${opts.window})`);
  if (command === 'trim') {
    opts.start = parseTime(words[1], 'start');
    opts.end = parseTime(words[2], 'end');
    if (!opts.o) throw new UsageError('trim: needs -o <output file> (for example -o cut.mp4)');
    opts.out = opts.o; delete opts.o;
  }
  return { command, file, opts };
}

/** Is this the very same file (not just the same spelling: `a.mp4` and `A.MP4` are one file on a disk that ignores case, a link is one too)? */
export function sameFile(a, b) {
  try { const x = fs.statSync(a), y = fs.statSync(b); return x.ino === y.ino && x.dev === y.dev; } catch { return path.resolve(a) === path.resolve(b); }
}

/**
 * The output file's folder is made; an existing file is only replaced with --force. Returns `{ undo() }`: it removes the folders THIS call made (when they are empty), so a command
 * that fails after this leaves no empty `newdir/sub` behind.
 */
export function prepareOutput(out, { force = false } = {}) {
  if (fs.existsSync(out) && !force) throw new Error(`${out} already exists: pass --force to overwrite it`);
  const dir = path.dirname(path.resolve(out));
  const made = [];
  for (let d = dir; !fs.existsSync(d); d = path.dirname(d)) made.push(d);              // deepest first
  fs.mkdirSync(dir, { recursive: true });
  return { undo() { for (const d of made) { try { fs.rmdirSync(d); } catch { break; } } } };
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
      const first = await track.getFirstTimestamp(), end = await track.computeDuration();
      video.push({
        codec: track.codec, width: await track.getDisplayWidth(), height: await track.getDisplayHeight(), rotation,
        fps: round(stats.averagePacketRate, 2), fpsVaries, bitrate: Math.round(stats.averageBitrate),
        first: round(first, 4), end: round(end, 6), frameGap: round(median, 6),
        stored: { width: await track.getCodedWidth(), height: await track.getCodedHeight() },
      });
      if (first > 0.05) notes.push(`the video starts at ${round(first, 3)} s (its first frame is not at 0, so the sound can start before the picture; frames before ${round(first, 3)} s show the first frame)`);
      if (rotation) notes.push(`rotated ${rotation}° clockwise: stored ${await track.getCodedWidth()}×${await track.getCodedHeight()}, shown ${await track.getDisplayWidth()}×${await track.getDisplayHeight()} (frames and anything that places the picture use the shown size; whether the picture then reads upright depends on how the file was made, so look at a frame)`);
      if (fpsVaries) notes.push(`variable frame rate (the gaps between frames range from ${round(gaps[0] * 1000, 1)} to ${round(gaps[gaps.length - 1] * 1000, 1)} ms): a clip from a phone or a screen recording; cut and sample by time, not by frame number`);
      if (keyframes && !keys) {
        keys = [];
        let packet = await sink.getFirstPacket({ metadataOnly: true });
        if (packet && packet.type !== 'key') packet = await sink.getNextKeyPacket(packet, { metadataOnly: true });
        while (packet && keys.length < 5000) { keys.push(round(packet.timestamp, 3)); packet = await sink.getNextKeyPacket(packet, { metadataOnly: true }); }
      }
    } else if (track.isAudioTrack()) {
      const stats = await track.computePacketStats(300);                                                 // measured from the packets, like the video's: a declared figure and a measured one made a cut look re-encoded
      audio.push({ codec: track.codec, sampleRate: track.sampleRate, channels: track.numberOfChannels, bitrate: Math.round(stats.averageBitrate) });
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
  for (const v of r.video) L.push(`  video  ${v.codec} ${v.width}×${v.height}${v.rotation ? ` shown (stored ${v.stored.width}×${v.stored.height}, turned ${v.rotation}° clockwise)` : ''} · ${v.fps}${v.fpsVaries ? ' (varies)' : ''} fps${v.bitrate ? ` · ${Math.round(v.bitrate / 1000)} kb/s` : ''}`);
  for (const a of r.audio) L.push(`  audio  ${a.codec} ${a.sampleRate} Hz · ${a.channels} ch${a.bitrate ? ` · ${Math.round(a.bitrate / 1000)} kb/s` : ''}`);
  if (keyframes && r.video.length) L.push(`  key packets at: ${r.keyframes.slice(0, 12).join(', ')}${r.keyframes.length > 12 ? `, … (${r.keyframes.length})` : ''} s`);
  for (const n of r.notes) L.push(`  note   ${n}`);
  return L.join('\n');
}

commands.probe = async ({ file, opts }, io) => {
  const r = await probeFile(file, { keyframes: !!opts.keyframes });
  io.log(opts.json ? JSON.stringify(r, null, 2) : probeText(r, !!opts.keyframes));
  return 0;
};

const OUTPUT_FORMATS = { '.mp4': 'Mp4OutputFormat', '.m4v': 'Mp4OutputFormat', '.m4a': 'Mp4OutputFormat', '.mov': 'MovOutputFormat', '.webm': 'WebMOutputFormat', '.mkv': 'MkvOutputFormat', '.mka': 'MkvOutputFormat' };

/**
 * What a cut by copy of [start, stop) really contains: it starts on the first key frame at or after `start` (a copy cannot start between key frames) and ends with the
 * last frame that is wholly before `stop`. `{ from, to }` in the file's own seconds, or `{ none: true, before, after }` (the key frames around the range) when no key frame
 * is inside it. A sound has no key frames: any packet is one.
 */
async function copyWindow(mb, input, start, stop) {
  const track = (await input.getPrimaryVideoTrack()) ?? (await input.getPrimaryAudioTrack());
  if (!track) return null;
  const sink = new mb.EncodedPacketSink(track);
  const meta = { metadataOnly: true };
  let key = await sink.getKeyPacket(start, meta);
  const before = key ? key.timestamp : null;
  if (!key || key.timestamp < start - 1e-6) key = key ? await sink.getNextKeyPacket(key, meta) : await sink.getFirstPacket(meta);
  if (!key || key.timestamp >= stop - 1e-6) return { none: true, before, after: key ? key.timestamp : null };
  let end = key.timestamp;
  for await (const p of sink.packets(key, undefined, meta)) {
    if (p.timestamp > stop + 4) break;                                 // the reorder window of a frame is far inside this
    if (p.timestamp + p.duration <= stop + 1e-6) end = Math.max(end, p.timestamp + p.duration);
  }
  return { from: key.timestamp, to: end };
}

/**
 * Cuts [start, end] out of a file. By copy when the codecs allow (no re-encode, no loss): it can only start on a frame and the container's rules decide how the start is
 * made (`boundary`). With `exact` the cut is re-encoded in the browser so it starts on the frame asked for (see `trimExact`). The result says what was really done.
 */
export async function trimFile({ input: file, start, end, out, exact = false, force = false, chrome = null, requestLog = null, copy = { boundaryPolicy: 'shrink', shiftTolerance: Infinity } }) {
  const env = { chrome, requestLog };
  if (!(end > start)) throw new UsageError(`start must be before end (got ${start} and ${end})`);
  if (start < 0) throw new UsageError(`start must not be negative (got ${start})`);
  const ext = path.extname(out).toLowerCase();
  if (!OUTPUT_FORMATS[ext]) throw new UsageError(`cannot write "${ext || out}": name the output .mp4, .mov, .webm, .mkv or .m4a`);
  if (!isUrl(file) && sameFile(file, out)) throw new Error(`the output ${out} would overwrite the input: choose another name`);
  const { mb, input } = await openInput(file);
  const duration = await input.computeDuration();
  const notes = [];
  if (start >= duration) throw new Error(`start ${start} s is past the end of the file (${round(duration, 3)} s)`);
  let stop = end;
  if (end > duration) { stop = duration; notes.push(`end is past the file (${round(duration, 3)} s): cut at ${round(duration, 3)}`); }
  if (exact) return trimExact({ mb, input, file, start, end, stop, duration, out, ext, force, notes, env });
  const { input: probe } = await openInput(file);
  const window = await copyWindow(mb, probe, start, stop);
  if (window && window.none) {
    const around = [window.before, window.after].filter(t => t !== null).map(t => `${round(t, 3)} s`).join(' and ');
    throw new Error(`no key frame between ${start} s and ${round(stop, 3)} s${around ? ` (the nearest are at ${around})` : ''}: a copy can only start on a key frame, so a cut this short cannot be copied; use --exact (re-encodes, needs Chrome)`);
  }
  // The cut is made aside and moved into place only when it worked: a refused or failed copy must leave nothing, and must never truncate a file that was already there.
  const aside = path.join(path.dirname(path.resolve(out)), `.pixi-effects-${process.pid}-${Date.now()}${ext}`);
  const copyOptions = { mode: 'forced', ...copy };
  const trimRange = { start: window ? window.from : start, end: stop };
  {                                                                      // can it be copied into this type? asked of a throwaway output in memory, so a refusal creates no file
    const trial = new mb.Output({ format: new mb[OUTPUT_FORMATS[ext]](), target: new mb.BufferTarget() });
    const dry = await mb.Conversion.init({ input, output: trial, trim: trimRange, copy: copyOptions, showWarnings: false });
    const refused = !dry.isValid || dry.discardedTracks.length;
    const why = dry.discardedTracks.map(d => `${d.track.type}: ${d.reason}`).join(', ');
    try { await trial.cancel(); } catch { /* it had not started */ }
    if (refused) throw new Error(`${file} cannot be cut by copy into ${ext} (${why || 'no track can be copied'}): use a different output type, or --exact (re-encodes, needs Chrome)`);
  }
  const { input: again } = await openInput(file);                        // a Conversion consumes its input: the real one gets a fresh one
  const prepared = prepareOutput(out, { force });
  let output = null;
  try {
    output = new mb.Output({ format: new mb[OUTPUT_FORMATS[ext]](), target: new mb.FilePathTarget(aside) });
    // The cut STARTS ON THE KEY FRAME (`window.from`), not on the time asked: a copy asked to start between key frames leaves the picture starting late (at key frame − start) while the sound
    // starts at the time asked, so the file is longer than the cut and has sound over nothing. Starting on the key frame gives picture and sound that start together, at 0.
    const conversion = await mb.Conversion.init({ input: again, output, trim: trimRange, copy: copyOptions, showWarnings: false });
    await conversion.execute();
    fs.renameSync(aside, path.resolve(out));
    const tracks = conversion.utilizedTracks.map(t => `${t.type} ${t.codec ?? ''}`.trim());
    // what the cut really is: read the FILE back (its first picture and how long it lasts), not a prediction
    const { input: made } = await openInput(out);
    const lead = (await made.getPrimaryVideoTrack()) ?? (await made.getPrimaryAudioTrack());
    const from = window ? window.from : start;
    const actual = lead ? [round(from + (await lead.getFirstTimestamp()), 3), round(from + (await lead.computeDuration()), 3)] : [start, stop];
    if (actual[0] - start > 1e-3) notes.push(`a copy can only start on a key frame: it starts on the next key frame, ${actual[0]} s, not ${start} s (${round(actual[0] - start, 3)} s later); use --exact to start on ${start} s (re-encodes, needs Chrome), or probe --keyframes to pick a key frame`);
    return { requested: [start, end], actual, mode: 'copy', reencoded: false, tracks, bytes: fs.statSync(path.resolve(out)).size, out, notes };
  } catch (e) {
    try { await output?.cancel(); } catch { /* it had not started */ }                 // close its file handle first, or the file comes back after it is removed
    prepared.undo();
    throw e;
  } finally { fs.rmSync(aside, { force: true }); }
}

/** The cut re-encoded in the browser, so it starts on the frame asked for. The file is made in a temporary folder (the page may only write plain names) and moved to `out`. */
async function trimExact({ mb, input, file, start, end, stop, duration, out, ext, force, notes, env }) {
  const prepared = prepareOutput(out, { force });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pixi-effects-trim-'));
  try {
    const { withBrowser } = await import(pathToFileURL(path.join(HERE, 'mediaBrowser.mjs')).href);
    const inputs = new Map([['t1', isUrl(file) ? file : path.resolve(file)]]);
    const name = `cut${ext}`;
    await withBrowser({ chrome: env.chrome, inputs, outDir: tmp, requestLog: env.requestLog }, ({ call }) => call('trimExact', { id: 't1', start, end: stop, ext, outName: name }));
    fs.copyFileSync(path.join(tmp, name), path.resolve(out));
  } catch (e) {
    prepared.undo();
    throw e;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  const made = await probeFile(out);
  // the frame the cut starts on: the first frame at or after the start (frames are on a grid, so a start between two is the next)
  const track = await input.getPrimaryVideoTrack();
  let from = start;
  if (track) {
    const sink = new mb.EncodedPacketSink(track);
    const key = (await sink.getKeyPacket(start, { metadataOnly: true })) ?? (await sink.getFirstPacket({ metadataOnly: true }));
    const times = [];
    if (key) for await (const p of sink.packets(key, undefined, { metadataOnly: true })) { times.push(p.timestamp); if (p.timestamp > start + 4) break; }
    const after = times.filter(t => t >= start - 1e-6).sort((a, b) => a - b)[0];
    if (after !== undefined) from = after;
  }
  // the end is the FILE's own (where its picture stops), not the end asked for: a re-encoded cut lasts to the frame boundary, and the report says what it lasts
  const lasts = made.video.length ? made.video[0].end - made.video[0].first : made.duration;
  const actual = [round(from, 3), round(from + lasts, 3)];
  const tracks = [...made.video.map(v => `video ${v.codec}`), ...made.audio.map(a => `audio ${a.codec}`)];
  const sourceCodec = track ? track.codec : null;
  if (made.video.length && sourceCodec && made.video[0].codec !== sourceCodec) notes.push(`the picture was re-encoded as ${made.video[0].codec} (the source is ${sourceCodec}): a re-encode uses the usual codec of the output type, so the file is a different codec and size from the source`);
  return { requested: [start, end], actual, mode: 'reencode', reencoded: true, tracks, bytes: fs.statSync(path.resolve(out)).size, out, notes };
}

function trimText(r) {
  const L = [`${r.out}  ${kb(r.bytes)}`, `  asked ${r.requested[0]}–${r.requested[1]} s, got ${r.actual[0]}–${r.actual[1]} s`, r.reencoded ? `  re-encoded: ${r.tracks.join(', ')}` : `  copied: ${r.tracks.join(', ')} (no re-encode)`];
  for (const n of r.notes) L.push(`  note   ${n}`);
  return L.join('\n');
}

commands.trim = async ({ file, opts }, io, env = {}) => {
  const r = await trimFile({ input: file, start: opts.start, end: opts.end, out: opts.out, exact: !!opts.exact, force: !!opts.force, chrome: opts.chrome ?? null, requestLog: env.requestLog ?? null });
  io.log(opts.json ? JSON.stringify(r, null, 2) : trimText(r));
  return 0;
};




/** Runs a media command line; resolves to the exit code (0 done, 1 a problem, 2 usage). */
export async function runMedia(argv, io = defaultIo, env = {}) {
  let parsed;
  try { parsed = parseMediaArgs(argv); }
  catch (e) { if (e instanceof UsageError) { io.err(`pixi-effects: ${e.message}\n${USAGE}`); return 2; } throw e; }
  const run = commands[parsed.command];
  if (!run) { io.err(`pixi-effects ${parsed.command}: not available in this build`); return 1; }
  try { return await run(parsed, io, env); }
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
  if (!stat.isFile()) { res.writeHead(404).end('not a file'); return; }
  const headers = { 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'access-control-allow-origin': '*', 'content-type': 'application/octet-stream' };
  const m = String(req.headers.range ?? '').match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] !== '' || m[2] !== '')) {
    const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);          // bytes=-n is the last n bytes
    const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start >= size || start > end) { res.writeHead(416, { 'content-range': `bytes */${size}` }).end(); return; }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': end - start + 1 });
    if (req.method === 'HEAD') { res.end(); return; }
    fs.createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': size });
  if (req.method === 'HEAD') { res.end(); return; }
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
}

/** A remote input, passed through with its Range (the page may not be allowed to read the other site, and this adds no CORS rules to learn). */
async function proxy(req, res, url) {
  try {
    const { Readable } = await import('node:stream');
    const up = await fetch(url, { headers: req.headers.range ? { range: req.headers.range } : {} });
    const headers = { 'cache-control': 'no-store', 'access-control-allow-origin': '*' };
    for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges']) if (up.headers.get(h)) headers[h] = up.headers.get(h);
    res.writeHead(up.status, headers);
    if (req.method === 'HEAD' || !up.body) { res.end(); return; }
    Readable.fromWeb(up.body).on('error', () => res.destroy()).pipe(res);
  } catch (e) { if (!res.headersSent) res.writeHead(502).end(`could not read ${url}: ${e.message}`); else res.destroy(); }
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
export async function serveMedia({ inputs, outDir, root = PACKAGE_ROOT, requestLog = null }) {
  const { serve } = await import(pathToFileURL(path.join(HERE, 'check.mjs')).href);
  const onRequest = (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    let m;
    if ((m = p.match(/^\/__in\/([A-Za-z0-9_-]+)$/)) && (req.method === 'GET' || req.method === 'HEAD')) {
      const file = inputs.get(m[1]);
      requestLog?.push({ id: m[1], range: req.headers.range ?? null });
      if (file && isUrl(file)) { proxy(req, res, file); return true; }
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

const MAX_FRAMES = 60;
const AT_HELP = 'use seconds (3.5), a percentage (50%), a frame (f120), start, end or every:2s';

/**
 * `--at` for a file with no layers: `3.5`, `50%`, `f120`, `start`, `end` (the last frame), `every 2s`, separated by commas → [{ t, label }] (a label safe in a file name).
 * The same words as `check --at` where they overlap; a time outside the file is refused with the length of the file in the sentence.
 */
export function parseTimes(list, { duration, fps, first = 0, last: lastFrame }) {
  const out = [], seen = new Set(), last = Math.max(first, lastFrame ?? duration - 1 / fps);
  // A frame is shown from its own time until the next frame's: a time asked for a FRAME (f12, start, end) rounds UP to four decimals, never down (1/30 s as 0.0333 is
  // before frame 1 and gives frame 0). A time asked in seconds is the instant asked for, and keeps the plain rounding.
  const onFrame = t => Math.ceil(t * 1e4 - 1e-7) / 1e4 + 0;                  // + 0: Math.ceil(-0.00000001) is -0
  const add = (t, label) => { if (!seen.has(label)) { seen.add(label); out.push({ t, label }); } };
  const inside = (t, raw) => { if (t > duration + 1e-6) throw new Error(`${raw} s is past the end of the file (${round(duration, 3)} s)`); return Math.min(t, last > t ? t : Math.max(t, 0)); };
  for (const raw of String(list).split(',').map(x => x.trim()).filter(Boolean)) {
    let m;
    if ((m = raw.match(/^every(?:\s+|:)(\d+(?:\.\d+)?)\s*s?$/i))) {
      const step = Number(m[1]);
      if (!(step > 0)) throw new Error(`--at "${raw}": every needs a step above 0 (every 2s)`);
      const n = Math.ceil(duration / step);
      if (n > MAX_FRAMES) throw new Error(`--at "${raw}": that is ${n} frames of a ${round(duration, 1)} s file, too many (at most ${MAX_FRAMES}): a larger step, or a range of times`);
      for (let k = 0; k * step < duration - 1e-6; k++) add(round(k * step, 4), `${round(k * step, 2).toFixed(2)}s`);
    } else if (/^start$/i.test(raw)) add(onFrame(first), 'start');
    else if (/^end$/i.test(raw)) add(onFrame(last), 'end');
    else if ((m = raw.match(/^(\d+(?:\.\d+)?)%$/))) {
      if (Number(m[1]) > 100) throw new Error(`--at "${raw}": a percentage is 0–100`);
      add(round(Math.min(last, duration * Number(m[1]) / 100), 4), `${m[1]}pct`);
    } else if ((m = raw.match(/^f(\d+)$/i))) add(onFrame(inside(Number(m[1]) / fps, `frame ${m[1]} is ${round(Number(m[1]) / fps, 3)}`)), `f${m[1]}`);
    else if (/^\d+(\.\d+)?$/.test(raw)) add(round(inside(Number(raw), raw), 4), `${Number(raw).toFixed(2)}s`);
    else throw new Error(`--at: cannot read "${raw}": ${AT_HELP}`);
  }
  if (!out.length) throw new Error(`--at is empty: ${AT_HELP}`);
  if (out.length > MAX_FRAMES) throw new Error(`--at asks for ${out.length} frames, too many (at most ${MAX_FRAMES})`);
  return out;
}

commands.frames = async ({ file, opts }, io, env = {}) => {
  const probe = await probeFile(file);
  if (!probe.video.length) throw new Error(`no video track in ${file} (${probe.notes.join('; ')}): frames takes a video`);
  const v = probe.video[0];
  const times = parseTimes(opts.at ?? '0,25%,50%,75%,end', { duration: v.end, fps: v.fps || 30, first: v.first, last: v.end - (v.frameGap || 1 / (v.fps || 30)) });          // the VIDEO's own length and last frame (a file's audio may be longer)
  const outDir = path.resolve(opts.o ?? `${path.basename(file).replace(/\.[^.]*$/, '') || 'video'}-frames`);
  if (fs.existsSync(outDir) && !fs.statSync(outDir).isDirectory()) throw new Error(`${outDir} is a file, not a folder: frames writes its pictures into a folder (-o <folder>)`);
  const { withBrowser } = await import(pathToFileURL(path.join(HERE, 'mediaBrowser.mjs')).href);
  const inputs = new Map([['f1', isUrl(file) ? file : path.resolve(file)]]);
  const r = await withBrowser({ chrome: opts.chrome, inputs, outDir, requestLog: env.requestLog }, ({ call }) => call('frames', { id: 'f1', times, size: opts.size ?? 480, sheet: !!opts.sheet }));
  const report = { file, duration: probe.duration, outDir, frames: r.frames.map(f => ({ ...f, path: path.join(outDir, f.file) })), sheet: r.sheet };
  if (opts.json) io.log(JSON.stringify(report, null, 2));
  else {
    const L = [`${r.frames.length} frame(s) of ${file} → ${outDir}${path.sep}`];
    for (const f of r.frames) L.push(`  ${f.file}  ${round(f.actual, 3)} s${Math.abs(f.actual - f.requested) > 1 / (probe.video[0].fps || 30) ? ` (asked ${f.requested})` : ''}  ${f.width}×${f.height}`);
    if (r.sheet) L.push(`  ${r.sheet}  all of them, with their times`);
    io.log(L.join('\n'));
  }
  return 0;
};

/** The longest sound `sound` decodes into memory (a stereo hour would be gigabytes). */
export const SOUND_MAX_SECONDS = 600;

function soundText(r, file, waveform) {
  const dbText = (n) => (n === null || n === undefined ? 'n/a' : String(n));
  const span = (w) => `${round(w.from, 2)}–${round(w.to, 2)} s (${w.rmsDb.toFixed(1)} dBFS rms)`;
  const L = [`${file}`, `  ${r.duration} s · ${r.sampleRate} Hz · ${r.channels} ch`,
    `  loudness  ${dbText(r.loudness.integratedLufs)} LUFS · true peak ${dbText(r.loudness.truePeakDb)} dBTP · peak ${dbText(r.peakDb)} dBFS · ${r.loudness.clippedSamples} sample(s) at full scale`];
  L.push(`  silences  ${r.loudness.silences.length ? r.loudness.silences.slice(0, 6).map(q => `${round(q.from, 1)}–${round(q.to, 1)} s`).join(', ') + (r.loudness.silences.length > 6 ? `, … (${r.loudness.silences.length})` : '') : 'none (nothing quieter than −60 dBFS for a second or more)'}`);
  if (r.loudest) L.push(`  loudest   ${span(r.loudest)}`, `  quietest  ${span(r.quietest)}   (rows of ${r.window} s)`);
  const step = Math.max(1, Math.ceil(r.windows.length / 16));
  L.push(`  level     ${r.windows.filter((_, i) => i % step === 0).map(w => w.rmsDb.toFixed(1)).join(' ')} dBFS rms, every ${round(step * r.window, 2)} s from 0`);
  if (r.reference) {
    const ref = r.reference, d = ref.luToTarget;
    const where = d > 0 ? `${d} LU under −14` : d < -2 ? `${-d} LU over −14` : 'within the usual range';
    L.push(`  reference web video is typically −14 to −16 LUFS: this is ${where} · headroom ${ref.headroomDb} dB before the true peak reaches −1 dBTP${ref.raiseToTargetNeedsLimiter ? ' (raising it to −14 would need a limiter)' : ''}`);
  }
  for (const n of r.notes.slice(0, 3)) L.push(`  note      ${n}`);
  if (r.notes.length > 3) L.push(`  note      … ${r.notes.length - 3} more (--json)`);
  if (waveform) L.push(`  ${waveform}`);
  return L.join('\n');
}

commands.sound = async ({ file, opts }, io, env = {}) => {
  const probe = await probeFile(file);
  if (!probe.audio.length) throw new Error(`no audio track in ${file}${probe.video.length ? ' (it is a video with no sound)' : ''}: sound measures the sound of a file`);
  if (probe.duration > SOUND_MAX_SECONDS) throw new Error(`${file} is ${round(probe.duration, 0)} s long: sound decodes the whole sound into memory, so it takes up to ${SOUND_MAX_SECONDS} s; for longer files use ffmpeg (ffmpeg -i file -af ebur128 -f null -) or measure a part (trim it first)`);
  const outDir = path.resolve(opts.o ?? `${path.basename(file).replace(/\.[^.]*$/, '') || 'sound'}-sound`);
  const { withBrowser } = await import(pathToFileURL(path.join(HERE, 'mediaBrowser.mjs')).href);
  const inputs = new Map([['s1', isUrl(file) ? file : path.resolve(file)]]);
  const window = opts.window ?? Math.max(1, probe.duration / 120);                  // a row per second for a short file, at most ~120 rows for a long one; --window sets it
  const r = await withBrowser({ chrome: opts.chrome, inputs, outDir, requestLog: env.requestLog }, ({ call }) => call('sound', { id: 's1', waveform: !!opts.waveform, window }));
  const rows = r.windows;
  const span = (w) => w && { from: round(w.t, 3), to: round(Math.min(w.t + window, r.duration), 3), rmsDb: w.rmsDb };
  const loudest = rows.length ? rows.reduce((best, w) => (w.rmsDb > best.rmsDb ? w : best), rows[0]) : null;
  const quietest = rows.length ? rows.reduce((best, w) => (w.rmsDb < best.rmsDb ? w : best), rows[0]) : null;
  const lufs = r.loudness.integratedLufs;
  // the loudness the web usually wants, and how much room there is to get there: numbers an agent can act on (raising by the gap needs the headroom, or a limiter)
  const reference = lufs === null ? null : { webTargetLufs: [-16, -14], luToTarget: round(-14 - lufs, 1), headroomDb: round(-1 - r.loudness.truePeakDb, 1), raiseToTargetNeedsLimiter: -14 - lufs > -1 - r.loudness.truePeakDb };
  const report = { file, ...r, window: round(window, 3), loudest: span(loudest), quietest: span(quietest), reference, waveform: r.waveform ? path.join(outDir, r.waveform) : null };
  io.log(opts.json ? JSON.stringify(report, null, 2) : soundText(report, file, report.waveform));
  return 0;
};

/** A note when the sound began later than the picture in the source: a file of the sound alone starts at 0, so that offset is gone. */
async function soundLead(input, audioTrack) {
  const a = await audioTrack.getFirstTimestamp();
  const video = await input.getPrimaryVideoTrack();
  const v = video ? await video.getFirstTimestamp() : 0;
  const lead = Math.max(a, 0) - Math.max(v, 0);
  return lead > 0.05 ? `the sound started ${round(lead, 3)} s after the picture in the source (it begins at 0 in this file, so that offset is gone)` : null;
}

const AUDIO_HOME = { aac: '.m4a', opus: '.webm', vorbis: '.webm' };

/**
 * Takes the sound out of a file by copy: the audio packets are the source's own bytes in a file of their own. The output is made aside and moved into place when it worked
 * (a refusal leaves nothing and never empties a file that was there).
 */
export async function audioFile({ input: file, out, force = false }) {
  const ext = path.extname(out).toLowerCase();
  if (!OUTPUT_FORMATS[ext]) throw new UsageError(`cannot write "${ext || out}": name the output .m4a, .webm, .mka, .mp4, .mov or .mkv`);
  if (!isUrl(file) && sameFile(file, out)) throw new Error(`the output ${out} would overwrite the input: choose another name`);
  const { mb, input } = await openInput(file);
  const track = await input.getPrimaryAudioTrack();
  if (!track) throw new Error(`no audio track in ${file}: audio takes the sound out of a file that has some`);
  const options = { video: { discard: true }, copy: { mode: 'forced' }, showWarnings: false };
  const refusal = `${file} has ${track.codec} sound, which a ${ext} file cannot hold by copy: write it as ${AUDIO_HOME[track.codec] ?? '.mka'} (or .mka, which holds any codec)`;
  {                                                                      // can the output type hold it? asked of a throwaway output in memory: a refusal creates no file
    const trial = new mb.Output({ format: new mb[OUTPUT_FORMATS[ext]](), target: new mb.BufferTarget() });
    const dry = await mb.Conversion.init({ input, output: trial, ...options });
    const refused = !dry.isValid || dry.discardedTracks.some(d => d.reason !== 'discarded_by_user');
    try { await trial.cancel(); } catch { /* it had not started */ }
    if (refused) throw new Error(refusal);
  }
  const { input: again } = await openInput(file);
  const lead = await soundLead(input, track);
  const prepared = prepareOutput(out, { force });
  const aside = path.join(path.dirname(path.resolve(out)), `.pixi-effects-${process.pid}-${Date.now()}${ext}`);
  let output = null;
  try {
    output = new mb.Output({ format: new mb[OUTPUT_FORMATS[ext]](), target: new mb.FilePathTarget(aside) });
    const conversion = await mb.Conversion.init({ input: again, output, ...options });
    await conversion.execute();
    fs.renameSync(aside, path.resolve(out));
  } catch (e) {
    try { await output?.cancel(); } catch { /* it had not started */ }
    prepared.undo();
    throw e;
  } finally { fs.rmSync(aside, { force: true }); }
  const { input: made } = await openInput(out);
  const a = await made.getPrimaryAudioTrack();
  const notes = lead ? [lead] : [];
  return { file, out, mode: 'copy', reencoded: false, codec: a.codec, sampleRate: a.sampleRate, channels: a.numberOfChannels, duration: round(await a.computeDuration(), 3), bytes: fs.statSync(path.resolve(out)).size, notes };
}

commands.audio = async ({ file, opts }, io) => {
  const r = await audioFile({ input: file, out: opts.out, force: !!opts.force });
  io.log(opts.json ? JSON.stringify(r, null, 2) : [`${r.out}  ${kb(r.bytes)}`, `  ${r.codec} ${r.sampleRate} Hz · ${r.channels} ch · ${r.duration} s, copied (no re-encode)`, ...r.notes.map(n => `  note   ${n}`)].join('\n'));
  return 0;
};

/** What decides whether clips can be joined by copy: the codecs AND their decoder parameters, the SHOWN size and rotation of the picture, and the sound's codec, rate and channels. */
async function describeClip(input) {
  const v = await input.getPrimaryVideoTrack(), a = await input.getPrimaryAudioTrack();
  const vc = v ? await v.getDecoderConfig() : null, ac = a ? await a.getDecoderConfig() : null;
  const hex = (d) => (d ? Buffer.from(d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength)).toString('hex') : '');
  return {
    video: v ? { codec: v.codec, width: await v.getDisplayWidth(), height: await v.getDisplayHeight(), rotation: await v.getRotation(), config: `${vc?.codec ?? ''}|${hex(vc?.description)}` } : null,
    audio: a ? { codec: a.codec, rate: a.sampleRate, channels: a.numberOfChannels, config: `${ac?.codec ?? ''}|${hex(ac?.description)}` } : null,
    audioTracks: (await input.getAudioTracks()).length,
  };
}

function differences(a, b) {
  const d = [];
  if (!!a.video !== !!b.video) d.push(a.video ? 'the first has a picture, the other has none' : 'the first has no picture, the other has one');
  else if (a.video) {
    if (a.video.codec !== b.video.codec) d.push(`video codec ${a.video.codec} against ${b.video.codec}`);
    else if (a.video.config !== b.video.config) d.push(`the ${a.video.codec} decoder parameters differ (the same codec encoded with other settings: profile, level or parameter sets; a joined file can carry only the first clip's, so the others would decode as garbage)`);
    if (a.video.width !== b.video.width || a.video.height !== b.video.height) d.push(`shown size ${a.video.width}×${a.video.height} against ${b.video.width}×${b.video.height}`);
    if (a.video.rotation !== b.video.rotation) d.push(`rotation ${a.video.rotation}° against ${b.video.rotation}°`);
  }
  if (!!a.audio !== !!b.audio) d.push(a.audio ? 'the first has sound, the other has none' : 'the first has no sound, the other has some');
  else if (a.audio) {
    if (a.audio.codec !== b.audio.codec) d.push(`audio codec ${a.audio.codec} against ${b.audio.codec}`);
    else if (a.audio.config !== b.audio.config && a.audio.rate === b.audio.rate && a.audio.channels === b.audio.channels) d.push(`the ${a.audio.codec} sound's decoder parameters differ`);
    if (a.audio.rate !== b.audio.rate) d.push(`sample rate ${a.audio.rate} against ${b.audio.rate} Hz`);
    if (a.audio.channels !== b.audio.channels) d.push(`${a.audio.channels} against ${b.audio.channels} audio channels`);
  }
  return d;
}

/**
 * Joins clips one after another by copy (no re-encode): their packets are the sources' own bytes. Every clip starts where the longest track of the one before it ends, and its
 * picture and sound keep their own offset to each other (one start per clip, not one per track), so they stay together however many are joined. The encoder-delay packet of AAC
 * (before 0) is not copied: in the middle of a file it decodes to silence. Clips that differ in a way a copy cannot hide are refused with what differs.
 */
export async function concatFiles({ inputs, out, force = false }) {
  const ext = path.extname(out).toLowerCase();
  if (!OUTPUT_FORMATS[ext]) throw new UsageError(`cannot write "${ext || out}": name the output .mp4, .mov, .webm, .mkv or .m4a`);
  for (const f of inputs) if (!isUrl(f) && sameFile(f, out)) throw new Error(`the output ${out} would overwrite the input ${f}: choose another name`);
  let mb = null;
  const kinds = [];
  for (const file of inputs) {                                           // one clip open at a time: hundreds of inputs must not hold a file each
    const o = await openInput(file);
    mb = o.mb;
    kinds.push(await describeClip(o.input));
    o.input.dispose();
  }
  for (let i = 1; i < kinds.length; i++) {
    const d = differences(kinds[0], kinds[i]);
    if (d.length) throw new Error(`${inputs[i]} cannot be joined to ${inputs[0]} by copy: ${d.join('; ')}; a copy needs the same codecs, decoder parameters, shown size, rotation and sound in every clip, so make them the same first (ffmpeg's concat filter does that)`);
  }
  const first = kinds[0];
  if (!first.video && !first.audio) throw new Error(`${inputs[0]} has no picture and no sound to join`);
  if (first.video && (ext === '.m4a' || ext === '.mka')) throw new Error(`a ${ext} file is for sound: the clips have a picture, so name the output .mp4, .mov, .webm or .mkv`);
  const notes = [];
  kinds.forEach((k, i) => { if (k.audioTracks > 1) notes.push(`clip ${i + 1} (${path.basename(inputs[i])}) has ${k.audioTracks} sound tracks: only the first sound track is joined`); });
  const prepared = prepareOutput(out, { force });
  const aside = path.join(path.dirname(path.resolve(out)), `.pixi-effects-${process.pid}-${Date.now()}${ext}`);
  const output = new mb.Output({ format: new mb[OUTPUT_FORMATS[ext]](), target: new mb.FilePathTarget(aside) });
  try {
    let vSrc = null, aSrc = null;
    try {
      if (first.video) { vSrc = new mb.EncodedVideoPacketSource(first.video.codec); output.addVideoTrack(vSrc, { rotation: first.video.rotation }); }
      if (first.audio) { aSrc = new mb.EncodedAudioPacketSource(first.audio.codec); output.addAudioTrack(aSrc); }
    } catch (e) { throw new Error(`a ${ext} file cannot hold these tracks (${[first.video && `${first.video.codec} video`, first.audio && `${first.audio.codec} sound`].filter(Boolean).join(', ')}): ${e.message}; name the output .mp4, .mov or .mkv`); }
    await output.start();
    const clips = [];
    let offset = 0;
    for (let n = 0; n < inputs.length; n++) {
      const { input } = await openInput(inputs[n]);
      const v = first.video ? await input.getPrimaryVideoTrack() : null, a = first.audio ? await input.getPrimaryAudioTrack() : null;
      const vFirst = v ? await v.getFirstTimestamp() : Infinity;
      const aFirst = a ? Math.max(await a.getFirstTimestamp(), 0) : Infinity;
      const base = Math.min(vFirst, aFirst);                             // ONE start for both tracks: a sound that begins later than its picture still does
      const vCfg = v ? await v.getDecoderConfig() : null, aCfg = a ? await a.getDecoderConfig() : null;
      const vIt = v ? new mb.EncodedPacketSink(v).packets()[Symbol.asyncIterator]() : null, aIt = a ? new mb.EncodedPacketSink(a).packets()[Symbol.asyncIterator]() : null;
      const nextSound = async () => { let r = aIt ? await aIt.next() : { done: true }; while (!r.done && r.value.timestamp < -1e-6) r = await aIt.next(); return r; };       // the encoder-delay packet before 0 is left out
      let vn = vIt ? await vIt.next() : { done: true }, an = await nextSound();
      let vFirstPacket = true, aFirstPacket = true, vEnd = offset, aEnd = offset;
      // picture and sound are written in the order of their times, so the muxer never has to hold a whole track of one kind while waiting for the other
      while (!vn.done || !an.done) {
        const takeVideo = !vn.done && (an.done || vn.value.timestamp - base <= an.value.timestamp - base);
        if (takeVideo) {
          const p = vn.value, ts = p.timestamp - base + offset;
          await vSrc.add(p.clone({ timestamp: ts }), vFirstPacket ? { decoderConfig: vCfg } : undefined); vFirstPacket = false;
          vEnd = Math.max(vEnd, ts + p.duration);
          vn = await vIt.next();
        } else {
          const p = an.value, ts = p.timestamp - base + offset;
          await aSrc.add(p.clone({ timestamp: ts }), aFirstPacket ? { decoderConfig: aCfg } : undefined); aFirstPacket = false;
          aEnd = Math.max(aEnd, ts + p.duration);
          an = await nextSound();
        }
      }
      input.dispose();
      const end = Math.max(vEnd, aEnd);
      if (v && a && Math.abs(vEnd - aEnd) > 0.25) notes.push(`clip ${n + 1} (${path.basename(inputs[n])}) has ${round(Math.abs(aEnd - vEnd), 2)} s ${aEnd > vEnd ? 'more sound than picture: the picture ends first and the last frame stays on screen while the sound goes on' : 'more picture than sound: the sound ends first and the next clip\'s sound starts only at the end of the picture'}`);
      clips.push({ file: inputs[n], from: round(offset, 3), to: round(end, 3) });
      offset = end;
    }
    await output.finalize();
    fs.renameSync(aside, path.resolve(out));
    const { input: made } = await openInput(out);
    const tracks = [first.video && `video ${first.video.codec}`, first.audio && `audio ${first.audio.codec}`].filter(Boolean);
    return { inputs, out, mode: 'copy', reencoded: false, clips, duration: round(await made.computeDuration(), 3), tracks, bytes: fs.statSync(path.resolve(out)).size, notes };
  } catch (e) {
    try { await output.cancel(); } catch { /* it had not started */ }
    prepared.undo();
    throw e;
  } finally { fs.rmSync(aside, { force: true }); }
}

commands.concat = async ({ opts }, io) => {
  const r = await concatFiles({ inputs: opts.inputs, out: opts.out, force: !!opts.force });
  if (opts.json) { io.log(JSON.stringify(r, null, 2)); return 0; }
  const L = [`${r.out}  ${kb(r.bytes)}`, `  ${r.clips.length} clips, ${r.duration} s, joined by copy (no re-encode): ${r.tracks.join(', ')}`];
  r.clips.slice(0, 8).forEach((c, i) => L.push(`  ${i + 1}  ${path.basename(c.file)}  ${c.from}–${c.to} s`));
  if (r.clips.length > 8) L.push(`  … ${r.clips.length - 8} more (--json)`);
  for (const n of r.notes.slice(0, 3)) L.push(`  note   ${n}`);
  if (r.notes.length > 3) L.push(`  note   … ${r.notes.length - 3} more (--json)`);
  io.log(L.join('\n'));
  return 0;
};

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(self)) {
  runMedia(process.argv.slice(2)).then(code => process.exit(code));
}
