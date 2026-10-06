// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const view: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/view.mjs')).href);
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);

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

const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));
describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('view.mjs — the viewer, run for real in Chrome', () => {
  it('shows the timeline under the page; a click on it seeks the movie and the playhead follows the movie when it plays', async () => {
    const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, 'examples/gallery/blueprint-house.html'), '--no-open'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const url: string = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
      proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
    });
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-test-'));
    const { proc: chromeProc, cdp } = await check.launchChrome(chrome, userDataDir);
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

  it('zooms: fit shows the whole movie without sideways scrolling; + makes the chart wider; the names stay in a fixed column; clicks still seek to the right time', async () => {
    const proc = spawn('node', [join(root, 'ai/tools/view.mjs'), join(root, 'examples/gallery/blueprint-house.html'), '--no-open'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const url: string = await new Promise((res, rej) => {
      let buf = '';
      const t = setTimeout(() => rej(new Error('the viewer did not print its address')), 15000);
      proc.stdout!.on('data', d => { buf += d; const m = buf.match(/(http:\/\/127\.0\.0\.1:\d+\/__viewer)/); if (m) { clearTimeout(t); res(m[1]!); } });
    });
    const userDataDir = mkdtempSync(join(tmpdir(), 'view-zoom-'));
    const { proc: chromeProc, cdp } = await check.launchChrome(chrome, userDataDir);
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
