// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const presetsMod: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'examples/playground/presets/index.js')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
// Save HTML keeps the template's pinned release on the CDN: the saved page can only be run when that release is published (and the network is there)
const pin = /pixi-effects@([\d.]+)\/dist\/index\.js/.exec(readFileSync(join(root, 'ai/chat-template.html'), 'utf8'))![1];
const pinnedOnCdn = await fetch(`https://cdn.jsdelivr.net/npm/pixi-effects@${pin}/dist/index.js`, { method: 'HEAD' }).then((r) => r.ok, () => false);

/** Opens the Playground at `width`, waits for the first run, and hands over the DevTools client and the console messages seen so far. */
async function withPlayground<T>(width: number, fn: (cdp: any, console_: string[]) => Promise<T>, hash = ''): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'playground-'));
  const { proc, cdp } = await launchPage(chrome, dir, ['--disable-features=site-per-process,IsolateOrigins', '--disable-site-isolation-trials']);   // the frame in the page's process: its console is then seen
  const messages: string[] = [];
  try {
    cdp.on((m: any) => {
      if (m.method === 'Runtime.consoleAPICalled' && ['warning', 'error'].includes(m.params.type)) messages.push(`${m.params.type}: ${m.params.args.map((a: any) => a.value ?? a.description ?? '').join(' ')}`);
      if (m.method === 'Log.entryAdded' && ['warning', 'error'].includes(m.params.entry.level)) messages.push(`${m.params.entry.level}: ${m.params.entry.text}`);
    });
    await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Page.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/playground.html${hash}` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('!!(window.__playground && ((window.__playground.last && window.__playground.last.status) || !document.getElementById("hostNote").hidden))').catch(() => false)) break; await check.sleep(200); }
    return await fn(cdp, messages);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const runPreset = (cdp: any, id: string) => cdp.eval(`(async () => { const p = window.__playground; p.load(${JSON.stringify(id)}); const r = await p.run(); return { ready: r.status.ready, logs: r.review ? r.review.logs : r.status.logs, problems: r.review ? r.review.problems.map(g => g.message) : null, frames: r.review && r.review.frames, failed: r.status.failed || null }; })()`);

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the Playground, on a real browser', () => {
  it('starts: the editor appears, the first preset runs and the problems panel says so', async () => {
    await withPlayground(1440, async (cdp) => {
      const s = await cdp.eval(`({
        editor: !!document.querySelector('#editor .cm-editor'),
        kind: window.__playground.editor.kind,
        frames: document.querySelectorAll('#host iframe').length,
        sandbox: document.querySelector('#host iframe').getAttribute('sandbox'),
        state: document.getElementById('state').textContent,
        panel: document.getElementById('problems').dataset.state,
        text: document.getElementById('problems').textContent,
        presets: [...document.querySelectorAll('#preset option')].length,
        label: document.getElementById('preset').getAttribute('aria-label'),
        code: window.__playground.editor.get().startsWith('// Edit') ,
      })`);
      expect(s.editor, 'CodeMirror loaded (esm.sh)').toBe(true);
      expect(s.kind).toBe('codemirror');
      expect(s.frames).toBe(1);
      expect(s.sandbox).toBe('allow-scripts allow-downloads');
      expect(s.state).toMatch(/^Ready · 4 s · 1280×720 · 30 fps$/);
      expect(s.panel).toBe('ok');
      expect(s.text).toMatch(/No problems/);
      expect(s.presets).toBe(18);
      expect(s.label).toBe('Preset');
      expect(s.code).toBe(true);
    });
  }, 120000);

  it('runs all eighteen presets clean: ready, no warnings, no layout problems', async () => {
    const ids: string[] = presetsMod.default.map((p: any) => p.id);
    await withPlayground(1440, async (cdp) => {
      const bad: string[] = [];
      for (const id of ids) {
        const r = await runPreset(cdp, id);
        if (!r.ready || r.logs.length || (r.problems && r.problems.length)) bad.push(`${id}: ${JSON.stringify(r)}`);
      }
      expect(bad).toEqual([]);
    });
  }, 600000);

  it('twenty runs in a row: one frame at a time, no WebGL context warnings', async () => {
    await withPlayground(1440, async (cdp, messages) => {
      // calibration: a warning raised inside the sandboxed frame does reach the console messages this test reads
      await cdp.eval(`(async () => { const p = window.__playground; p.editor.set("console.warn('webgl canary');\\n" + p.editor.get()); await p.run(); })()`);
      await check.sleep(300);
      expect(messages.some((m) => m.includes('webgl canary')), 'the frame\'s console is observed').toBe(true);
      messages.length = 0;
      let frames = 0;
      for (let i = 0; i < 20; i++) {
        const r = await runPreset(cdp, '01-hello');
        expect(r.ready, `run ${i + 1}`).toBe(true);
        frames = Math.max(frames, await cdp.eval(`document.querySelectorAll('iframe').length`));
      }
      expect(frames).toBe(1);
      expect(messages.filter((m) => /webgl|context/i.test(m))).toEqual([]);
    });
  }, 400000);

  it('two quick runs leave one frame, and the first run settles instead of hanging', async () => {
    await withPlayground(1440, async (cdp) => {
      const r = await cdp.eval(`(async () => {
        const rn = window.__playground.runner, code = window.__playground.editor.get();
        const a = rn.run(code), b = rn.run(code);
        const [ra, rb] = await Promise.all([a, b]);
        return { a: ra.replaced === true, b: rb.ready === true, frames: document.querySelectorAll('iframe').length };
      })()`);
      expect(r).toEqual({ a: true, b: true, frames: 1 });
    });
  }, 120000);

  for (const width of [390, 1440]) {
    it(`at ${width}px nothing sticks out sideways: toolbar, editor, preview, problems and the header entrances`, async () => {
      await withPlayground(width, async (cdp) => {
        const r = await cdp.eval(`(() => {
          const rights = Object.fromEntries(['toolbar', 'editor', 'host', 'problems'].map(id => [id, document.getElementById(id).getBoundingClientRect().right]));
          const links = [...document.querySelectorAll('header.top nav a')].filter(a => a.offsetParent).map(a => a.textContent.trim());
          return { rights, width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, links };
        })()`);
        for (const [id, right] of Object.entries(r.rights)) expect(right as number, id).toBeLessThanOrEqual(r.width + 1);
        expect(r.overflow).toBeLessThanOrEqual(0);
        expect(r.links).toEqual(expect.arrayContaining(['Guide', 'Gallery', 'Examples', 'Playground']));
      });
    }, 120000);
  }

  it('the editor follows the page theme: dark and light have different backgrounds', async () => {
    await withPlayground(1440, async (cdp) => {
      const bg = () => cdp.eval(`getComputedStyle(document.querySelector('#editor .cm-editor')).backgroundColor`);
      const set = (t: string) => cdp.eval(`document.documentElement.setAttribute('data-theme', ${JSON.stringify(t)})`);
      await set('light'); await check.sleep(150);
      const light = await bg();
      await set('dark'); await check.sleep(150);
      const dark = await bg();
      expect(dark).not.toBe(light);
      await set('light'); await check.sleep(150);
      expect(await bg()).toBe(light);                                          // and back
    });
  }, 120000);

  it('broken code shows its warning in the problems panel and the page stays alive', async () => {
    await withPlayground(1440, async (cdp) => {
      const r = await cdp.eval(`(async () => {
        const p = window.__playground;
        p.editor.set(p.editor.get().replace(/const sequences = \\[[\\s\\S]*?\\n    \\];|const sequences = \\[[\\s\\S]*?\\n\\];/, "const sequences = [ { type: 'nope' } ];"));
        const r = await p.run();
        return { ready: r.status.ready, panel: document.getElementById('problems').dataset.state, text: document.getElementById('problems').textContent, alive: document.querySelectorAll('#host iframe').length };
      })()`);
      expect(r.panel).toBe('problems');
      expect(r.text.length).toBeGreaterThan(30);
      expect(r.alive).toBe(1);
      // and it recovers: the next preset runs clean
      expect((await runPreset(cdp, '01-hello')).ready).toBe(true);
    });
  }, 120000);
  describe('share, save, copy', () => {
    it('a share link round-trips: opened in another page it shows the same code, does NOT run, and runs when Run is pressed', async () => {
      let url = '';
      await withPlayground(1440, async (cdp) => {
        await cdp.eval(`(() => { const p = window.__playground; p.editor.set(p.editor.get().replace("text: 'hello'", "text: 'shared hello'")); })()`);
        await cdp.eval(`document.getElementById('share').click()`);
        for (let i = 0; i < 50 && !url; i++) { url = await cdp.eval('window.__lastShare || ""'); await check.sleep(100); }
      });
      expect(url).toMatch(/\/examples\/playground\.html#code=[A-Za-z0-9_-]+$/);
      const hash = url.slice(url.indexOf('#'));
      await withPlayground(1440, async (cdp) => {
        await check.sleep(1500);                                                 // time enough for an automatic run to show itself, if there were one
        const s = await cdp.eval(`({ code: window.__playground.editor.get().includes("text: 'shared hello'"), frames: document.querySelectorAll('iframe').length, note: document.getElementById('hostNote').textContent, hidden: document.getElementById('hostNote').hidden })`);
        expect(s.code).toBe(true);
        expect(s.frames, 'nothing runs until Run is pressed').toBe(0);
        expect(s.hidden).toBe(false);
        expect(s.note).toMatch(/press Run/);
        const r = await cdp.eval(`window.__playground.run().then(r => ({ ready: r.status.ready, frames: document.querySelectorAll('iframe').length, hidden: document.getElementById('hostNote').hidden }))`);
        expect(r).toEqual({ ready: true, frames: 1, hidden: true });
      }, hash).catch((e) => { throw e; });
    }, 240000);

    it('a broken link says so in the problems panel and the first preset runs', async () => {
      await withPlayground(1440, async (cdp) => {
        const s = await cdp.eval(`({ panel: document.getElementById('problems').dataset.state, text: document.getElementById('problems').textContent, ready: window.__playground.last.status.ready, code: window.__playground.editor.get().startsWith('// Edit') })`);
        expect(s.text).toMatch(/this link is not valid/);
        expect(s.panel).toBe('problems');
        expect(s.ready).toBe(true);
        expect(s.code).toBe(true);
      }, '#code=AAAA');
    }, 120000);

    it('a link pasted with a stray character on the end says so (it is not silently ignored), and the first preset runs', async () => {
      await withPlayground(1440, async (cdp) => {
        const s = await cdp.eval(`({ text: document.getElementById('problems').textContent, ready: window.__playground.last.status.ready })`);
        expect(s.text).toMatch(/this link is not valid/);
        expect(s.ready).toBe(true);
        // and pasted into a page that is already open: the editor keeps its code
        const before = await cdp.eval('window.__playground.editor.get()');
        await cdp.eval(`location.hash = '#code=AAAA.'`);
        await check.sleep(600);
        expect(await cdp.eval('window.__playground.editor.get()')).toBe(before);
        expect(await cdp.eval(`document.getElementById('problems').textContent`)).toMatch(/this link is not valid/);
      }, '#code=AAAA)');
    }, 120000);

    it.skipIf(!pinnedOnCdn)('Save HTML makes a page that runs on its own (the library from the CDN, filters from esm.sh, files from the site), for a plain piece and for one with files and pixi-filters', async () => {
      for (const id of ['01-hello', '06-filters']) {
        const file = join(root, 'examples/_checks', `_saved-${id}.html`);
        try {
          await withPlayground(1440, async (cdp) => {
            await cdp.eval(`window.__playground.load(${JSON.stringify(id)})`);
            await cdp.eval(`document.getElementById('save').click()`);
            let html = '';
            for (let i = 0; i < 50 && !html; i++) { html = await cdp.eval('window.__lastSave || ""'); await check.sleep(100); }
            expect(html, id).toContain('EDIT FROM HERE');
            expect(html).not.toContain('__pixiEffectsBridge');                   // the bridge is for the sandboxed frame only
            expect(html.includes('"pixi-filters"'), id).toBe(id === '06-filters');
            expect(html.includes('<base href='), id).toBe(id === '06-filters');   // only a piece that names the Playground's own files gets an address for them
            writeFileSync(file, html);
            const port = await cdp.eval('location.port');
            await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/_saved-${id}.html` });
            let ready = false, logs: string[] = [];
            for (let i = 0; i < 150 && !ready; i++) {
              await check.sleep(200);
              const st = await cdp.eval('({ ready: window.__ready === true, logs: window.__logs || [] })').catch(() => ({ ready: false, logs: [] }));
              ready = st.ready; logs = st.logs;
              if (logs.length) break;
            }
            expect({ id, ready, logs }).toEqual({ id, ready: true, logs: [] });
          });
        } finally { rmSync(file, { force: true }); }
      }
    }, 300000);

    it('Copy for AI carries the code and where the template lives', async () => {
      await withPlayground(1440, async (cdp) => {
        await cdp.eval(`document.getElementById('copyAi').click()`);
        let text = '';
        for (let i = 0; i < 50 && !text; i++) { text = await cdp.eval('window.__lastCopy || ""'); await check.sleep(100); }
        expect(text).toContain('raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/chat-template.html');
        expect(text).toContain('const sequences');
        expect(text).toMatch(/```js\n[\s\S]*\n```$/);
      });
    }, 120000);
  });
});
