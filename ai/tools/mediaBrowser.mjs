// The browser engine of the media commands: the tool's local server, a headless Chrome (the one `check` and `render` use) and the page ai/tools/media-page.html.
//   await withBrowser({ chrome, inputs: Map(id -> path or URL), outDir }, async ({ call }) => call('frames', { id, times, size, sheet }))
// `call` runs `window.media.<name>(args)` in the page and returns its JSON, or throws the sentence the page threw.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export async function withBrowser({ chrome, inputs, outDir, requestLog = null, timeoutSec = 180 }, fn) {
  const check = await import(pathToFileURL(path.join(HERE, 'check.mjs')).href);
  const { serveMedia } = await import(pathToFileURL(path.join(HERE, 'media.mjs')).href);
  const chromePath = chrome ?? check.findChrome();
  if (!chromePath || !fs.existsSync(chromePath)) throw new Error(`Chrome was not found${chromePath ? ` at ${chromePath}` : ''}: this command decodes video in a browser; install Chrome, or pass --chrome PATH (or set CHROME_PATH) with the right path`);
  const srv = await serveMedia({ inputs, outDir, requestLog });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixi-effects-media-'));
  let proc = null;
  try {
    const launched = await check.launchChrome(chromePath, userDataDir);
    proc = launched.proc;
    const cdp = launched.cdp;
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${srv.port}/ai/tools/media-page.html` });
    const deadline = Date.now() + timeoutSec * 1000;
    while (!(await cdp.eval('window.__mediaReady === true').catch(() => false))) {
      if (Date.now() > deadline) throw new Error('the media page did not start in the browser');
      await check.sleep(100);
    }
    const call = async (name, args) => {
      const run = cdp.eval(`(async () => { try { return { ok: await window.media.${name}(${JSON.stringify(args)}) }; } catch (e) { return { error: String(e && e.message || e) }; } })()`);
      let timer;
      const timeout = new Promise((_, bad) => { timer = setTimeout(() => bad(new Error(`timed out after ${timeoutSec} s`)), Math.max(1000, deadline - Date.now())); });
      try {
        const r = await Promise.race([run, timeout]);
        if (r.error) throw new Error(r.error);
        return r.ok;
      } finally { clearTimeout(timer); }
    };
    return await fn({ call });
  } finally {
    try { proc?.kill(); } catch { /* gone */ }
    await srv.close();
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch { /* held a moment longer */ }
  }
}
