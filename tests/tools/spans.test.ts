// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { launchPage } from '../support/browser';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

async function open<T>(query: string, fn: (cdp: any) => Promise<T>): Promise<T> {
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'spans-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/examples/_checks/spans.html${query}` });
    for (let i = 0; i < 150; i++) { if (await cdp.eval('window.__ready').catch(() => false)) break; await check.sleep(200); }
    expect(await cdp.eval('window.__ready === true'), JSON.stringify(await cdp.eval('window.__logs'))).toBe(true);
    return await fn(cdp);
  } finally { try { proc.kill(); } catch { /* gone */ } server.close(); await check.sleep(200); try { rmSync(dir, { recursive: true, force: true }); } catch { /* held */ } }
}
const box = (cdp: any, frame: number, colour: string): Promise<number[] | null> => cdp.eval(`bbox(${frame}, ${JSON.stringify(colour)})`);

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('a text layer with spans, on a real browser', () => {
  it('the pieces follow each other on the line, each in its colour, and the newline starts a second line at the left edge', async () => {
    await open('', async (cdp) => {
      const [white, red, green, blue] = [await box(cdp, 0, 'white'), await box(cdp, 0, 'red'), await box(cdp, 0, 'green'), await box(cdp, 0, 'blue')];
      expect(white && red && green && blue, JSON.stringify({ white, red, green, blue })).toBeTruthy();
      expect(Math.abs(red![0] - (white![2] + 1)), 'RR starts where WW ends').toBeLessThanOrEqual(6);
      expect(Math.abs(green![0] - (red![2] + 1)), 'GG starts where RR ends').toBeLessThanOrEqual(6);
      expect(white![0], 'the line starts at x = 40 (plus the glyph\'s own side bearing)').toBeGreaterThanOrEqual(38);
      expect(white![0]).toBeLessThanOrEqual(48);
      expect(Math.abs(blue![0] - white![0]), 'the second line starts at the same left edge').toBeLessThanOrEqual(8);
      expect(blue![1], 'and sits below the first').toBeGreaterThan(white![3]);
      expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');
    });
  });

  it('inspect lists the group and its pieces (s/s.0 … s/s.3), and says nothing is wrong with a line of adjacent pieces', async () => {
    await open('', async (cdp) => {
      const paths = JSON.parse(await cdp.eval('(async () => JSON.stringify(await pieceNames()))()')) as string[];
      expect(paths).toEqual(expect.arrayContaining(['s', 's/s.0', 's/s.1', 's/s.2', 's/s.3']));
      expect(JSON.parse(await cdp.eval('(async () => JSON.stringify(await issues()))()')), 'inspect finds no overlap between neighbouring pieces').toEqual([]);
    });
  });

  it('the timeline view labels the group with what it spells', async () => {
    await open('', async (cdp) => {
      const detail = await cdp.eval(`movie.timelineData().rows.find(r => r.path === 's').detail`);
      expect(detail).toBe('WWRRGG BB');
    });
  });

  it('align right puts the shorter line against the right edge of the block', async () => {
    await open('?align=right', async (cdp) => {
      const [green, blue] = [await box(cdp, 0, 'green'), await box(cdp, 0, 'blue')];
      expect(Math.abs(blue![2] - green![2]), 'BB ends where GG ends').toBeLessThanOrEqual(8);
    });
  });

  it('anchorX / anchorY 0.5 centre the whole block on x, y (the block is as big as the measured lines)', async () => {
    await open('?anchor=1', async (cdp) => {
      const boxes = [await box(cdp, 0, 'white'), await box(cdp, 0, 'red'), await box(cdp, 0, 'green'), await box(cdp, 0, 'blue')] as number[][];
      const x0 = Math.min(...boxes.map(b => b[0])), x1 = Math.max(...boxes.map(b => b[2])), y0 = Math.min(...boxes.map(b => b[1])), y1 = Math.max(...boxes.map(b => b[3]));
      expect(Math.abs((x0 + x1) / 2 - 320), 'centred on x = 320').toBeLessThanOrEqual(10);
      expect(Math.abs((y0 + y1) / 2 - 180), 'centred on y = 180').toBeLessThanOrEqual(14);
    });
  });

  it('a variable inside a span is read before the pieces are placed: setVars builds the layer again and lays the line out again', async () => {
    await open('?vars=1', async (cdp) => {
      const before = await box(cdp, 0, 'red'), greenBefore = await box(cdp, 0, 'green');
      await cdp.eval(`movie.setVars({ word: 'RRRR' })`);
      const after = await box(cdp, 0, 'red'), greenAfter = await box(cdp, 0, 'green');
      expect(after![2] - after![0], 'twice the letters, about twice as wide').toBeGreaterThan((before![2] - before![0]) * 1.7);
      expect(greenAfter![0] - greenBefore![0], 'GG moved right by the width of the two new R').toBeGreaterThan(40);
      expect(await cdp.eval('JSON.stringify(window.__logs)')).toBe('[]');
    });
  });

  it('a typewriter (visibleChars) runs over ALL the spans, in order: the newline counts as a character', async () => {
    await open('?typed=1', async (cdp) => {
      expect(await box(cdp, 0, 'white'), 'frame 0: nothing typed').toBeNull();
      const w3 = await box(cdp, 3, 'white'), r3 = await box(cdp, 3, 'red');
      expect(w3, 'three characters: WW and the first R').toBeTruthy();
      expect(r3, 'the first R is there').toBeTruthy();
      const full = await box(cdp, 9, 'red');
      expect(r3![2] - r3![0], 'half of RR so far').toBeLessThan((full![2] - full![0]) * 0.7);
      expect(await box(cdp, 5, 'green'), 'after 5 characters (WW RR + one G) a G shows').toBeTruthy();
      expect(await box(cdp, 5, 'blue'), 'but not the second line yet').toBeNull();
      expect(await box(cdp, 7, 'blue'), 'after 7 characters (the newline is the 7th) there is no B yet').toBeNull();
      expect(await box(cdp, 8, 'blue'), 'the 8th character is the first B').toBeTruthy();
      expect(await box(cdp, 9, 'blue'), 'all typed').toBeTruthy();
    });
  });
});
