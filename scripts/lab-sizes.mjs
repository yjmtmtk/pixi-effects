// The Lab's "light" block shows the comparison piece as a page and as an MP4, and what the page loads to run (its player: PixiJS and
// pixi-effects, from their CDNs, once per site). This writes them, measured, to lab/sizes.json.
//   node scripts/lab-sizes.mjs           measure the two files, and the player in a real Chrome (bytes on the wire), and write
//   node scripts/lab-sizes.mjs --check   write nothing; exit 1 when the two files are not the sizes written, or the player was never measured
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'lab/sizes.json');

export function measureFiles(root = ROOT) {
  return { html: statSync(join(root, 'lab/pieces/compare.html')).size, mp4: statSync(join(root, 'lab/media/compare.mp4')).size };
}

/** Bytes on the wire (Network.loadingFinished encodedDataLength) of everything compare.html loads besides itself, in a fresh Chrome profile (no cache). */
export async function measurePlayer(root = ROOT) {
  const check = await import(pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'lab-sizes-'));
  const { proc, port: cport, endpoint } = await check.launchChrome(check.findChrome(), dir);
  try {
    const bws = new WebSocket(endpoint); await new Promise((ok) => { bws.onopen = ok; });
    const browser = new check.Cdp(bws);
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const ws = new WebSocket(`ws://127.0.0.1:${cport}/devtools/page/${targetId}`); await new Promise((ok) => { ws.onopen = ok; });
    const tab = new check.Cdp(ws);
    const urls = new Map(); let bytes = 0;
    tab.on((m) => {
      if (m.method === 'Network.responseReceived') urls.set(m.params.requestId, m.params.response.url);
      if (m.method === 'Network.loadingFinished') { const u = urls.get(m.params.requestId) ?? ''; if (!u.includes('/lab/pieces/compare.html')) bytes += m.params.encodedDataLength; }
    });
    await tab.send('Network.enable');
    await tab.send('Network.setCacheDisabled', { cacheDisabled: true });
    await tab.send('Page.enable');
    await tab.send('Page.navigate', { url: `http://127.0.0.1:${port}/lab/pieces/compare.html?still=1` });
    for (let i = 0; i < 200 && !(await tab.eval('window.__ready === true').catch(() => false)); i++) await check.sleep(100);
    await check.sleep(1500);                                                   // chunks loaded on demand after init
    return bytes;
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = measureFiles();
  if (process.argv.includes('--check')) {
    let before = {};
    try { before = JSON.parse(readFileSync(FILE, 'utf8')); } catch { /* none yet */ }
    if (before.html !== files.html || before.mp4 !== files.mp4 || !(before.player > 0)) {
      console.error(`lab/sizes.json is not the real sizes (run node scripts/lab-sizes.mjs): files ${JSON.stringify(files)}, written ${JSON.stringify(before)}`);
      process.exit(1);
    }
    console.log('lab/sizes.json is up to date');
  } else {
    const player = await measurePlayer();
    const text = JSON.stringify({ ...files, player }, null, 2) + '\n';
    writeFileSync(FILE, text);
    console.log(`lab/sizes.json: ${text.trim()}`);
    process.exit(0);
  }
}
