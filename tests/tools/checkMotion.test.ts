// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

/** One sample every 0.5 s of a 10 s movie: `diff` is how much the picture changed since the sample before, `spread` how much is on screen (0 = one plain colour). */
const samples = (f: (t: number) => { diff: number; spread: number; mean?: number[] }) => Array.from({ length: 21 }, (_, i) => { const t = i * 0.5; const s = f(t); return { t, diff: i === 0 ? null : s.diff, spread: s.spread, mean: s.mean ?? [0.05, 0.07, 0.1] }; });
const verdict = (s: ReturnType<typeof samples>, extra: object = {}) => check.motionVerdict(s, { duration: 10, ...extra });

describe('motionVerdict: how the picture moves and how it ends, in numbers', () => {
  it('a movie that moves all the way and has something on screen at both ends has nothing to review and says how much it moves', () => {
    const v = verdict(samples(() => ({ diff: 0.02, spread: 0.2 })));
    expect(v.review).toEqual([]);
    expect(v.movingShare).toBeCloseTo(1, 2);
    expect(v.lastMotionAt).toBe(10);
    expect(check.motionLine(v, 10)).toMatch(/moves in 100 %.*last movement ends at 10 s of 10 s/);
  });

  it('a picture that stops moving at 2 s and stays: names the stretch and its length', () => {
    const v = verdict(samples((t) => ({ diff: t <= 2 ? 0.03 : 0, spread: 0.2 })));
    expect(v.longestStill).toMatchObject({ from: 2, to: 10, seconds: 8 });
    expect(v.review.join('\n')).toMatch(/does not move from 2 s to 10 s \(8 s of 10 s\)/);
    expect(v.lastMotionAt).toBe(2);
  });

  it('a still stretch under 3 seconds (or a third of a short movie) is a beat, not a finding', () => {
    const v = verdict(samples((t) => ({ diff: t > 4 && t <= 6 ? 0 : 0.03, spread: 0.2 })));
    expect(v.longestStill!.seconds).toBe(2);
    expect(v.review).toEqual([]);
  });

  it('a last frame that is one plain colour is named with the colour and since when (a fade to black may be on purpose: it is for review, not a failure)', () => {
    const v = verdict(samples((t) => ({ diff: t <= 7 ? 0.03 : 0, spread: t <= 7 ? 0.2 : 0, mean: t <= 7 ? [0.5, 0.4, 0.3] : [0.04, 0.05, 0.09] })));
    expect(v.last.plain).toBe(true);
    expect(v.last.plainFrom).toBe(7.5);
    const said = v.review.join('\n');
    expect(said).toMatch(/last frame is one plain colour \(#0a0d17\)/);
    expect(said).toMatch(/nothing on screen from 7\.5 s/);
    expect(said, 'the empty tail is not reported twice as a still stretch').not.toMatch(/does not move/);
  });

  it('nothing on screen for the first second or more is named', () => {
    const v = verdict(samples((t) => ({ diff: 0.03, spread: t < 1.5 ? 0 : 0.2 })));
    expect(v.first.visibleFrom).toBe(1.5);
    expect(v.review.join('\n')).toMatch(/nothing is on screen until 1\.5 s/);
    const short = verdict(samples((t) => ({ diff: 0.03, spread: t < 0.5 ? 0 : 0.2 })));
    expect(short.review, 'a half-second fade-in is ordinary').toEqual([]);
  });

  it('a presentation (stops) is meant to stand still: no review, and the line says so', () => {
    const v = verdict(samples(() => ({ diff: 0, spread: 0.2 })), { hasStops: true });
    expect(v.review).toEqual([]);
    expect(check.motionLine(v, 10)).toMatch(/presentation/);
  });
});

async function run(query: string): Promise<{ stdout: string; report: any }> {
  const out = mkdtempSync(join(tmpdir(), 'check-motion-'));
  let stdout = '';
  await promisify(execFile)('node', [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/check-motion.html'), '--no-export', '--out', out, '--query', query, '--timeout', '90'], { timeout: 120_000 })
    .then((r) => { stdout = r.stdout; }, (e: any) => { stdout = e.stdout ?? ''; });
  return { stdout, report: JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) };
}

describe.skipIf(!chrome || !built || process.env.SKIP_BROWSER_TESTS)('check measures the motion of a real page', () => {
  it('a lively movie: a motion line, nothing to review, and the check still passes', async () => {
    const r = await run('case=lively');
    expect(r.stdout).toMatch(/motion +moves in \d+ %/);
    expect(r.report.motion.review).toEqual([]);
    expect(r.report.ok).toBe(true);
  }, 150_000);

  it('a movie that moves for 2 s and then holds for 8: the stretch is named in the report and in what check prints', async () => {
    const r = await run('case=still');
    expect(r.report.motion.longestStill.seconds).toBeGreaterThanOrEqual(7);
    expect(r.stdout).toMatch(/does not move from [\d.]+ s to 10 s/);
    expect(r.report.ok, 'a review item, not a problem').toBe(true);
  }, 150_000);

  it('a movie that fades to nothing at the end, and one that shows nothing at the start', async () => {
    const end = await run('case=blankend');
    expect(end.stdout).toMatch(/last frame is one plain colour \(#[0-9a-f]{6}\)/);
    const start = await run('case=blankstart');
    expect(start.stdout).toMatch(/nothing is on screen until [\d.]+ s/);
  }, 250_000);
});
