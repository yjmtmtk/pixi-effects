// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, utimesSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const view: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/view.mjs')).href);
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

describe('every command answers --help: usage on stdout, exit 0 (not "unknown option")', () => {
  for (const cmd of ['check', 'render', 'view']) {
    it(`${cmd}.mjs --help and -h`, async () => {
      const { spawnSync } = await import('node:child_process');
      for (const flag of ['--help', '-h']) {
        const r = spawnSync(process.execPath, [join(root, `ai/tools/${cmd}.mjs`), flag], { encoding: 'utf8' });
        expect(r.status, `${cmd} ${flag}: ${r.stderr}`).toBe(0);
        expect(r.stdout).toMatch(new RegExp(`usage: pixi-effects ${cmd} `));
      }
    });
  }
});

describe('view.mjs — pure helpers', () => {
  it('parseViewArgs: a page and the options; clear errors for a typo or a missing value', () => {
    expect(view.parseViewArgs(['p.html', '--port', '8123', '--no-open', '--query', '?lang=ja'])).toMatchObject({ page: 'p.html', port: 8123, open: false, query: 'lang=ja' });
    expect(view.parseViewArgs(['p.html'])).toMatchObject({ port: 0, open: true, query: null });
    expect(() => view.parseViewArgs(['p.html', '--bogus'])).toThrow(/unknown option --bogus/);
    expect(() => view.parseViewArgs(['p.html', '--port'])).toThrow(/needs a value/);
    expect(() => view.parseViewArgs(['a.html', 'b.html'])).toThrow(/unexpected argument/);
  });

  it('viewerHtml: the page in an iframe, the timeline container, a playhead script; the title is escaped', () => {
    const html = view.viewerHtml({ pageUrl: '/examples/a.html?x=1', title: '<b>my</b> & video' });
    expect(html).toContain('<iframe id="page" class="pending" src="/examples/a.html?x=1"');
    expect(html).toContain('id="chart"');
    expect(html).toContain('id="zin"');
    expect(html).toContain('movie.timelineSvg()');
    expect(html).toContain('&lt;b&gt;my&lt;/b&gt; &amp; video');
    expect(html).not.toContain('<b>my</b>');
  });
});

