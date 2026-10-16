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
        expect(r.stdout).toMatch(new RegExp(`usage: .*${cmd}\\.mjs`));
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
    expect(html).toContain('<iframe id="page" src="/examples/a.html?x=1"');
    expect(html).toContain('id="chart"');
    expect(html).toContain('id="zin"');
    expect(html).toContain('movie.timelineSvg()');
    expect(html).toContain('&lt;b&gt;my&lt;/b&gt; &amp; video');
    expect(html).not.toContain('<b>my</b>');
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

  it('tells you the work changed but never switches by itself; reload keeps the place; auto reloads only when the movie is paused', async () => {
    const live = join(root, 'examples/_checks/view-live.tmp.html');
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
