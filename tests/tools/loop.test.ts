// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';

vi.setConfig({ testTimeout: 60000 });
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

// movie.loop: at the end of an ordinary play the movie goes back to the start and plays on
const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function open<T>(fn: (cdp: any) => Promise<T>, query = ''): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'loop-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/variables.html${query}` });
    for (let i = 0; i < 300; i++) { if (await cdp.eval('window.__ready === true').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}
const square = { type: 'shape', shape: 'rect', width: 20, height: 20, initial: { x: 'W/2', y: 'H/2', fillColor: '#ff0000' } };
const mk = (cdp: any, opts: unknown) => cdp.eval(`mk(${JSON.stringify(opts)})`);
const SHORT = { duration: 0.5, composition: { sequences: [square] } };

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS).each([['the default backend', ''], ['WebGL', '?backend=webgl']])('movie.loop, on a real browser (%s)', (_label, query) => {
  const withPage = <T,>(fn: (cdp: any) => Promise<T>) => open(fn, query);

  it('by default a movie ends at the end: one ended event, not playing', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, SHORT);
      expect(await cdp.eval('movie.loop')).toBe(false);
      const out = await cdp.eval(`(async () => { let ended = 0; movie.on('ended', () => ended++); movie.play(); await new Promise(r => setTimeout(r, 1500)); return { ended, playing: movie.isPlaying }; })()`);
      expect(out).toEqual({ ended: 1, playing: false });
    });
  });

  it('with loop it goes back to the start and plays on: no ended event, the frames wrap, and no pause / play noise at the wrap', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { ...SHORT, loop: true });
      expect(await cdp.eval('movie.loop')).toBe(true);
      const out = await cdp.eval(`(async () => {
        let ended = 0; movie.on('ended', () => ended++);
        const frames = []; movie.on('frame', e => frames.push(e.frame));
        window.played.length = 0;
        movie.play(); await new Promise(r => setTimeout(r, 1900));
        const wraps = frames.filter((f, i) => i > 0 && f < frames[i - 1]).length;
        const res = { ended, playing: movie.isPlaying, wraps, played: window.played.slice(), max: Math.max(...frames) };
        movie.pause(); return res;
      })()`);
      expect(out.ended).toBe(0);
      expect(out.playing).toBe(true);
      expect(out.wraps, '0.5 s long, 1.9 s of playing: at least 2 laps').toBeGreaterThanOrEqual(2);
      expect(out.played, 'only the play the page asked for').toEqual(['play']);
      expect(out.max).toBeLessThanOrEqual(15);
    });
  });

  it('the sound plays again on every lap (a new source each time)', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { duration: 0.6, loop: true, composition: { sequences: [square, { type: 'audio', sfx: 'pop', at: 0 }] } });
      const out = await cdp.eval(`(async () => {
        movie.play(); await new Promise(r => setTimeout(r, 200)); const first = movie.audioSource;
        await new Promise(r => setTimeout(r, 900)); const later = movie.audioSource;
        const res = { first: !!first, later: !!later, same: first === later, playing: movie.isPlaying };
        movie.pause(); return res;
      })()`);
      expect(out).toEqual({ first: true, later: true, same: false, playing: true });
    });
  });

  it('movie.loop can be changed while it plays: the setter says loopchange once per real change; init({ loop }) is the first value', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, SHORT);
      const out = await cdp.eval(`(() => { const got = []; movie.on('loopchange', e => got.push(e.loop)); movie.loop = true; movie.loop = true; movie.loop = false; movie.loop = 1; return got; })()`);
      expect(out).toEqual([true, false, true]);
      expect(await cdp.eval('movie.loop')).toBe(true);
    });
  });

  it('playUntil() to the end ignores the loop: it lands, says ended, and stops', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { ...SHORT, loop: true });
      const out = await cdp.eval(`(async () => { let ended = 0; movie.on('ended', () => ended++); const landed = await movie.playUntil(); await new Promise(r => setTimeout(r, 300)); return { landed, ended, playing: movie.isPlaying }; })()`);
      expect(out).toEqual({ landed: true, ended: 1, playing: false });
    });
  });

  it('turning the loop off during a lap lets the movie end at the end of that lap', async () => {
    await withPage(async (cdp) => {
      await mk(cdp, { ...SHORT, loop: true });
      const out = await cdp.eval(`(async () => { let ended = 0; movie.on('ended', () => ended++); movie.play(); await new Promise(r => setTimeout(r, 700)); movie.loop = false; await new Promise(r => setTimeout(r, 1200)); return { ended, playing: movie.isPlaying }; })()`);
      expect(out).toEqual({ ended: 1, playing: false });
    });
  });
});
