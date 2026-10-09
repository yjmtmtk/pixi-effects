// SPIKE 0.24 light: drives probe.html in one headless Chrome. Usage (from the worktree root, after `npm run build` with patch.diff applied):
//   node docs/superpowers/spikes-0.23-0.25/light/driver.mjs <step> [webgl]
// steps: smoke | ref | det | demo | perf
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../../../..');
const check = await import(pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const step = process.argv[2] ?? 'smoke';
const webgl = process.argv.includes('webgl');
const { server, port } = await check.serve(root);
const dir = mkdtempSync(join(tmpdir(), 'light-'));
const { proc, cdp } = await check.launchChrome(check.findChrome(), dir);
const J = JSON.stringify;
const out = (name, url) => writeFileSync(join(here, name), Buffer.from(url.split(',')[1], 'base64'));

try {
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/docs/superpowers/spikes-0.23-0.25/light/probe.html${webgl ? '?backend=webgl' : ''}` });
  for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
  const steps = await import(pathToFileURL(join(here, 'steps.mjs')).href);
  await steps[step]({ cdp, J, out, webgl, log: (...a) => console.log(`[${webgl ? 'webgl' : 'default'}]`, ...a) });
} catch (e) { console.error(e); console.error(await cdp.eval('window.__logs').catch(() => [])); process.exitCode = 1; }
finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
