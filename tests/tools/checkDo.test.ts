// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

describe('check --do: the steps are read', () => {
  it('click, hover, drag, wait and key, separated by ; or by new lines, a point as x,y or as a layer name', () => {
    expect(check.parseDo('click 640,360; hover Lime; wait 0.5\nkey Space')).toEqual([
      { verb: 'click', points: [{ x: 640, y: 360 }] },
      { verb: 'hover', points: [{ name: 'Lime' }] },
      { verb: 'wait', seconds: 0.5 },
      { verb: 'key', key: 'Space' },
    ]);
  });
  it('a drag has two points or more, spaces or > between them (a layer name may have spaces after >)', () => {
    expect(check.parseDo('drag 100,100 400,300 500,320')[0]).toEqual({ verb: 'drag', points: [{ x: 100, y: 100 }, { x: 400, y: 300 }, { x: 500, y: 320 }] });
    expect(check.parseDo('drag my card > 770,240')[0]).toEqual({ verb: 'drag', points: [{ name: 'my card' }, { x: 770, y: 240 }] });
  });
  it('a mistake says what is expected: an unknown verb, a click with no point, a drag with one, a wait with no number', () => {
    expect(() => check.parseDo('tap 1,2')).toThrow(/tap.*click, hover, drag, wait, key/s);
    expect(() => check.parseDo('click')).toThrow(/click needs a point/);
    expect(() => check.parseDo('drag 1,2')).toThrow(/drag needs two points/);
    expect(() => check.parseDo('wait soon')).toThrow(/wait needs a number of seconds/);
  });
  it('--do asks for nothing else and may be given twice', () => {
    const o = check.parseArgs(['page.html', '--do', 'click 1,2', '--do', 'wait 1; hover 3,4']);
    expect(o.do.map((s: any) => s.verb)).toEqual(['click', 'wait', 'hover']);
  });
});

async function run(query: string, steps: string): Promise<{ code: number; stdout: string; report: any; dir: string }> {
  const out = mkdtempSync(join(tmpdir(), 'check-do-'));
  let stdout = '';
  const code = await promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/check-do.html'), '--no-export', '--out', out, '--timeout', '90', ...(query ? ['--query', query] : []), '--do', steps], { timeout: 120_000 })
    .then((r) => { stdout = r.stdout; return 0; }, (e: any) => { stdout = e.stdout ?? ''; return e.code as number; });
  return { code, stdout, report: JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')), dir: out };
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('check --do: clicks, hovers and drags on a real page', () => {
  it('a click on a layer name runs the page\'s handler: the report says what was under the pointer, what the variables did, and keeps a picture of each step', async () => {
    const r = await run('', 'click button; click 600,330');
    expect(r.code).toBe(0);
    const [first, second] = r.report.steps;
    expect(first).toMatchObject({ verb: 'click', hits: ['button'] });
    expect(first.vars).toMatchObject({ clicks: [0, 1], hint: ['ready', 'clicked'] });
    expect(second.hits, 'a click on empty ground').toEqual([]);
    expect(second.vars, 'and nothing changed').toEqual({});
    expect(r.stdout).toMatch(/do +1 click button \(160, 100\) — over button · clicks 0→1/);
    expect(r.stdout).toMatch(/2 click 600,330 — over nothing · no variable changed/);
    expect(readdirSync(join(r.dir, 'steps')).sort()).toEqual(['01-click.png', '02-click.png']);
  }, 150_000);

  it('hover raises what the page raises on hover, and a drag moves what the page lets move: the variables show it', async () => {
    const r = await run('', 'hover hot; drag card > 400,200; hover 20,20');
    expect(r.code).toBe(0);
    const [hover, drag, away] = r.report.steps;
    expect(hover.vars).toMatchObject({ hot: [0, 1] });
    expect(drag.vars.cx[1]).toBe(400);
    expect(drag.vars.cy[1]).toBe(200);
    expect(drag.vars.hot, 'the pointer left the red box on its way to the card').toEqual([1, 0]);
    expect(away.vars, 'nothing left to change').toEqual({});
  }, 150_000);

  it("a warning the page makes during a step is a problem that names the step; a point outside the picture or a layer that is not there is a problem too", async () => {
    const warned = await run('warn=1', 'click button');
    expect(warned.code).toBe(1);
    expect(warned.report.problems.join('\n')).toMatch(/step 1 \(click button \(160, 100\)\): 1 console warning/);
    const bad = await run('', 'click 9000,9000; click nosuch');
    expect(bad.code).toBe(1);
    const said = bad.report.problems.join('\n');
    expect(said).toMatch(/click 9000,9000.*outside the picture/);
    expect(said).toMatch(/click nosuch.*no layer named "nosuch"/);
  }, 200_000);
});
