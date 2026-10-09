#!/usr/bin/env node
/**
 * After `npm publish`: is the release really out, and do the pages that load it from the CDN work?
 *
 *   npm run post-publish:check            the version in package.json
 *   node scripts/post-publish-check.mjs 0.25.0
 *
 * The whole test suite does not need to run again: `release:check` ran it on this very tree. What a publish can break is only what
 * lives on the other side: the package on npm, the files on jsDelivr, and the tests that load the released library from the CDN.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';

const version = process.argv[2] ?? JSON.parse(readFileSync('package.json', 'utf8')).version;
const FILES = ['index.js', 'Controller.js', 'Presenter.js', 'three.js', 'loader.css', ...readdirSync('dist').filter(f => /^(music|blendModes)-.*\.js$/.test(f))];
/** The tests that load the released library from the CDN (and the one that checks the Playground's saved page), by file and name. */
export const CDN_TESTS = [
  ['tests/tools/landing.test.ts'],
  ['tests/tools/chatTemplate.test.ts'],
  ['tests/playground/doc.test.ts'],
  ['tests/tools/check.test.ts', '-t', 'first-video'],
  ['tests/tools/playground.test.ts', '-t', 'Save HTML'],
];

let failed = false;
const say = (ok, text) => { console.log(`${ok ? '✓' : '✗'} ${text}`); if (!ok) failed = true; };

let published = '';
try { published = execFileSync('npm', ['view', 'pixi-effects', 'version', '--min-release-age=0'], { encoding: 'utf8' }).trim(); } catch { /* offline */ }
say(published === version, `npm has pixi-effects@${version}${published === version ? '' : ` (it says ${published || 'nothing'})`}`);

const codes = await Promise.all(FILES.map(async f => [f, (await fetch(`https://cdn.jsdelivr.net/npm/pixi-effects@${version}/dist/${f}`, { method: 'HEAD' }).catch(() => ({ status: 0 }))).status]));
const missing = codes.filter(([, c]) => c !== 200);
say(missing.length === 0, `jsDelivr serves ${FILES.length} files of pixi-effects@${version}${missing.length ? `; missing: ${missing.map(([f, c]) => `${f} (${c})`).join(', ')}` : ''}`);

if (!failed) {
  for (const [file, ...rest] of CDN_TESTS) {
    const r = spawnSync('npx', ['vitest', 'run', file, ...rest], { stdio: 'inherit' });
    say(r.status === 0, `${file}${rest.length ? ' ' + rest.join(' ') : ''}`);
  }
}
console.log(failed ? '\npost-publish check FAILED' : `\npost-publish check passed for pixi-effects@${version}`);
process.exit(failed ? 1 : 0);
