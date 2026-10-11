// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

// the first test of a file starts a browser tab and loads the page; under the whole suite's load that can pass the 5 s default
vi.setConfig({ testTimeout: 60000 });
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function open<T>(fn: (cdp: any) => Promise<T>, query = ''): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'vars-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/variables.html${query}` });
    for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}

const TOL = 3;
const near = (got: number[], want: number[], label: string) => { for (let k = 0; k < 3; k++) expect(Math.abs(got[k]! - want[k]!), `${label} channel ${k}: got ${got} want ${want}`).toBeLessThanOrEqual(TOL); };
const RED = [255, 0, 0], BLUE = [0, 0, 255], BLACK = [0, 0, 0];
/** A 20 x 20 square centred at x = `xExpr`, y = H/2. */
const square = (fill: string, xExpr: string | number = 'W/2', extra: Record<string, unknown> = {}) => ({ type: 'shape', shape: 'rect', name: 'sq', width: 20, height: 20, initial: { x: xExpr, y: 'H/2', fillColor: fill }, ...extra });
const mk = (cdp: any, opts: unknown) => cdp.eval(`mk(${JSON.stringify(opts)})`);
const px = async (cdp: any, f: number, x: number, y: number): Promise<number[]> => { const url: string = await cdp.eval(`snap(${f})`); return cdp.eval(`px(${JSON.stringify(url)}, ${x}, ${y})`); };

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS).each([['the default backend', ''], ['WebGL', '?backend=webgl']])('rebuild, resize and variables, on a real browser (%s)', (_label, query) => {
  const withPage = <T,>(fn: (cdp: any) => Promise<T>) => open(fn, query);

  it('movie.resize(w, h) makes the canvas that size and the expressions follow it (W / H are the new size): a square centred by W/2 stays in the middle', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { composition: { sequences: [square('#ff0000')] } });
      near(await px(cdp, 0, 80, 45), RED, 'centre before');
      near(await px(cdp, 0, 20, 45), BLACK, 'left before');
      const report = await cdp.eval('movie.resize(320, 180)');
      expect(await cdp.eval('size()')).toEqual({ w: 320, h: 180, cw: 320, ch: 180 });
      near(await px(cdp, 0, 160, 90), RED, 'centre after: W/2 is now 160');
      near(await px(cdp, 0, 80, 90), BLACK, 'where the square was is empty');
      expect(report).toMatchObject({ reason: 'resize', frame: 0, playing: false, audio: 'none' });
      expect(typeof report.ms).toBe('number');
      expect((await cdp.eval('__logs')).filter((l: string) => l.includes('pixi-effects:'))).toEqual([]);
    });
  });

  it('a rebuild keeps the playhead (and the poster), the playing state, and says so with a rebuilt event', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { duration: 4, composition: { sequences: [square('#ff0000')] } });
      await cdp.eval('movie.gotoFrame(40)');
      let r = await cdp.eval('movie.rebuild({})');
      expect(r).toMatchObject({ reason: 'rebuild', frame: 40, playing: false });
      expect(await cdp.eval('movie.currentFrame')).toBe(40);
      await cdp.eval('movie.play()');
      r = await cdp.eval('movie.rebuild({})');
      expect(r.playing).toBe(true);
      expect(await cdp.eval('movie.isPlaying')).toBe(true);
      expect(await cdp.eval('events.map(e => e.reason)')).toEqual(['rebuild', 'rebuild']);
      await cdp.eval('movie.pause()');
    });
  });

  it('the poster stays: a movie showing its poster shows it again after a rebuild (the playhead is still 0), and a movie that has played away from it does not go back', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { poster: 0.5, duration: 2, composition: { sequences: [square('#ff0000')] } });
      expect(await cdp.eval('movie._atPoster'), 'before').toBe(true);                    // (the canvas can not be read outside the frame on WebGPU: the state is)
      await cdp.eval('movie.rebuild({})');
      expect(await cdp.eval('movie._atPoster'), 'after the rebuild').toBe(true);
      expect(await cdp.eval('movie.currentFrame')).toBe(0);
      await cdp.eval('movie.gotoFrame(30)');
      expect(await cdp.eval('movie._atPoster')).toBe(false);
      await cdp.eval('movie.rebuild({})');
      expect(await cdp.eval('movie._atPoster'), 'a movie that left the poster stays off it').toBe(false);
      expect(await cdp.eval('movie.currentFrame')).toBe(30);
    });
  });

  it('rebuild({ composition }) replaces the composition (a layout function called again with the new size)', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { composition: { sequences: [square('#ff0000')] } });
      await cdp.eval(`movie.rebuild(${JSON.stringify({ composition: { sequences: [square('#0000ff')] } })})`);
      near(await px(cdp, 0, 80, 45), BLUE, 'the new composition');
    });
  });

  it('a rebuild that fails leaves the old picture, says why (error event, the promise rejects), and the movie still works', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { composition: { sequences: [square('#ff0000')] } });
      const msg: string = await cdp.eval(`movie.rebuild(${JSON.stringify({ composition: { sequences: [{ type: 'image', asset: 'nobody-registered-this' }] } })}).then(() => 'no error', e => String(e && e.message || e))`);
      expect(msg).not.toBe('no error');
      near(await px(cdp, 0, 80, 45), RED, 'the old composition is still there');
      await cdp.eval('movie.rebuild({})');                                    // and a good rebuild works afterwards
      near(await px(cdp, 0, 80, 45), RED, 'after a good rebuild');
    });
  });

  it('twenty rebuilds and resizes in a row draw the same picture as the first (nothing leaks, no shared texture was destroyed)', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { composition: { sequences: [square('#ff0000')] } });
      const first = await px(cdp, 0, 80, 45);
      for (let i = 0; i < 10; i++) { await cdp.eval('movie.rebuild({})'); await cdp.eval('movie.resize(200, 120)'); await cdp.eval('movie.resize(160, 90)'); }
      near(await px(cdp, 0, 80, 45), first, 'after 30 rebuilds');
      expect(await cdp.eval('movie.app.stage.children[0].children.length'), 'the old composition was taken off the stage each time').toBe(1);
      expect((await cdp.eval('__logs')).filter((l: string) => l.includes('pixi-effects:') || /destroyed|null/i.test(l))).toEqual([]);
    });
  });
  it('a number declared in vars is an identifier in an expression, and setVars moves it: the picture follows', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { vars: { shift: 40 }, composition: { sequences: [square('#ff0000', 'W/2 + shift')] } });
      near(await px(cdp, 0, 120, 45), RED, 'x = 80 + 40');
      near(await px(cdp, 0, 40, 45), BLACK, 'x = 40 is empty');
      const r = await cdp.eval('movie.setVars({ shift: -40 })');
      expect(r).toMatchObject({ reason: 'vars' });
      near(await px(cdp, 0, 40, 45), RED, 'x = 80 - 40');
      near(await px(cdp, 0, 120, 45), BLACK, 'x = 120 is empty now');
      expect(await cdp.eval('movie.vars')).toEqual({ shift: -40 });
    });
  });

  it('{name} in a string is replaced by a string variable: a colour that setVars changes', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { vars: { accent: '#ff0000' }, composition: { sequences: [square('{accent}')] } });
      near(await px(cdp, 0, 80, 45), RED, 'declared red');
      await cdp.eval("movie.setVars({ accent: '#0000ff' })");
      near(await px(cdp, 0, 80, 45), BLUE, 'now blue');
    });
  });

  it('a value it already has changes nothing: no rebuild, no event, unchanged: true; a name that was not declared says which one it looks like and is ignored', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { vars: { shift: 40 }, composition: { sequences: [square('#ff0000', 'W/2 + shift')] } });
      const same = await cdp.eval('movie.setVars({ shift: 40 })');
      expect(same).toMatchObject({ unchanged: true, ms: 0 });
      const typo = await cdp.eval('movie.setVars({ shfit: 1 })');
      expect(typo.unchanged).toBe(true);
      expect((await cdp.eval('__logs')).join('\n')).toMatch(/"shfit" is not a declared variable — did you mean "shift"\?/);
      expect(await cdp.eval('events.length')).toBe(0);
    });
  });

  it('a name an expression already means is refused when it is declared (said once, the movie still builds)', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { vars: { W: 5, ok: 1 }, composition: { sequences: [square('#ff0000')] } });
      expect((await cdp.eval('__logs')).join('\n')).toMatch(/"W" is reserved/);
      expect(await cdp.eval('movie.vars')).toEqual({ ok: 1 });
      near(await px(cdp, 0, 80, 45), RED, 'built');
    });
  });

  it('calls that arrive while a rebuild runs are joined into one more rebuild, with the latest values', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { vars: { shift: 0 }, composition: { sequences: [square('#ff0000', 'W/2 + shift')] } });
      const out = await cdp.eval('(async () => { const a = movie.setVars({ shift: 10 }), b = movie.setVars({ shift: 20 }), c = movie.setVars({ shift: 30 }); const r = await Promise.all([a, b, c]); return { same: r[1] === r[2], reasons: events.map(e => e.reason) }; })()');
      expect(out.same, 'the two joined calls get the same report').toBe(true);
      expect(out.reasons.length, 'the first call ran, and the other two were one more rebuild').toBe(2);
      expect(await cdp.eval('movie.vars')).toEqual({ shift: 30 });
      near(await px(cdp, 0, 110, 45), RED, 'x = 80 + 30');
    });
  });

  it('the sound is mixed again only when it changed: reused for a change that is not in the sound, mixed when a sound changes', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { vars: { shift: 0, kind: 'pop' }, composition: { sequences: [square('#ff0000', 'W/2 + shift'), { type: 'audio', sfx: '{kind}', at: 0 }] } });
      const same = await cdp.eval('movie.setVars({ shift: 5 })');
      expect(same.audio, 'a position moved, the sound did not').toBe('reused');
      const other = await cdp.eval("movie.setVars({ kind: 'click' })");
      expect(other.audio, 'another sound').toBe('mixed');
      const again = await cdp.eval('movie.setVars({ shift: 6 })');
      expect(again.audio).toBe('reused');
      expect((await cdp.eval('__logs')).filter((l: string) => l.includes('pixi-effects:'))).toEqual([]);
    });
  });

  it('after resize() the size of the movie wins over a width and height the composition names (the expressions follow the new size)', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { composition: { width: 160, height: 90, sequences: [square('#ff0000')] } });
      await cdp.eval('movie.resize(320, 180)');
      near(await px(cdp, 0, 160, 90), RED, 'W/2 = 160, not 80');
    });
  });

  it('vars is a copy: changing what it returns changes nothing', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { vars: { shift: 40 }, composition: { sequences: [square('#ff0000', 'W/2 + shift')] } });
      await cdp.eval('(() => { movie.vars.shift = 99; })()');
      expect(await cdp.eval('movie.vars')).toEqual({ shift: 40 });
    });
  });
});
