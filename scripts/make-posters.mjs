// Takes the poster picture of every gallery piece: opens the piece in a private headless Chrome, reads its poster time
// (`movie.init({ poster })`) and saves `movie.posterImage()` as examples/gallery/posters/<id>.jpg, then writes
// posters/manifest.json (poster frame + a hash of the page, so a poster that is out of date is noticed) and pieces.json.
//
//   node scripts/make-posters.mjs [--only id[,id…]] [--scale 0.5]       (needs Node >= 22 and Chrome; run `npm run build` first)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findChrome, serve, launchChrome, sleep } from '../ai/tools/check.mjs';
import { buildGallery, posterHash, GALLERY_DIR } from './build-gallery.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

export async function makePosters({ root = ROOT, only = null, scale = 0.5, log = console.log } = {}) {
  const chrome = findChrome();
  if (!chrome) throw new Error('Chrome / Chromium not found: install it, or set CHROME=/path/to/chrome');
  if (!fs.existsSync(path.join(root, 'dist/index.js'))) throw new Error('dist/ is missing: run `npm run build` first (the pieces load the local build)');
  const dir = path.join(root, GALLERY_DIR);
  const ids = fs.readdirSync(dir).filter(f => f.endsWith('.html') && f !== 'index.html').map(f => f.slice(0, -5)).sort();
  const wanted = only ? ids.filter(id => only.includes(id)) : ids;
  const unknown = (only ?? []).filter(id => !ids.includes(id));
  if (unknown.length) throw new Error(`no such piece: ${unknown.join(', ')}`);

  const manifestFile = path.join(dir, 'posters', 'manifest.json');
  const manifest = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : {};
  fs.mkdirSync(path.join(dir, 'posters'), { recursive: true });

  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixi-effects-posters-'));
  const { server, port } = await serve(root);
  const { proc, cdp } = await launchChrome(chrome, userDataDir);
  try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    for (const id of wanted) {
      await cdp.send('Page.navigate', { url: 'about:blank' });
      await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/${GALLERY_DIR}/${id}.html` });
      let ready = false, logs = [];
      for (let i = 0; i < 200 && !ready; i++) {
        await sleep(300);
        ready = await cdp.eval('window.__ready === true').catch(() => false);
      }
      if (!ready) throw new Error(`${id}: the piece did not become ready`);
      const info = await cdp.eval('JSON.stringify({ poster: movie.poster, posterFrame: movie.posterFrame, logs: window.__logs || [] })');
      const { poster, posterFrame, logs: pageLogs } = JSON.parse(info);
      logs = pageLogs;
      if (posterFrame === null) throw new Error(`${id}: the piece has no poster time: add \`poster: <seconds>\` to its movie.init`);
      const url = await cdp.eval(`movie.posterImage({ as: 'dataURL', type: 'image/jpeg', scale: ${scale} })`);
      fs.writeFileSync(path.join(dir, 'posters', `${id}.jpg`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
      manifest[id] = { poster, posterFrame, hash: posterHash(fs.readFileSync(path.join(dir, `${id}.html`), 'utf8')) };
      log(`${id}: poster at ${poster} s (frame ${posterFrame})${logs.length ? `  [page warnings: ${logs.length}]` : ''}`);
    }
  } finally {
    try { proc.kill(); } catch { /* gone */ }
    server.close();
    await sleep(200);
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
  }
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map(k => [k, manifest[k]]));
  fs.writeFileSync(manifestFile, JSON.stringify(sorted, null, 2) + '\n');
  try {
    const { json } = buildGallery(root);
    fs.writeFileSync(path.join(dir, 'pieces.json'), json);
  } catch (e) {
    if (!only) throw e;
    log(`pieces.json not updated yet: ${String(e.message).split('\n')[0]}`);       // with --only, other pieces may still lack a poster
  }
  return { made: wanted };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (typeof WebSocket === 'undefined') throw new Error('Node >= 22 is needed (built-in WebSocket)');
    const args = process.argv.slice(2);
    const opt = name => { const i = args.indexOf(name); return i < 0 ? null : args[i + 1]; };
    const only = opt('--only')?.split(',').filter(Boolean) ?? null;
    const { made } = await makePosters({ only, scale: Number(opt('--scale') ?? 0.5) });
    console.log(`${made.length} poster${made.length === 1 ? '' : 's'} made; manifest.json and pieces.json written.`);
  } catch (e) {
    console.error(`make-posters failed: ${e.message}`);
    process.exit(1);
  }
}
