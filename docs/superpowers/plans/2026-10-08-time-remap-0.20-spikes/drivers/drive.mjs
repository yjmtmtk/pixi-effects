// usage: node spike/drive.mjs script.js ...   (each script is page JS; its return value is printed)
import { serve, launchChrome, findChrome } from '../ai/tools/check.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const root = path.resolve(new URL('..', import.meta.url).pathname);
const { server, port } = await serve(root);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spk-'));
const { proc, cdp } = await launchChrome(findChrome(), dir);
try {
  await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/spike/page.html` });
  for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 300)); try { if (await cdp.eval('window.__ready === true')) break; } catch {} }
  for (const f of process.argv.slice(2)) {
    const code = fs.readFileSync(f, 'utf8');
    const t0 = Date.now();
    const out = await cdp.eval(`(async()=>{ ${code} })().then(r=>JSON.stringify(r), e=>'ERR '+(e&&e.stack||e))`);
    console.log(`--- ${f} (${Date.now() - t0} ms)`); console.log(out);
  }
} finally { proc.kill(); server.close(); process.exit(0); }
