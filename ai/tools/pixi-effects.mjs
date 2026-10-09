#!/usr/bin/env node
/**
 * pixi-effects — one command for the three tools, named like the package so `npx pixi-effects check my-video.html` works with nothing installed.
 *
 *   npx pixi-effects check  my-video.html [--at 3,6] [--out dir]    review it: warnings, layout, sound, a contact sheet, a real export
 *   npx pixi-effects render my-video.html -o my-video.mp4           export the file
 *   npx pixi-effects view   my-video.html                           open it in a browser with a timeline
 *
 * Everything after the command goes to the tool unchanged (`check.mjs`, `render.mjs`, `view.mjs`; their own headers list every option), and so do the
 * exit code and the output. The three older bins (`pixi-effects-check|render|view`) still work.
 */
import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = { check: 'check.mjs', render: 'render.mjs', view: 'view.mjs' };
const USAGE = `usage:
  pixi-effects check  <page.html> [--at 3,6] [--out dir]    review a video page: warnings, layout, sound, contact sheet, real export
  pixi-effects render <page.html> -o <file.mp4>             export the video
  pixi-effects view   <page.html>                           look at it in a browser, with a timeline
(every option of a command is listed in the header of its file: node_modules/pixi-effects/ai/tools/<command>.mjs)`;

function nearest(word) {
  const d = (a, b) => { const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]); for (let j = 1; j <= b.length; j++) m[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return m[a.length][b.length]; };
  const best = Object.keys(TOOLS).map(k => [k, d(word, k)]).sort((x, y) => x[1] - y[1])[0];
  return best[1] <= 2 ? best[0] : null;
}

/** Which tool a command line asks for: `{ tool, args }`, or `{ usage }` (no command / --help), or `{ error }`. */
export function route(argv) {
  const [cmd, ...args] = argv;
  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') return { usage: USAGE };
  if (TOOLS[cmd]) return { tool: TOOLS[cmd], args };
  const guess = /\.html?$/i.test(cmd) ? 'check' : nearest(cmd);
  return { error: `pixi-effects: unknown command "${cmd}"${guess ? `; did you mean "${guess}"?` : ''} The commands are: ${Object.keys(TOOLS).join(', ')}.\n${USAGE}` };
}

const self = fileURLToPath(import.meta.url);
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(self)) {
  const r = route(process.argv.slice(2));
  if (r.usage) { console.log(r.usage); process.exit(process.argv.length > 2 ? 0 : 2); }
  if (r.error) { console.error(r.error); process.exit(2); }
  const child = spawn(process.execPath, [resolve(dirname(self), r.tool), ...r.args], { stdio: 'inherit' });
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => child.kill(sig));   // a harness that stops this process stops the tool (and its Chrome) too
  child.on('exit', (code, signal) => process.exit(code ?? (signal ? 128 : 1)));
}
