// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

// The 1.0 landing page in a real browser (plan Task 7; Review Focus 1 and 5).
const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function withLanding<T>(width: number, fn: (cdp: any) => Promise<T>, setup?: (cdp: any) => Promise<void>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'landing-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });   // nothing plays by itself: the layout is what is measured
    if (setup) await setup(cdp);
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/index.html` });
    await check.sleep(1200);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('the landing page in a real browser', () => {
  it('at 390 px, with each language tab selected, nothing scrolls sideways (long sentences without spaces wrap)', async () => {
    await withLanding(390, async (cdp) => {
      const tabs: string[] = await cdp.eval(`[...document.querySelectorAll('[role="tab"]')].map(t => t.id)`);
      expect(tabs.length).toBeGreaterThan(0);
      for (const id of tabs) {
        await cdp.eval(`document.getElementById(${JSON.stringify(id)}).click()`);
        await check.sleep(150);
        const r = await cdp.eval(`(() => {
          const s = [...document.querySelectorAll('#hero .sentence')].find(p => !p.hidden);
          const b = s.getBoundingClientRect();
          return { over: document.documentElement.scrollWidth - innerWidth, right: b.right, width: innerWidth, selected: document.getElementById(${JSON.stringify(id)}).getAttribute('aria-selected') };
        })()`);
        expect(r.selected, id).toBe('true');
        expect(r.over, id).toBeLessThanOrEqual(0);
        expect(r.right, id).toBeLessThanOrEqual(r.width);
      }
    });
  }, 60000);

  it('a tab shows its own sentence and puts its own piece in the hero player', async () => {
    await withLanding(1440, async (cdp) => {
      const tabs: Array<{ id: string; page: string }> = await cdp.eval(`[...document.querySelectorAll('[role="tab"]')].map(t => ({ id: t.id, page: t.dataset.page }))`);
      const last = tabs[tabs.length - 1]!;
      await cdp.eval(`document.getElementById(${JSON.stringify(last.id)}).click()`);
      const r = await cdp.eval(`({ page: document.querySelector('#hero figure.live').getAttribute('data-page'), shown: [...document.querySelectorAll('#hero .sentence')].filter(p => !p.hidden).map(p => p.dataset.tab) })`);
      expect(r.page).toBe(last.page);
      expect(r.shown).toEqual([last.id]);
    });
  }, 30000);

  it('the language tabs work with the keyboard (arrows move the selection and the focus)', async () => {
    await withLanding(1440, async (cdp) => {
      await cdp.eval(`document.querySelector('[role="tab"]').focus()`);
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
      await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
      const r = await cdp.eval(`({ focused: document.activeElement.id, selected: document.querySelector('[role="tab"][aria-selected="true"]').id, second: document.querySelectorAll('[role="tab"]')[1].id })`);
      expect(r.selected).toBe(r.second);
      expect(r.focused).toBe(r.second);
    });
  }, 30000);

  it('the copy button copies the command, and when the clipboard is refused it selects the command instead', async () => {
    await withLanding(1440, async (cdp) => {
      await cdp.eval(`navigator.clipboard.writeText = () => Promise.reject(new Error('denied'))`);
      await cdp.eval(`document.querySelector('#start [data-copy]').click()`);
      await check.sleep(300);
      const r = await cdp.eval(`({ selection: String(getSelection()), label: document.querySelector('#start [data-copy]').textContent })`);
      expect(r.selection.trim()).toBe('npx skills add yjmtmtk/pixi-effects');
      expect(r.label).toMatch(/select|press/i);
    });
    await withLanding(1440, async (cdp) => {
      await cdp.eval(`window.__copied = null; navigator.clipboard.writeText = (t) => { window.__copied = t; return Promise.resolve(); }`);
      await cdp.eval(`document.querySelector('#start [data-copy]').click()`);
      await check.sleep(300);
      expect(await cdp.eval(`window.__copied`)).toBe('npx skills add yjmtmtk/pixi-effects');
    });
  }, 30000);
});
