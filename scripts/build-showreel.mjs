#!/usr/bin/env node
// Build the reel: ONE page that holds the whole video as data.
//   node scripts/build-showreel.mjs [--cdn] [--out examples/showreel/pixi-effects-reel.html]
// It reads examples/showreel/{reel.src.html, shared.js, chapters.json, chapters/<id>.js, music.js} and inlines the chapter functions, so the page
// has no module of its own: only the library (the local dist/, or with --cdn the pinned release on jsDelivr). Each chapter file must be ONE
// `export default function chapter(P) { … }` with no import, no other export and no other top-level code (the check below says what is wrong).
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const dir = path.join(root, 'examples/showreel');
const args = process.argv.slice(2);
const cdn = args.includes('--cdn');
const out = path.resolve(root, args.includes('--out') ? args[args.indexOf('--out') + 1] : 'examples/showreel/pixi-effects-reel.html');

/** `export default function name(` → `function (`, after checking the file has the one shape the build can inline. */
export function inlineFunction(file, src) {
  const problems = [];
  if (/^\s*import\s/m.test(src)) problems.push('has an import (a chapter gets everything through its parameter P)');
  const defaults = src.match(/^export default function\s*\w*\s*\(/gm) ?? [];
  if (defaults.length !== 1) problems.push(`must have exactly one \`export default function chapter(P)\` (found ${defaults.length})`);
  const rest = src.replace(/^export default function/m, '');
  if (/^export\s/m.test(rest)) problems.push('has another export');
  if (problems.length) throw new Error(`${file}: ${problems.join('; ')}`);
  return src.replace(/^export default function\s*\w*\s*\(/m, 'function (').trim();
}

export function build({ cdn: useCdn = false } = {}) {
  const table = JSON.parse(fs.readFileSync(path.join(dir, 'chapters.json'), 'utf8'));
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
  const chapterFns = table.chapters.map(c => `  ${JSON.stringify(c.id)}: ${inlineFunction(`chapters/${c.id}.js`, read(`chapters/${c.id}.js`)).replace(/\n/g, '\n  ')},`);
  const musicPath = path.join(dir, 'music.js');
  const music = fs.existsSync(musicPath) ? inlineFunction('music.js', read('music.js')) : 'function (P, plan) { return []; }';
  const inline = [
    `const SHARED = ${inlineFunction('shared.js', read('shared.js'))};`,
    `const TABLE = ${JSON.stringify(table)};`,
    `const CH = {\n${chapterFns.join('\n')}\n    };`,
    `const MUSIC = ${music};`,
  ].join('\n    ');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const distBase = useCdn ? `https://cdn.jsdelivr.net/npm/pixi-effects@${pkg.version}/dist/` : '../../dist/';
  const html = (kb) => read('reel.src.html')
    .replace('/*@@INLINE@@*/', () => inline)
    .replace('@@LOADER_CSS@@', distBase + 'loader.css').replace(/@@DIST@@/g, distBase)
    .replace('@@KB@@', String(kb));
  // the page quotes its own size: build once to measure, then again with the measured number (the digits barely change the size)
  const kb = Math.round(Buffer.byteLength(html(0)) / 1024);
  return { html: html(kb), kb, chapters: table.chapters.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { html, kb, chapters } = build({ cdn });
  fs.writeFileSync(out, html);
  console.log(`${path.relative(root, out)}: ${chapters} chapters, ${kb} KB${cdn ? ' (library from the CDN)' : ''}`);
}