describe('view.mjs — the viewer page\'s own script', () => {
  it('parses (it is written inside a template string, where a backslash-n turns into a real line break: a broken viewer)', () => {
    const html: string = view.viewerHtml({ pageUrl: '/a.html', title: 't' });
    const js = html.split('<script>')[1]!.split('</script>')[0]!;
    expect(() => new Function(js)).not.toThrow();
  });
  it('its source has no single backslash a template string would swallow (a backslash-d in a regex became a plain d: the regex silently matched nothing)', () => {
    const src = readFileSync(join(root, 'ai/tools/view.mjs'), 'utf8');
    const body = src.slice(src.indexOf('export function viewerHtml'), src.indexOf('</script>', src.indexOf('export function viewerHtml')));
    const bad = [...body.matchAll(/(?<!\\)\\(?![\\`$])[^u]/g)].map(m => body.slice(Math.max(0, m.index! - 30), m.index! + 10));
    expect(bad).toEqual([]);
  });
});

describe('view.mjs — knowing that the work changed (no reload by itself)', () => {
  const tmp = () => mkdtempSync(join(tmpdir(), 'view-sig-'));

  it('folderSignature changes when a file is edited or added, and not for folders that only hold outputs', () => {
    const dir = tmp();
    try {
      writeFileSync(join(dir, 'film.html'), 'a');
      mkdirSync(join(dir, 'out')); mkdirSync(join(dir, 'reviews')); mkdirSync(join(dir, 'node_modules'));
      const s0 = view.folderSignature(dir);
      writeFileSync(join(dir, 'out/video.mp4'), 'x'); writeFileSync(join(dir, 'reviews/sheet.png'), 'x'); writeFileSync(join(dir, 'node_modules/m.js'), 'x'); writeFileSync(join(dir, '.DS_Store'), 'x');
      expect(view.folderSignature(dir)).toBe(s0);                          // outputs, installs and hidden files are not "the work"
      writeFileSync(join(dir, 'film.html'), 'ab');
      const s1 = view.folderSignature(dir);
      expect(s1).not.toBe(s0);                                            // the page changed
      writeFileSync(join(dir, 'logo.svg'), '<svg/>');
      expect(view.folderSignature(dir)).not.toBe(s1);                      // an asset arrived
      mkdirSync(join(dir, 'assets')); writeFileSync(join(dir, 'assets/photo.jpg'), 'x');
      expect(view.folderSignature(dir)).not.toBe(s1);                      // and one in a sub-folder
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('the viewer serves a version number that goes up when the work changes, and never reloads anything itself', async () => {
    const dir = tmp();
    const page = join(dir, 'film.html');
    writeFileSync(page, '<!doctype html><title>t</title>');
    const { server, url } = await view.startViewer({ page, port: 0, query: null, root: dir, watchEvery: 100 });
    try {
      const base = url.replace(/\/__viewer$/, '');
      const get = async () => (await (await fetch(base + '/__viewer/version')).json()) as { version: number; at: number };
      const v0 = await get();
      expect(typeof v0.version).toBe('number');
      await new Promise(r => setTimeout(r, 350));
      expect((await get()).version).toBe(v0.version);                      // nothing changed: the same number
      writeFileSync(page, '<!doctype html><title>t2</title>');
      utimesSync(page, new Date(Date.now() + 5000), new Date(Date.now() + 5000));
      let v1 = await get();
      for (let i = 0; i < 20 && v1.version === v0.version; i++) { await new Promise(r => setTimeout(r, 100)); v1 = await get(); }
      expect(v1.version).toBeGreaterThan(v0.version);
      expect(v1.at).toBeGreaterThan(0);
    } finally { server.close(); rmSync(dir, { recursive: true, force: true }); }
  });

  it('viewerHtml has the update notice, the reload key and the auto switch (off by default); the version address is the viewer\'s own', () => {
    const html = view.viewerHtml({ pageUrl: '/a.html', title: 'a' });
    expect(html).toContain('id="update"');
    expect(html).toContain('id="reload"');
    expect(html).toContain('id="auto"');
    expect(html).not.toMatch(/id="auto"[^>]*checked/);
    expect(html).toContain('/__viewer/version');
    expect(html).toMatch(/e\.key === 'r'/);
  });
});

const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('view.mjs — the viewer, run for real in Chrome', () => {
  it('shows the timeline under the page; a click on it seeks the movie and the playhead follows the movie when it plays', async () => {
    const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, 'tests/films/timeline.html'), '--no-open'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const url: string = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
      proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
    });
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-test-'));
    const { proc: chromeProc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url });
      // the timeline appears once the page inside is ready
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval("!!document.querySelector('#plot svg') && !!document.querySelector('#head')").catch(() => false); }
      expect(ready).toBe(true);
      expect(await cdp.eval("document.querySelectorAll('#plot svg .row').length")).toBeGreaterThan(5);

      // click at the middle of the time axis -> the movie is at about half
      const total = await cdp.eval("document.getElementById('page').contentWindow.movie.totalFrames");
      await cdp.eval(`(() => {
        const svg = document.querySelector('#plot svg'), r = svg.getBoundingClientRect(), d = svg.dataset;
        const ux = (+d.x0 + +d.x1) / 2, cx = r.left + (ux / svg.viewBox.baseVal.width) * r.width, cy = r.top + 60;
        svg.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: cy, bubbles: true, pointerId: 1 }));
        svg.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: cy, bubbles: true, pointerId: 1 }));
      })()`);
      let frame = 0;
      for (let i = 0; i < 30 && Math.abs(frame - total / 2) > 3; i++) { await check.sleep(200); frame = await cdp.eval("document.getElementById('page').contentWindow.movie.currentFrame"); }
      expect(Math.abs(frame - total / 2)).toBeLessThanOrEqual(3);

      // the playhead sits where the movie is
      const x = () => cdp.eval("+document.getElementById('head').getAttribute('transform').match(/translate\\(([-\\d.]+)/)[1]");
      const x0 = await x();
      await cdp.eval("document.getElementById('page').contentWindow.movie.play()");
      await check.sleep(900);
      expect(await x()).toBeGreaterThan(x0);
      await cdp.eval("document.getElementById('page').contentWindow.movie.pause()");
    } finally {
      try { chromeProc.kill(); } catch { /* gone */ }
      proc.kill();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);

  it('while the page loads, it is not shown small in the corner: the frame stays hidden (a centred "loading" instead) until it is laid out', async () => {
    const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, 'tests/films/timeline.html'), '--no-open'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const url: string = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
      proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
    });
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-test-'));
    const { proc: chromeProc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      // record, from the first moment, every state the frame is in until the timeline is there
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__states = []; (function look() {
        const f = document.getElementById('page'), w = document.getElementById('wait');
        if (f) window.__states.push({ visible: getComputedStyle(f).visibility !== 'hidden', width: f.getBoundingClientRect().width, wait: !!w && !w.hidden, ready: !!document.querySelector('#plot svg') });
        if (!document.querySelector('#plot svg')) requestAnimationFrame(look);
      })();` });
      await cdp.send('Page.navigate', { url });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval("!!document.querySelector('#plot svg')").catch(() => false); }
      expect(ready).toBe(true);
      const states: Array<{ visible: boolean; width: number; wait: boolean; ready: boolean }> = await cdp.eval('window.__states');
      const before = states.filter(s => !s.ready);
      expect(before.length).toBeGreaterThan(0);
      expect(before.filter(s => s.visible)).toEqual([]);                    // never shown before it is laid out
      expect(before.every(s => s.wait)).toBe(true);                         // the viewer's own "loading" instead
      expect(await cdp.eval("getComputedStyle(document.getElementById('page')).visibility")).toBe('visible');
      expect(await cdp.eval("document.getElementById('wait').hidden")).toBe(true);
    } finally {
      try { chromeProc.kill(); } catch { /* gone */ }
      proc.kill();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);

  it('in a small window the page is made narrower, not scaled: the player bar keeps its size (a centred, capped page and a 9:16 one too); a page that cannot narrow is still scaled to fit', async () => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-test-'));
    const { proc: chromeProc, cdp } = await launchPage(chrome, userDataDir);
    const procs: Array<ReturnType<typeof spawn>> = [];
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      const look = async (page: string, query: string, w: number, h: number) => {
        await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
        const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, page), '--no-open', ...(query ? ['--query', query] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
        procs.push(proc);
        const url: string = await new Promise((res, rej) => {
          let buf = '';
          const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
          proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
        });
        await cdp.send('Page.navigate', { url });
        let ready = false;
        for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval("!!document.querySelector('#plot svg')").catch(() => false); }
        expect(ready).toBe(true);
        await check.sleep(400);
        return cdp.eval(`(() => {
          const f = document.getElementById('page'), st = document.getElementById('stage').getBoundingClientRect(), fr = f.getBoundingClientRect(), d = f.contentDocument;
          const m = getComputedStyle(f).transform, scale = m === 'none' ? 1 : new DOMMatrix(m).a;
          const c = d.querySelector('canvas').getBoundingClientRect(), play = d.querySelector('.movie-controller .mc-play');
          return { scale, fits: fr.left + c.left * scale - st.left >= -1 && fr.left + c.right * scale - st.left <= st.width + 1 && fr.top + c.top * scale - st.top >= -1 && fr.top + c.bottom * scale - st.top <= st.height + 1,
            playScreen: play ? play.getBoundingClientRect().height * scale : null, playOwn: play ? play.offsetHeight : null, stageH: st.height };
        })()`);
      };
      for (const [query, w, h] of [['', 1000, 620], ['centred', 1280, 800], ['vertical', 1280, 800], ['vertical', 600, 900], ['centred', 600, 900], ['vertical', 1000, 620]] as const) {
        const r = await look('tests/fixtures/view-responsive.html', query, w, h);
        const what = `${query || 'plain'} at ${w}x${h}`;
        expect(r.scale, what).toBe(1);                                          // not scaled: the page laid itself out narrower
        expect(r.fits, what).toBe(true);                                        // and the picture is inside the stage
        expect(r.playOwn, what).toBeGreaterThan(20);                            // the player bar's button is really there …
        expect(r.playScreen, what).toBeCloseTo(r.playOwn, 0);                   // … at its own size
        expect(r.stageH, what).toBeLessThan(h - 200);                           // leaving room for the timeline
      }
      // a player bar that cannot give way (a page on an older release): as narrow as the bar allows, then scaled for the rest
      const old = await look('tests/fixtures/view-responsive.html', 'vertical&oldbar', 1000, 620);
      expect(old.fits).toBe(true);
      expect(await cdp.eval("(() => { const b = document.getElementById('page').contentDocument.querySelector('.mc-bar'); return b.scrollWidth <= b.clientWidth + 1; })()")).toBe(true);
      expect(old.scale).toBeGreaterThan(0.5);                                   // larger than scaling the whole page (0.43)
      const fixed = await look('tests/films/timeline.html', '', 600, 900);      // a 640 × 360 canvas with no CSS, wider than the window: scaled to fit
      expect(fixed.fits).toBe(true);
    } finally {
      try { chromeProc.kill(); } catch { /* gone */ }
      for (const p of procs) p.kill();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 120_000);

  it('shows the page\'s warnings (a count that opens the list) and the sound under the timeline: the waveform of the mix and a mark where each sound starts', async () => {
    const open = async (page: string) => {
      const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, page), '--no-open'], { stdio: ['ignore', 'pipe', 'inherit'] });
      const url: string = await new Promise((res, rej) => {
        let buf = '';
        const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
        proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
      });
      return { proc, url };
    };
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-test-'));
    const { proc: chromeProc, cdp } = await launchPage(chrome, userDataDir);
    const procs: Array<ReturnType<typeof spawn>> = [];
    const ready = async (page: string) => {
      const { proc, url } = await open(page); procs.push(proc);
      await cdp.send('Page.navigate', { url });
      let ok = false;
      for (let i = 0; i < 100 && !ok; i++) { await check.sleep(300); ok = await cdp.eval("!!document.querySelector('#plot svg')").catch(() => false); }
      expect(ok).toBe(true);
      await check.sleep(1500);                                                  // the warnings are looked at every second
    };
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await ready('tests/fixtures/view-warnings.html');
      // warnings: a count, and the list with the message when it is opened
      expect(await cdp.eval("document.getElementById('warn').hidden")).toBe(false);
      expect(await cdp.eval("document.getElementById('warn').textContent")).toMatch(/1/);
      await cdp.eval("document.getElementById('warn').click()");
      expect(await cdp.eval("document.getElementById('warnings').hidden")).toBe(false);
      expect(await cdp.eval("document.getElementById('warnings').textContent")).toContain('alpah');
      // sound: a row named "sound", a waveform that is not flat, a mark per sound at its start
      expect(await cdp.eval("[...document.querySelectorAll('#names .name')].some(n => n.textContent === 'sound')")).toBe(true);
      expect(await cdp.eval("(document.querySelector('#plot svg .sound .wave')?.getAttribute('d') || '').length")).toBeGreaterThan(200);
      const cues: Array<{ name: string; x: number }> = await cdp.eval(`[...document.querySelectorAll('#plot svg .sound .cue')].map(c => ({ name: c.querySelector('title').textContent, x: +c.getAttribute('data-x') }))`);
      expect(cues.map(c => c.name).join(' ')).toMatch(/bed.*pop/);
      const x = (t: number) => cdp.eval(`(() => { const d = document.querySelector('#plot svg').dataset; return +d.x0 + (${t} / +d.duration) * (+d.x1 - +d.x0); })()`);
      expect(Math.abs(cues[0]!.x - await x(0.5))).toBeLessThan(1);
      expect(Math.abs(cues[1]!.x - await x(2))).toBeLessThan(1);
      // nothing the chart draws under its rows (the legend) sits on the sound row
      expect(await cdp.eval(`(() => {
        const svg = document.querySelector('#plot svg'), snd = svg.querySelector('.sound'), top = +svg.dataset.bottom, bottom = +snd.getAttribute('data-bottom');
        return [...svg.children].filter(el => el !== snd && el.id !== 'head').map(el => /translate\\(([-\\d.]+)[, ]+([-\\d.]+)\\)/.exec(el.getAttribute('transform') || '')).filter(Boolean).filter(m => +m[2] > top && +m[2] < bottom).length;
      })()`)).toBe(0);
      // the playhead reaches down through the sound row
      expect(await cdp.eval("+document.querySelector('#head line').getAttribute('y2') >= +document.querySelector('#plot svg .sound').getAttribute('data-bottom') - 1")).toBe(true);

      // a movie with no warnings and no sound: no count, no sound row
      await ready('tests/films/timeline.html');
      expect(await cdp.eval("document.getElementById('warn').hidden")).toBe(true);
      expect(await cdp.eval("!!document.querySelector('#plot svg .sound')")).toBe(false);
    } finally {
      try { chromeProc.kill(); } catch { /* gone */ }
      for (const p of procs) p.kill();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 120_000);

  /** A viewer on `page` (with `query`) in a fresh Chrome tab of `w` × `h`; `ready()` waits for the timeline. */
  async function viewer(page: string, o: { query?: string; w?: number; h?: number } = {}) {
    const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, page), '--no-open', ...(o.query ? ['--query', o.query] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
    const url: string = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
      proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
    });
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-test-'));
    const { proc: chromeProc, cdp } = await launchPage(chrome, userDataDir);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    if (o.w) await cdp.send('Emulation.setDeviceMetricsOverride', { width: o.w, height: o.h, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url });
    const until = async (expr: string, tries = 100) => { let v = false; for (let i = 0; i < tries && !v; i++) { await check.sleep(300); v = await cdp.eval(expr).catch(() => false); } return v; };
    const close = async () => { try { chromeProc.kill(); } catch { /* gone */ } proc.kill(); await check.sleep(200); try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* held */ } };
    return { cdp, until, close, ready: () => until("!!document.querySelector('#plot svg')") };
  }
  const press = (cdp: any, key: string) => cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, text: key }).then(() => cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key }));

  it('a page that could not start comes back with R, or by itself with auto, once it is fixed and saved; the old page\'s sound problems are gone', async () => {
    const live = join(root, 'tests/fixtures/view-recover.tmp.html');
    const good = readFileSync(join(root, 'tests/fixtures/view-warnings.html'), 'utf8');
    const quiet = good.replace("vars: { popVol: 1 }", "vars: { popVol: 0.0001 }");   // an inaudible sound: a sound problem
    const broken = good.replace("window.__ready = true;", "throw new Error('a missing image');");
    writeFileSync(live, quiet);
    const v = await viewer('tests/fixtures/view-recover.tmp.html');
    try {
      expect(await v.ready()).toBe(true);
      expect(await v.until("document.getElementById('warnings').textContent.includes('sound:')", 20)).toBe(true);
      for (const how of ['R', 'auto'] as const) {
        writeFileSync(live, broken);
        expect(await v.until("!document.getElementById('update').hidden", 30)).toBe(true);
        await v.cdp.eval("document.getElementById('reload').click()");
        expect(await v.until("/could not start/.test(document.getElementById('status').textContent)", 60)).toBe(true);
        expect(await v.cdp.eval("document.getElementById('warnings').textContent.includes('sound:')")).toBe(false);   // not the old page's
        if (how === 'auto') await v.cdp.eval("document.getElementById('auto').checked = true; document.getElementById('auto').dispatchEvent(new Event('change'))");
        writeFileSync(live, quiet);
        expect(await v.until("!document.getElementById('update').hidden || !!document.querySelector('#plot svg')", 30)).toBe(true);
        if (how === 'R') await press(v.cdp, 'r');
        expect(await v.ready(), how).toBe(true);
        if (how === 'auto') await v.cdp.eval("document.getElementById('auto').checked = false; document.getElementById('auto').dispatchEvent(new Event('change'))");
      }
    } finally {
      await v.close();
      rmSync(live, { force: true });
    }
  }, 180_000);

  it('a stray error before the movie is ready does not stop the wait: the timeline comes when the movie does', async () => {
    const v = await viewer('tests/fixtures/view-uncaught.html');
    try {
      expect(await v.ready()).toBe(true);
      expect(await v.cdp.eval("document.getElementById('warnings').textContent")).toContain('a stray widget failed');   // still listed
    } finally { await v.close(); }
  }, 90_000);

  it('two reloads in a row build the timeline once', async () => {
    const v = await viewer('tests/films/timeline.html');
    try {
      expect(await v.ready()).toBe(true);
      const before = await v.cdp.eval('+document.body.dataset.mounts');
      await v.cdp.eval("document.getElementById('reload').click(); setTimeout(() => document.getElementById('reload').click(), 30)");
      await check.sleep(500);
      expect(await v.ready()).toBe(true);
      await check.sleep(2500);
      expect(await v.cdp.eval('+document.body.dataset.mounts')).toBe(before + 1);
    } finally { await v.close(); }
  }, 90_000);

  it('opening the warnings keeps the timeline usable: the page makes room for the list', async () => {
    const v = await viewer('tests/fixtures/view-warnings.html', { w: 1000, h: 700 });
    try {
      expect(await v.ready()).toBe(true);
      await check.sleep(1500);
      await v.cdp.eval("document.getElementById('warn').click()");
      await check.sleep(300);
      expect(await v.cdp.eval("document.getElementById('chart').getBoundingClientRect().height")).toBeGreaterThan(150);
    } finally { await v.close(); }
  }, 90_000);

  it('after setVars rebuilds the movie, the sound row shows the new sound', async () => {
    const v = await viewer('tests/fixtures/view-warnings.html');
    try {
      expect(await v.ready()).toBe(true);
      const wave = () => v.cdp.eval("document.querySelector('#plot svg .sound .wave').getAttribute('d')");
      const before = await wave();
      await v.cdp.eval("document.getElementById('page').contentWindow.movie.setVars({ popVol: 0.0001 })");
      let changed = false;
      for (let i = 0; i < 30 && !changed; i++) { await check.sleep(300); changed = (await wave().catch(() => before)) !== before; }
      expect(changed).toBe(true);
      expect(await v.until("document.getElementById('warnings').textContent.includes('inaudible')", 20)).toBe(true);   // and its sound problems
    } finally { await v.close(); }
  }, 90_000);

  for (const [query, want] of [['', /BUILDING LAYERS\s+62%/], ['event', /LOADING ASSETS\s+40%/]] as const)
  it(`while the movie builds, the viewer shows how far it is (${query ? 'from the loadprogress event' : 'from the page loader'}), not a bare "loading"`, async () => {
    const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, 'tests/fixtures/view-progress.html'), '--no-open', ...(query ? ['--query', query] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
    const url: string = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
      proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
    });
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-test-'));
    const { proc: chromeProc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url });
      let text = '';
      for (let i = 0; i < 30 && !want.test(text); i++) { await check.sleep(300); text = await cdp.eval("document.getElementById('wait').innerText").catch(() => ''); }
      expect(text).toMatch(want);
      await check.sleep(400);                                                         // the bar eases to its width
      expect(await cdp.eval("parseFloat(getComputedStyle(document.querySelector('#wait .bar i')).width) / parseFloat(getComputedStyle(document.querySelector('#wait .bar')).width)")).toBeCloseTo(query ? 0.4 : 0.62, 1);
      await check.sleep(1500);
      text = await cdp.eval("document.getElementById('wait').innerText").catch(() => '');
      expect(text).not.toMatch(/\d+\s*s\b/);                                      // no seconds counter: the stage and the percent say how far it is
    } finally {
      try { chromeProc.kill(); } catch { /* gone */ }
      proc.kill();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 60_000);

  for (const query of ['', 'short'])
  it(`a page whose movie cannot start says why at once (the init failure from window.__logs${query ? ', written "init:"' : ''}), not "loading the page…" for two minutes`, async () => {
    const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, 'tests/fixtures/view-init-failed.html'), '--no-open', ...(query ? ['--query', query] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
    const url: string = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
      proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
    });
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-test-'));
    const { proc: chromeProc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url });
      let status = '';
      for (let i = 0; i < 30 && !/could not start/.test(status); i++) { await check.sleep(300); status = await cdp.eval("document.getElementById('status').textContent").catch(() => ''); }
      expect(status).toMatch(/could not start/);
      expect(status).toContain('could not start — [Loader.load] Failed to load');          // the "init failed:" prefix dropped, one space
      expect(await cdp.eval("getComputedStyle(document.getElementById('status')).color")).not.toBe(await cdp.eval("getComputedStyle(document.getElementById('time')).color"));
    } finally {
      try { chromeProc.kill(); } catch { /* gone */ }
      proc.kill();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 60_000);

  it('tells you the work changed but never switches by itself; reload keeps the place; auto reloads only when the movie is paused', async () => {
    const live = join(root, 'tests/films/view-live.tmp.html');
    writeFileSync(live, readFileSync(join(root, 'tests/films/determinism-first-frame.html'), 'utf8').replace('duration: 2,', 'duration: 60,'));          // long enough to still be playing when the edit arrives
    const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), live, '--no-open'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const url: string = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
      proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
    });
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-live-'));
    const { proc: chromeProc, cdp } = await launchPage(chrome, userDataDir);
    const touch = (n: number) => { writeFileSync(live, readFileSync(live, 'utf8') + `\n<!-- edit ${n} -->`); utimesSync(live, new Date(Date.now() + n * 2000), new Date(Date.now() + n * 2000)); };
    const waitFor = async (js: string, ms = 8000) => { for (let i = 0; i < ms / 150; i++) { if (await cdp.eval(js).catch(() => false)) return true; await check.sleep(150); } return false; };
    const readyJs = "!!document.querySelector('#plot svg') && !!document.querySelector('#head')";
    try {
      await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Page.navigate', { url });
      expect(await waitFor(readyJs, 30000)).toBe(true);
      expect(await cdp.eval("document.getElementById('update').hidden")).toBe(true);          // nothing to say yet
      await cdp.eval("document.getElementById('page').contentWindow.__marker = 1; document.getElementById('page').contentWindow.movie.gotoFrame(20, true)");
      await waitFor("document.getElementById('page').contentWindow.movie.currentFrame === 20");

      // the work changes: a notice, and the picture you are looking at does not move
      touch(1);
      expect(await waitFor("!document.getElementById('update').hidden")).toBe(true);
      expect(await cdp.eval("document.getElementById('page').contentWindow.__marker")).toBe(1);         // not reloaded
      expect(await cdp.eval("document.getElementById('page').contentWindow.movie.currentFrame")).toBe(20);
      expect(await cdp.eval("document.getElementById('update').textContent")).toMatch(/\d\d:\d\d:\d\d/);

      // reload (the button; the key R does the same): a fresh page at the same frame, the notice gone
      await cdp.eval("document.getElementById('reload').click()");
      expect(await waitFor("document.getElementById('page').contentWindow.__marker === undefined && document.getElementById('page').contentWindow.__ready === true && !!document.querySelector('#plot svg')", 30000)).toBe(true);
      expect(await waitFor("document.getElementById('page').contentWindow.movie.currentFrame === 20")).toBe(true);
      expect(await cdp.eval("document.getElementById('update').hidden")).toBe(true);

      // auto: not while the movie plays, only once it is paused
      await cdp.eval("document.getElementById('auto').click(); document.getElementById('page').contentWindow.__marker = 2; document.getElementById('page').contentWindow.movie.play()");
      touch(2);
      expect(await waitFor("!document.getElementById('update').hidden")).toBe(true);
      await check.sleep(2500);
      expect(await cdp.eval("document.getElementById('page').contentWindow.__marker")).toBe(2);         // still the page you were watching
      await cdp.eval("document.getElementById('page').contentWindow.movie.pause()");
      expect(await waitFor("document.getElementById('page').contentWindow.__marker === undefined && document.getElementById('page').contentWindow.__ready === true", 30000)).toBe(true);
    } finally {
      try { chromeProc.kill(); } catch { /* gone */ }
      proc.kill();
      await check.sleep(200);
      rmSync(live, { force: true });
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 120_000);

  it('puts the page in the middle of the viewer even when the page itself is left-aligned', async () => {
    const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, 'tests/films/determinism-first-frame.html'), '--no-open'], { stdio: ['ignore', 'pipe', 'inherit'] });   // a 640 px canvas at the left edge of the page
    const url: string = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
      proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
    });
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-centre-'));
    const { proc: chromeProc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable'); await cdp.send('Page.enable'); await cdp.send('Page.navigate', { url });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval("!!document.querySelector('#plot svg') && !!document.querySelector('#head')").catch(() => false); }
      expect(ready).toBe(true);
      const centres = await cdp.eval(`(() => {
        const f = document.getElementById('page'), fr = f.getBoundingClientRect(), k = fr.width / f.offsetWidth;
        const c = f.contentDocument.querySelector('canvas').getBoundingClientRect();
        return { canvas: fr.left + (c.left + c.width / 2) * k, stage: document.getElementById('stage').getBoundingClientRect().left + document.getElementById('stage').clientWidth / 2 };
      })()`);
      expect(Math.abs(centres.canvas - centres.stage)).toBeLessThanOrEqual(3);                  // the picture sits in the middle of the viewer, not against its left edge
    } finally {
      try { chromeProc.kill(); } catch { /* gone */ }
      proc.kill();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);

  it('zooms: fit shows the whole movie without sideways scrolling; + makes the chart wider; the names stay in a fixed column; clicks still seek to the right time', async () => {
    const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, 'tests/films/timeline.html'), '--no-open'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const url: string = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
      proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
    });
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-zoom-'));
    const { proc: chromeProc, cdp } = await launchPage(chrome, userDataDir);
    try {
      await cdp.send('Runtime.enable');
      await cdp.send('Page.enable');
      await cdp.send('Page.navigate', { url });
      let ready = false;
      for (let i = 0; i < 100 && !ready; i++) { await check.sleep(300); ready = await cdp.eval("!!document.querySelector('#plot svg') && !!document.querySelector('#head')").catch(() => false); }
      expect(ready).toBe(true);
      const m = () => cdp.eval(`(() => { const c = document.getElementById('chart'), s = document.querySelector('#plot svg'); return { svgW: s.getBoundingClientRect().width, scrollW: c.scrollWidth, clientW: c.clientWidth, label: document.getElementById('zlabel').textContent, names: document.querySelectorAll('#names .name').length, namesLeft: document.getElementById('names').getBoundingClientRect().left, scrollLeft: c.scrollLeft }; })()`);

      const fit = await m();
      expect(fit.label).toBe('fit');
      expect(fit.scrollW).toBeLessThanOrEqual(fit.clientW + 1);               // the whole movie, no sideways scrolling
      expect(fit.names).toBeGreaterThan(5);

      for (let i = 0; i < 4; i++) await cdp.eval("document.getElementById('zin').click()");
      const zoomed = await m();
      expect(zoomed.label).toMatch(/×$/);
      expect(zoomed.svgW).toBeGreaterThan(fit.svgW * 3);
      expect(zoomed.scrollW).toBeGreaterThan(zoomed.clientW);

      // scroll right: the names column does not move
      await cdp.eval("document.getElementById('chart').scrollLeft = 500");
      const scrolled = await m();
      expect(scrolled.namesLeft).toBeCloseTo(zoomed.namesLeft, 0);

      // a click at the middle of what is visible seeks to the time under it
      const total = await cdp.eval("document.getElementById('page').contentWindow.movie.totalFrames");
      const expected = await cdp.eval(`(() => { const s = document.querySelector('#plot svg'), r = s.getBoundingClientRect(), d = s.dataset, c = document.getElementById('chart').getBoundingClientRect();
        const cx = c.left + 250 + (c.width - 250) / 2, ux = ((cx - r.left) / r.width) * s.viewBox.baseVal.width;
        const t = Math.max(0, Math.min(1, (ux - +d.x0) / (+d.x1 - +d.x0))) * +d.duration;
        s.dispatchEvent(new PointerEvent('pointerdown', { clientX: cx, clientY: r.top + 60, bubbles: true, pointerId: 1 }));
        s.dispatchEvent(new PointerEvent('pointerup', { clientX: cx, clientY: r.top + 60, bubbles: true, pointerId: 1 }));
        return Math.round(t * document.getElementById('page').contentWindow.movie.frameRate); })()`);
      let frame = -99;
      for (let i = 0; i < 30 && Math.abs(frame - expected) > 2; i++) { await check.sleep(200); frame = await cdp.eval("document.getElementById('page').contentWindow.movie.currentFrame"); }
      expect(Math.abs(frame - expected)).toBeLessThanOrEqual(2);
      expect(expected).toBeLessThan(total);

      await cdp.eval("document.getElementById('zfit').click()");
      const back = await m();
      expect(back.label).toBe('fit');
      expect(back.scrollW).toBeLessThanOrEqual(back.clientW + 1);
    } finally {
      try { chromeProc.kill(); } catch { /* gone */ }
      proc.kill();
      await check.sleep(200);
      try { rmSync(userDataDir, { recursive: true, force: true }); } catch { /* chrome may still hold files */ }
    }
  }, 90_000);
});
