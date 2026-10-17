#!/usr/bin/env node
// Writes examples/interactive/posters/<id>.jpg (640 x 360): one frame of each interactive-movie sample, taken in a private headless Chrome.
// Run after `npm run build` (the samples load ../../dist): node scripts/make-interactive-posters.mjs [--only id]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome, findRoot, serve, launchChrome, sleep } from '../ai/tools/check.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = findRoot(path.resolve(here, '..'));
/** id → [query, frame]: a moment where the sample shows what it is about. */
export const POSTERS = {
  janken: ['?you=1&cpu=0', 80],
  variants: ['', 100],
  sliders: ['', 60],
  pointer: ['?px=820&py=300', 40],
  click: ['?popped=1,4&hover=2', 40],
  drop: ['?placed=done,later', 0],
  move3d: ['', 0],
  liquid: ['', 120],
  'scroll-city': ['?scroll=0.55', 40],
  chords: ['', 90],
  card: ['', 105],
  ending: ['?path=1', 195],
};

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const outDir = path.join(root, 'examples/interactive/posters');
fs.mkdirSync(outDir, { recursive: true });
const { server, port } = await serve(root);
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-posters-'));
const { proc, cdp } = await launchChrome(findChrome(), userDataDir);
try {
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  for (const [id, [query, frame]] of Object.entries(POSTERS)) {
    if (only && only !== id) continue;
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/interactive/${id}.html${query}` });
    for (let i = 0; i < 100; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await sleep(300); }
    await sleep(600);
    await cdp.eval(`movie.pause()`);
    const url = await cdp.eval(`movie.snapshot(${frame}, { as: 'dataURL', type: 'image/jpeg', quality: 0.85, scale: 0.5 })`);
    fs.writeFileSync(path.join(outDir, `${id}.jpg`), Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
    console.log(`${id}.jpg`);
  }
} finally { try { proc.kill(); } catch { /* gone */ } server.close(); await sleep(200); fs.rmSync(userDataDir, { recursive: true, force: true }); }
