#!/usr/bin/env node
/**
 * Open the test films in Chrome, WebKit (Safari's engine) and Firefox and compare: does each get ready, what does it warn, which backend draws,
 * how far is each picture from Chrome's, can it export an mp4. Toward 1.0 ("Safari and Firefox checked"): run by hand, not in release:check.
 *
 *   node scripts/browsers.mjs [--out DIR] [--only name,name] [--no-export]
 *
 * Needs Playwright with its WebKit and Firefox (not a dependency of the repository):
 *   npm i -g playwright && npx playwright install webkit firefox     (or PLAYWRIGHT=/path/to/node_modules/playwright)
 * Chrome is the system Chrome that check.mjs uses. Writes DIR/report.json, DIR/report.md and, for a picture that differs, DIR/<film>-<frame>-<browser>.png
 * beside DIR/<film>-<frame>-chrome.png. Needs a built dist/ (npm run build).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { findChrome, serve } from '../ai/tools/check.mjs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const outDir = path.resolve(opt('--out') ?? path.join(root, 'browsers-out'));
const doExport = !args.includes('--no-export');

/** Pages that cover the library's areas (test films, and gallery pieces for blends, mattes, shaders and light), each with the frames compared;
 * `export: false` for a long piece (its pictures are still compared). A test film is named by its name, any other page by its path. */
const FILMS = [
  ['determinism', [0, 45, 89]], ['camera-perspective', [0, 30]], ['spotlight-room', [0, 30]], ['rack-focus', [0, 30]],
  ['named-filters', [0]], ['named-filters-2', [0]], ['backdrop-blur', [0]], ['radial-blur', [0]], ['motion-blur', [15]], ['particles', [30]],
  ['transition-under-matte', [0, 30]], ['gradient-anim', [0, 30]], ['shape-morph', [0, 30]], ['text-japanese-wrap', [0]], ['vertical-text', [0]],
  ['spans', [0]], ['fonts', [0]], ['scene2d', [0, 30]], ['scene3d', [0, 30]], ['follow', [0, 45]], ['scene3d-space', [0, 30]], ['music', [0]],
  ['audio-formats?ext=ogg', [0]], ['first-video', [0, 60]],
  ['scene3d-model', [0, 30]], ['canvas-layer', [0, 30]], ['composition-group', [0]], ['grain', [0, 30]],
];
const urlOf = (film) => film.includes('/') ? film : `tests/films/${film.includes('?') ? film.replace('?', '.html?') : film + '.html'}`;
const only = opt('--only')?.split(',');
const films = only ? FILMS.filter(([f]) => only.some((o) => f.split('?')[0].includes(o))) : FILMS;

const require = createRequire(process.env.PLAYWRIGHT ? path.join(process.env.PLAYWRIGHT, 'package.json') : path.join(process.cwd(), 'package.json'));
let pw;
try { pw = require(process.env.PLAYWRIGHT ?? 'playwright'); }
catch { console.error('browsers.mjs needs Playwright: npm i -g playwright && npx playwright install webkit firefox (or PLAYWRIGHT=/path/to/node_modules/playwright)'); process.exit(2); }

fs.mkdirSync(outDir, { recursive: true });
const { server, port } = await serve(root);
const BROWSERS = [
  ['chrome', () => pw.chromium.launch({ executablePath: findChrome(), args: ['--enable-unsafe-webgpu'] })],
  ['webkit', () => pw.webkit.launch()],
  ['firefox', () => pw.firefox.launch()],
];

/** One film in one browser: ready, warnings, backend, pictures (PNG data URLs), export. */
async function visit(browser, film, frames, o = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // what the page collects (window.__logs: every console.warn / error of the page, as the test suite reads it) and what nothing caught; the browser's
  // own notes (Firefox prints its WebGL and autoplay notes as console warnings) are kept apart: they are not the movie's
  const uncaught = [], browserNotes = [];
  page.on('pageerror', (e) => uncaught.push(`uncaught: ${e.message}`.slice(0, 300)));
  page.on('console', (m) => { if ((m.type() === 'warning' || m.type() === 'error') && m.text().startsWith('[JavaScript')) browserNotes.push(m.text().slice(0, 200)); });
  const r = { ready: false, backend: null, logs: uncaught, browserNotes, pictures: {}, export: null, error: null, seconds: 0 };
  const t0 = Date.now();
  try {
    await page.goto(`http://127.0.0.1:${port}/${urlOf(film)}`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 90_000 });
    r.ready = await page.evaluate('!!window.movie && !window.__error');
    r.seconds = Math.round((Date.now() - t0) / 100) / 10;
    r.backend = await page.evaluate('window.movie?.app?.renderer?.name ?? null');
    r.logs.push(...(await page.evaluate('(window.__logs || []).map(String)')).map((l) => l.slice(0, 300)));
    for (const f of frames) r.pictures[f] = await page.evaluate(`movie.snapshot(${f}, { as: 'dataURL' })`);
    if (doExport && o.export !== false && r.ready) {
      r.export = await page.evaluate(`(async () => { const t = performance.now(); try { const b = await movie.render({ format: 'mp4' }); return { ok: b.size > 1000, bytes: b.size, seconds: Math.round((performance.now() - t) / 100) / 10 }; } catch (e) { return { ok: false, error: String(e && e.message || e).slice(0, 300) }; } })()`);
    }
  } catch (e) { r.error = String(e && e.message || e).split('\n')[0].slice(0, 300); }
  await page.close();
  return r;
}

