import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');

// A text that fades in (a keyframe on alpha) with an x written in `initial` is a STILL layer: a cut-off one is reported. Found by a trial in which
// `check` said "no cut-off" for a 2000 px title on a 1280 canvas, because any layer with an x in `initial` and any keyframe counted as "moving".
describe('check: a faded-in text that is cut off by the edge is reported (real browser)', () => {
  it('the title, and a label of a null rig that only fades, are listed; a ticker whose x is animated is not', async () => {
    const out = mkdtempSync(join(tmpdir(), 'check-cutoff-'));
    const { stdout } = await promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'examples/_checks/layout-cutoff.html'), '--no-export', '--out', out, '--timeout', '150'], { timeout: 170_000 })
      .catch((e: any) => ({ stdout: String(e.stdout) }));          // a layout issue fails the check: the printout is what is read
    expect(stdout).toMatch(/text layer "title" is cut off by the canvas edge: \d+px beyond the right edge/);
    expect(stdout).toMatch(/text layer "label" is cut off/);
    expect(stdout).not.toMatch(/"ticker"/);
    const issues: string[] = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')).inspect.issues.map((i: any) => i.message);
    expect(issues.some(i => i.includes('"title"'))).toBe(true);
    expect(issues.some(i => i.includes('"ticker"'))).toBe(false);
  }, 200_000);
});
