#!/usr/bin/env node
// Did a change alter any picture the repository shows as correct? Draws frames of many pages in ONE Chrome with several tabs at once and keeps a
// hash of every frame, so two builds are compared in seconds (identical hash = identical picture; PNGs of the frames are kept to look at the
// ones that differ).
//
//   node scripts/compare-frames.mjs capture --root <a repo with a built dist/> --pages <list.txt> --out <dir> [--frames 0,50%,99%] [--lanes 4] [--force]
//   node scripts/compare-frames.mjs compare <dirBefore> <dirAfter>
//
// Why it exists: the one-page-at-a-time way (`check.mjs` per page, twice) took about 25 minutes for 64 pages; this takes a few minutes, and
// the "before" of an unchanged commit is captured once: a page that is already in `--out` is skipped (give `--force` to draw it again).
// A page that does not announce itself (`window.__ready`) is waited for until `window.movie.isReady`, then 3.5 s.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const here = path.dirname(new URL(import.meta.url).pathname);
const check = await import(pathToFileURL(path.resolve(here, '../ai/tools/check.mjs')).href);

const args = process.argv.slice(2);
const mode = args[0];
const opt = (name, dflt = null) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };

if (mode === 'compare') {
  const [a, b] = [args[1], args[2]];
  const A = JSON.parse(fs.readFileSync(path.join(a, 'hashes.json'), 'utf8')), B = JSON.parse(fs.readFileSync(path.join(b, 'hashes.json'), 'utf8'));
  const same = [], differ = [], only = [];
  for (const page of Object.keys({ ...A, ...B }).sort()) {
    if (!A[page] || !B[page]) { only.push(`${page} (${A[page] ? 'only before' : 'only after'})`); continue; }
    const labels = Object.keys(A[page]);
    const bad = labels.filter(l => A[page][l] !== B[page][l]);
    (bad.length ? differ : same).push(bad.length ? `${page}: ${bad.join(', ')}` : page);
  }
  console.log(`${same.length} identical, ${differ.length} different, ${only.length} in one build only`);
  // a different hash can be a different byte and the same picture (1/255 of rounding): measure the pixels of the frames that differ (needs python3 + PIL)
  const measure = (name, label) => {
    const f = `${label.replace('%', 'pct')}.png`;
    try {
      const py = "import sys\nfrom PIL import Image, ImageChops\na=Image.open(sys.argv[1]).convert('RGB');b=Image.open(sys.argv[2]).convert('RGB')\nif a.size!=b.size: print('size'); sys.exit()\nd=list(ImageChops.difference(a,b).getdata());print(max(max(p) for p in d), sum(1 for p in d if max(p)>8))";
      return execFileSync('python3', ['-c', py, path.join(a, name, f), path.join(b, name, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().replace(' ', ' of 255 at most; pixels over 8: ');
    } catch { return 'differs (hash; no PIL to measure)'; }
  };
  for (const d of differ) {
    const [page, labels] = d.split(': ');
    const name = path.basename(page, '.html');
    const detail = labels.split(', ').map(l => (l === 'error' ? 'could not be drawn in one of the builds' : `${l} ${measure(name, l)}`)).join(' | ');
    console.log(`  DIFFERENT  ${page}: ${detail}`);
  }
  for (const o of only) console.log(`  ONLY       ${o}`);
  process.exit(differ.length ? 1 : 0);
}

if (mode !== 'capture') { console.error(fs.readFileSync(import.meta.url.slice(7), 'utf8').split('\n').slice(1, 11).join('\n')); process.exit(2); }

const root = path.resolve(opt('--root', '.'));
const pages = fs.readFileSync(opt('--pages'), 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
const out = path.resolve(opt('--out'));
const marks = (opt('--frames', '0,50%,99%')).split(',');
const lanes = Number(opt('--lanes', '4'));
const force = args.includes('--force');
fs.mkdirSync(out, { recursive: true });
const hashFile = path.join(out, 'hashes.json');
const hashes = fs.existsSync(hashFile) ? JSON.parse(fs.readFileSync(hashFile, 'utf8')) : {};

const chrome = check.findChrome();
const { server, port } = await check.serve(root);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmpframes-'));
const { proc, port: cdpPort, endpoint } = await check.launchChrome(chrome, dir, []);
const ws = new WebSocket(endpoint);
await new Promise((ok, bad) => { ws.onopen = ok; ws.onerror = () => bad(new Error('could not connect to Chrome')); });
const browser = new check.Cdp(ws);

const todo = pages.filter(p => force || !hashes[p]);
console.log(`${pages.length - todo.length} already captured, ${todo.length} to draw (${lanes} tabs)`);
let next = 0, done = 0;

async function lane() {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const tab = new WebSocket(`ws://127.0.0.1:${cdpPort}/devtools/page/${targetId}`);
  await new Promise((ok, bad) => { tab.onopen = ok; tab.onerror = () => bad(new Error('no tab')); });
  const cdp = new check.Cdp(tab);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  for (let i = next++; i < todo.length; i = next++) {
    const page = todo[i];
    const name = path.basename(page, '.html');
    const result = {};
    try {
      // a page without window.__ready: its movie is made at module level; poll for it
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${page}` });
      let ready = false;
      for (let k = 0; k < 150 && !ready; k++) { await check.sleep(100); ready = await cdp.eval('window.__ready === true || !!(window.movie && window.movie.isReady)').catch(() => false); }
      if (!ready) await check.sleep(3500);
      const total = await cdp.eval('window.movie ? window.movie.totalFrames : 0');
      if (!total) throw new Error('no movie on the page');
      fs.mkdirSync(path.join(out, name), { recursive: true });
      for (const m of marks) {
        const frame = m.endsWith('%') ? Math.min(total - 1, Math.round(total * parseFloat(m) / 100)) : Math.round(parseFloat(m) * 30);
        const url = await cdp.eval(`window.movie.snapshot(${frame}, { as: 'dataURL' })`);
        const png = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
        fs.writeFileSync(path.join(out, name, `${m.replace('%', 'pct')}.png`), png);
        result[m] = crypto.createHash('sha1').update(png).digest('hex');
      }
      hashes[page] = result;
    } catch (err) { hashes[page] = { error: String(err.message || err).slice(0, 120) }; }
    fs.writeFileSync(hashFile, JSON.stringify(hashes, null, 1));
    if (++done % 10 === 0) console.log(`  ${done}/${todo.length}`);
  }
  try { await browser.send('Target.closeTarget', { targetId }); } catch { /* gone */ }
}

try { await Promise.all(Array.from({ length: lanes }, lane)); }
finally { try { ws.close(); proc.kill(); } catch { /* gone */ } server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
const failed = Object.entries(hashes).filter(([, v]) => v.error);
console.log(`done: ${Object.keys(hashes).length} pages in ${out}${failed.length ? `; ${failed.length} could not be drawn: ${failed.map(([p, v]) => `${p} (${v.error})`).join('; ')}` : ''}`);
process.exit(failed.length ? 1 : 0);