/** The mean absolute difference of two PNG data URLs, per channel (0..255), measured in a Chrome page; and the share of pixels off by more than 32. */
async function diff(chromePage, a, b) {
  return chromePage.evaluate(async ([a, b]) => {
    const load = async (u) => { const i = new Image(); i.src = u; await i.decode(); const c = new OffscreenCanvas(i.width, i.height); const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, i.width, i.height); };
    const [x, y] = [await load(a), await load(b)];
    if (x.width !== y.width || x.height !== y.height) return { mean: 255, off: 1, size: `${x.width}x${x.height} vs ${y.width}x${y.height}` };
    let sum = 0, off = 0; const n = x.width * x.height;
    for (let i = 0; i < x.data.length; i += 4) { let m = 0; for (let c = 0; c < 3; c++) { const d = Math.abs(x.data[i + c] - y.data[i + c]); sum += d; m = Math.max(m, d); } if (m > 32) off++; }
    return { mean: Math.round((sum / (n * 3)) * 100) / 100, off: Math.round((off / n) * 1000) / 1000 };
  }, [a, b]);
}

const results = {};
for (const [name, launch] of BROWSERS) {
  let browser;
  try { browser = await launch(); } catch (e) { console.error(`${name}: could not start (${String(e.message).split('\n')[0]})`); continue; }
  for (const [film, frames, o] of films) {
    process.stdout.write(`${name.padEnd(8)} ${film} … `);
    const r = await visit(browser, film, frames, o);
    (results[film] ??= {})[name] = r;
    console.log(r.error ? `ERROR ${r.error}` : `${r.ready ? 'ready' : 'NOT READY'} ${r.seconds}s ${r.backend ?? ''} warnings ${r.logs.length}${r.export ? ` export ${r.export.ok ? 'ok' : 'FAILED'}` : ''}`);
  }
  await browser.close();
}

// pictures against Chrome's
const judge = await pw.chromium.launch({ executablePath: findChrome() });
const jp = await judge.newPage();
const rows = [];
for (const [film, frames] of films) {
  const base = results[film]?.chrome;
  for (const name of ['webkit', 'firefox']) {
    const r = results[film]?.[name];
    if (!r) continue;
    const row = { film, browser: name, ready: r.ready, backend: r.backend, warnings: r.logs, browserNotes: [...new Set(r.browserNotes)], export: r.export, error: r.error, frames: {} };
    for (const f of frames) {
      if (!base?.pictures[f] || !r.pictures[f]) continue;
      const d = await diff(jp, base.pictures[f], r.pictures[f]);
      row.frames[f] = d;
      if (d.mean > 2 || d.off > 0.01) {
        const safe = film.replace(/[^\w-]/g, '_');
        for (const [who, url] of [['chrome', base.pictures[f]], [name, r.pictures[f]]]) fs.writeFileSync(path.join(outDir, `${safe}-${f}-${who}.png`), Buffer.from(url.split(',')[1], 'base64'));
      }
    }
    rows.push(row);
  }
}
await judge.close();
server.close();

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ chrome: Object.fromEntries(films.map(([f]) => [f, { ...results[f]?.chrome, pictures: undefined }])), rows }, null, 1));
const md = ['| film | browser | ready | backend | warnings | export | picture vs Chrome (mean / share off) |', '|---|---|---|---|---|---|---|'];
for (const r of rows) md.push(`| ${r.film} | ${r.browser} | ${r.error ? 'ERROR' : r.ready ? 'yes' : 'NO'} | ${r.backend ?? ''} | ${r.warnings.length} | ${r.export ? (r.export.ok ? `ok ${r.export.seconds}s` : 'FAILED') : ''} | ${Object.entries(r.frames).map(([f, d]) => `f${f} ${d.mean}/${d.off}`).join(', ')} |`);
fs.writeFileSync(path.join(outDir, 'report.md'), md.join('\n') + '\n');
console.log(`\n${md.join('\n')}\n\nwritten: ${path.join(outDir, 'report.md')}`);
