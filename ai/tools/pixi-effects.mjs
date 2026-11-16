#!/usr/bin/env node
/**
 * pixi-effects — one command for the three tools (and three small lookups: new, recipe, help), named like the package so `npx pixi-effects check my-video.html` works with nothing installed.
 *
 *   npx pixi-effects check  my-video.html [--at 3,6] [--out dir]    review it: warnings, layout, sound, a contact sheet, a real export
 *   npx pixi-effects render my-video.html -o my-video.mp4           export the file
 *   npx pixi-effects view   my-video.html                           open it in a browser with a timeline
 *
 * Everything after the command goes to the tool unchanged (`check.mjs`, `render.mjs`, `view.mjs`, `media.mjs`, `lookup.mjs`), and so do the exit code and the output.
 * Every command reads its line the same way (args.mjs): `pixi-effects <command> --help` lists every option. `pixi-effects --version` prints the version.
 * It is the package's only bin (the older `pixi-effects-check|render|view` are gone).
 */
import { spawn } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runLookup, LOOKUP_COMMANDS } from './lookup.mjs';
import { EXIT_CODES, nearest as nearestOf } from './args.mjs';

const MEDIA = ['probe', 'trim', 'frames', 'sound', 'audio', 'concat'];          // footage tools: one file, `media.mjs`, which gets the command word too

const TOOLS = { check: 'check.mjs', render: 'render.mjs', view: 'view.mjs' };
const USAGE = `usage:
  pixi-effects check  <page.html> [--at 3,6] [--out dir]    review a video page: warnings, layout, sound, contact sheet, real export
  pixi-effects render <page.html> -o <file.mp4>             export the video
  pixi-effects view   <page.html>                           look at it in a browser, with a timeline
  pixi-effects probe  <file|url>                            what is in a video or audio file (codecs, size, duration), with no ffmpeg; or a .glb / .gltf model (its clips and its size)
  pixi-effects trim   <file|url> <start> <end> -o <out>     cut a file (by copy when it can) and say the real times
  pixi-effects frames <file|url> [--at 1,50%,end] [--sheet] pictures of a video at those times
  pixi-effects sound  <file|url> [--waveform]               loudness, peak, silences of a file's sound
  pixi-effects audio  <file|url> -o <out.m4a>               the sound of a file, copied out
  pixi-effects concat <a> <b> … -o <out>                    join clips by copy and say where each starts
  pixi-effects new    <name> [--size 1080x1920] [--duration 20]   a page to start from (<name>.html), 1280x720 and 6 s unless asked
  pixi-effects quickstart                                   the first page to read (2 KB): the workflow and the rules that cause most failures
  pixi-effects recipe [id]                                  the tested recipes; with an id, one of them with its code
  pixi-effects help   <word>                                the docs about a word (mask, threeD, keyframes, music …)
every option of a command: pixi-effects <command> --help · the version: pixi-effects --version
${EXIT_CODES}`;

function nearest(word) {
  const all = [...Object.keys(TOOLS), ...MEDIA, ...LOOKUP_COMMANDS];
  return nearestOf(word, all);
}

/** The version of this package (`pixi-effects --version`). */
export function version() {
  return JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8')).version;
}

/** Which tool a command line asks for: `{ tool, args }`, or `{ usage }` (no command / --help), or `{ error }`. */
export function route(argv) {
  const [cmd, ...args] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h') return { usage: USAGE };
  if (cmd === '--version' || cmd === '-v') return { version: version() };
  if (TOOLS[cmd]) return { tool: TOOLS[cmd], args };
  if (MEDIA.includes(cmd)) return { tool: 'media.mjs', args: [cmd, ...args] };
  if (LOOKUP_COMMANDS.includes(cmd)) return { inline: cmd, args };
  const guess = /\.html?$/i.test(cmd) ? 'check' : nearest(cmd);
  return { error: `pixi-effects: unknown command "${cmd}"${guess ? `; did you mean "${guess}"?` : '.'} The commands are: ${[...Object.keys(TOOLS), ...MEDIA, ...LOOKUP_COMMANDS].join(', ')}.\n${USAGE}` };
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(self)) {
  const r = route(process.argv.slice(2));
  if (r.version) { console.log(r.version); process.exit(0); }
  if (r.usage) { console.log(r.usage); process.exit(process.argv.length > 2 ? 0 : 2); }
  if (r.error) { console.error(r.error); process.exit(2); }
  if (r.inline) {
    const out = runLookup(r.inline, r.args);
    if (out.stdout) process.stdout.write(out.stdout);
    if (out.stderr) process.stderr.write(out.stderr);
    process.exit(out.code);
  }
  const child = spawn(process.execPath, [resolve(dirname(self), r.tool), ...r.args], { stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));   // a harness that stops this process stops the tool (and its Chrome) too
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 128 : 1)));
}
