// SPIKE 0.23 driver (throwaway). node docs/superpowers/spikes-0.23-0.25/mattes/drive.mjs <suite> [webgl]
// One headless Chrome (check.mjs's launcher, which already passes --disable-audio-output), one tab, the probe page.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const check = await import(pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const suites = await import(pathToFileURL(join(here, 'suites.mjs')).href);

const [suite = 'q1', backendArg = ''] = process.argv.slice(2);
const query = backendArg === 'webgl' ? '?backend=webgl' : '';
const { server, port } = await check.serve(root);
const dir = mkdtempSync(join(tmpdir(), 'matte-'));
const { proc, cdp } = await check.launchChrome(check.findChrome(), dir);
try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/docs/superpowers/spikes-0.23-0.25/mattes/probe.html${query}` });
  for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
  if (!(await cdp.eval('window.__ready === true'))) throw new Error('page not ready: ' + JSON.stringify(await cdp.eval('window.__logs')));
  const save = async (name, url) => { writeFileSync(join(here, name), Buffer.from(url.split(',')[1], 'base64')); };
  const out = await suites[suite]({ cdp, save, backend: backendArg || 'default', port });
  console.log(JSON.stringify(out, null, 1));
} finally { try { proc.kill(); } catch {} server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch {} }
