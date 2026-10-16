// @vitest-environment node
// `check --seam`: does a movie made to loop close without a jump? The last frame to the first is compared with the steps between ordinary neighbouring frames of the
// same movie (no picture is stored: the movie is its own measure), so a loop that closes reads as "an ordinary step" and one that jumps reads as many times larger.
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

describe('seamVerdict: the number and the sentence', () => {
  it('a seam no larger than the largest ordinary step (to a margin) closes; a larger one jumps, and says how many times larger', () => {
    const ok = check.seamVerdict({ seam: 0.0089, steps: [0.0102, 0.0097, 0.0140, 0.0081] });
    expect(ok.ok).toBe(true);
    expect(ok.line).toMatch(/seam\s+the loop closes.*0\.0089.*0\.0140/);
    const jump = check.seamVerdict({ seam: 0.113, steps: [0.0102, 0.0097, 0.0140, 0.0081] });
    expect(jump.ok).toBe(false);
    expect(jump.line).toMatch(/seam\s+JUMP.*0\.113.*8\.1×/);
    expect(jump.ratio).toBeCloseTo(8.07, 1);
  });
  it('the margin is 1.5×; a still movie (every step 0) closes; a seam above noise with still neighbours jumps', () => {
    expect(check.seamVerdict({ seam: 0.0200, steps: [0.0140] }).ok).toBe(true);        // 1.43×
    expect(check.seamVerdict({ seam: 0.0215, steps: [0.0140] }).ok).toBe(false);       // 1.54×
    expect(check.seamVerdict({ seam: 0, steps: [0, 0, 0] }).ok).toBe(true);
    expect(check.seamVerdict({ seam: 0.05, steps: [0, 0, 0] }).ok).toBe(false);
    expect(check.seamVerdict({ seam: 0.0004, steps: [0, 0, 0] }).ok).toBe(true);       // under the noise floor
  });
  it('the median and the largest ordinary step are both reported', () => {
    const v = check.seamVerdict({ seam: 0.01, steps: [0.01, 0.02, 0.03] });
    expect(v.median).toBeCloseTo(0.02, 6);
    expect(v.max).toBeCloseTo(0.03, 6);
  });
});

describe('parseArgs: --seam', () => {
  it('is a switch', () => {
    expect(check.parseArgs(['page.html', '--seam']).seam).toBe(true);
    expect(check.parseArgs(['page.html']).seam).toBe(false);
  });
});

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('check --seam, on a real movie', () => {
  const run = async (page: string) => {
    const out = mkdtempSync(join(tmpdir(), 'check-seam-'));
    try {
      const r = await promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, `tests/films/${page}.html`), '--seam', '--no-export', '--frames', '2', '--out', out, '--timeout', '150'], { timeout: 170_000 })
        .then((x) => ({ code: 0, stdout: x.stdout }), (e: any) => ({ code: e.code, stdout: String(e.stdout) }));
      const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8'));
      return { ...r, report };
    } finally { rmSync(out, { recursive: true, force: true }); }
  };
  it('a movie that goes out and comes back closes: one line, no problem, exit 0', async () => {
    const r = await run('seam-loop');
    expect(r.report.seam.ok, JSON.stringify(r.report.seam)).toBe(true);
    expect(r.stdout).toMatch(/seam\s+the loop closes/);
    expect(r.report.problems.filter((p: string) => /seam|loop/i.test(p))).toEqual([]);
    expect(r.code).toBe(0);
  }, 200_000);
  it('a movie that moves one way jumps at its seam: the line says so with the numbers, it is a problem, exit 1', async () => {
    const r = await run('seam-jump');
    expect(r.report.seam.ok).toBe(false);
    expect(r.report.seam.ratio).toBeGreaterThan(3);
    expect(r.stdout).toMatch(/seam\s+JUMP/);
    expect(r.report.problems.join('\n')).toMatch(/jumps at its seam/);
    expect(r.code).toBe(1);
  }, 200_000);
  it('without --seam the report has no seam and nothing is measured', async () => {
    const out = mkdtempSync(join(tmpdir(), 'check-seam-'));
    try {
      await promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/seam-jump.html'), '--no-export', '--frames', '2', '--out', out, '--timeout', '150'], { timeout: 170_000 }).catch(() => null);
      expect(JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')).seam).toBeUndefined();
    } finally { rmSync(out, { recursive: true, force: true }); }
  }, 200_000);
});
