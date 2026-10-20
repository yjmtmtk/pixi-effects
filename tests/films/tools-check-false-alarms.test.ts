// @vitest-environment node
// Group 13 (The tools tell the truth), "one film per false alarm and per missed fault found so far": three things `check` was fixed to leave
// alone or to catch, run through the real tool (node ai/tools/check.mjs <film> --no-export --query … --out DIR, then report.json).
// What each run must say was written here from the documents BEFORE the film was run:
//  1. A cut-off title that rises and fades in (a missed fault, fixed in 0.33):
//     - CHANGELOG.md 0.33.0, first item: "inspect (and so check) never reported cut-off or off-canvas text on a layer that had an x or y in `initial`
//       AND any keyframe (a title with a fade-in) … A layer is now "moving" only while a geometry keyframe is running … A fade (alpha) and a `set`
//       are no motion. A title that rises and fades in is exempt while it rises and is reported once it has settled."
//     - skills/pixi-effects/reference/pitfalls.md 30b: "a fade, a `set` and an x written only in `initial` are no motion, so a cut-off title is reported once it has settled."
//     - docs/api.md, InspectReport.issues: "text off the canvas / cut by an edge …"; SKILL.md step 4: issues name "text off the canvas, cut off by an edge".
//     - WHEN it is first seen: src/core/review.ts, comment of sampleFrames: check looks at "the first and last frame, every scene's first and last frame …,
//       and one every `step` seconds" (step = 0.25 in its signature), and IssueGroup says "with how many frames it was seen in" (firstFrame / lastFrame).
//       A rise of 0.4 s ends at frame 12; the samples are 0, 8 (0.25 s), 15 (0.5 s): the first settled one is frame 15. A rise of 0.9 s ends at frame 27: frame 30.
//  2. A text off the canvas (a missed fault next to a false alarm, 0.33):
//     - CHANGELOG.md 0.33.0: "A text that waits outside the canvas for its entrance … is not called "entirely outside" (it has an x / y / z tween; a layer put
//       off the canvas by a typo whose only motion is a scale pop is still reported)". The "entry" text waits off the canvas in EVERY run: never named.
//     - the badge's scale pop starts at 0.5 s of its life, so at its first frame it is still: reported from that frame (0, or 30 for a badge at 1 s;
//       tests/films/time-lifespan-edges: a layer at 1 s is drawn from frame 30).
//  3. A fade the layer's end cuts off (a missed fault, 0.33), with a drift and a decaying glow that must be left alone (the false alarms it was built to avoid):
//     - CHANGELOG.md 0.33.0, second item: "A fade that the layer's end cuts off is warned about at build. `layer "scene1": keyframes[1] runs from 4.2s to 5s but
//       the layer ends at 4.5s, so the last 63% of it never plays (a fade stops half way)`. Only a fade (to alpha ≤ 0.1 or ≥ 0.9 …), with a cut of more than 25%
//       and at least 0.2 s; a set, a repeating tween, a spring, a decaying flash (to 0.22) and drifts or zooms that are still going at the end are left alone."
//     - the card lives 1.5 s; its keyframes[1] fades to alpha 0 for 1 s from `cutAt`: 0.5 → ends with the layer (nothing); 1 → 1s to 2s, 50% cut (said);
//       0.8 → 0.8s to 1.8s, 30% (said); 0.6 → 10%, under 25% (nothing).
//     - a warning reaches check through window.__logs (ai/tools/check.mjs header: "checks: console warnings / errors") and is a problem
//       ("N console warning(s) / error(s) — each says what to change").
//  The default (no query) has none of the three: no problem, no warning, no layout issue, nothing for review (exit 0, report.ok).
import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { runFilms } from './support/withFilm';

const root = resolve(__dirname, '../..');

interface Group { message: string; count: number; firstFrame: number; lastFrame: number }
interface Run { code: number; report: { ok: boolean; problems: string[]; logs: string[]; inspect: { issues: Group[]; review: Group[] } } }

async function check(query?: string): Promise<Run> {
  const out = mkdtempSync(join(tmpdir(), 'check-fa-'));
  try {
    const args = [join(root, 'ai/tools/check.mjs'), join(root, 'tests/films/tools-check-false-alarms.html'), '--no-export', '--frames', '4', '--out', out, '--timeout', '90'];
    if (query) args.push('--query', query);
    const code = await promisify(execFile)('node', args, { timeout: 120_000 }).then(() => 0, (e: any) => e.code as number);
    return { code, report: JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) };
  } finally { rmSync(out, { recursive: true, force: true }); }
}

const naming = (groups: Group[], layer: string) => groups.filter((g) => g.message.includes(`"${layer}"`));
const firstSeen = (groups: Group[]) => Math.min(...groups.map((g) => g.firstFrame));

/** The run named no layout issue, nothing for review, no warning: the documented false alarms stay quiet. */
function quiet(r: Run): void {
  expect(r.report.logs, 'no warning').toEqual([]);
  expect(r.report.inspect.issues.map((g) => g.message), 'no layout issue').toEqual([]);
  expect(r.report.inspect.review.map((g) => g.message), 'nothing for review').toEqual([]);
  expect(r.report.problems).toEqual([]);
  expect(r.report.ok).toBe(true);
  expect(r.code).toBe(0);
}

/** A layout fault: named in exactly the layer it is about, first seen at `frame`; the waiting entrance is never named. */
function layoutFault(r: Run, layer: string, words: RegExp, frame: number): void {
  expect(r.report.logs, 'a layout fault is not a warning').toEqual([]);
  const mine = naming(r.report.inspect.issues, layer);
  expect(mine.length, JSON.stringify(r.report.inspect.issues)).toBeGreaterThan(0);
  for (const g of mine) expect(g.message).toMatch(words);
  expect(firstSeen(mine), 'the moment it is first seen').toBe(frame);
  expect(r.report.inspect.issues.filter((g) => !g.message.includes(`"${layer}"`)).map((g) => g.message), 'only that layer is named').toEqual([]);
  expect(r.report.problems.some((p) => /layout issue from movie\.inspect/.test(p)), r.report.problems.join('\n')).toBe(true);
  expect(r.report.ok).toBe(false);
  expect(r.code).toBe(1);
}

/** A fade cut by its layer's end: one warning, the documented sentence with the layer, the keyframe and the moments. */
function fadeCut(r: Run, sentence: string): void {
  expect(r.report.logs.length, r.report.logs.join('\n')).toBe(1);
  expect(r.report.logs[0]).toContain(sentence);
  expect(r.report.logs.filter((l) => l.includes('"glow"')), 'the zoom and the decaying glow still going at the end are left alone').toEqual([]);
  expect(r.report.inspect.issues.map((g) => g.message)).toEqual([]);
  expect(r.report.problems).toEqual(['1 console warning(s) / error(s) — each says what to change']);
  expect(r.code).toBe(1);
}

runFilms('The tools tell the truth: check leaves alone what is fine and names the three faults it was fixed to catch', () => {
  it('the default (a title that rises and fades in and fits, a text waiting off the canvas for its entrance, a fade that ends with its layer, a zoom and a decaying glow still going at the end): no problem, no warning, nothing for review', async () => {
    quiet(await check());
  }, 150_000);

  it('?fault=cutoff: a title too wide for the canvas that rises and fades in is reported as cut off by an edge, from the first look after it has settled (frame 15)', async () => {
    layoutFault(await check('fault=cutoff'), 'title', /cut off.*edge/, 15);
  }, 150_000);

  it('?fault=cutoff&rise=0.9: a longer rise is exempt longer: first reported at frame 30', async () => {
    layoutFault(await check('fault=cutoff&rise=0.9'), 'title', /cut off.*edge/, 30);
  }, 150_000);

  it('?fault=offcanvas: a badge put off the canvas by a typo, whose only motion is a scale pop, is reported as outside the canvas from its first frame; the text waiting for its entrance is not', async () => {
    layoutFault(await check('fault=offcanvas'), 'badge', /outside/, 0);
  }, 150_000);

  it('?fault=offcanvas&badgeAt=1: the same badge starting at 1 s is reported from frame 30', async () => {
    layoutFault(await check('fault=offcanvas&badgeAt=1'), 'badge', /outside/, 30);
  }, 150_000);

  it('?fault=fadecut: a fade-out the layer\'s end cuts in half is one warning in the documented sentence', async () => {
    fadeCut(await check('fault=fadecut'), 'layer "card": keyframes[1] runs from 1s to 2s but the layer ends at 1.5s, so the last 50% of it never plays (a fade stops half way)');
  }, 150_000);

  it('?fault=fadecut&cutAt=0.8: the sentence follows the keyframe (30% cut, over the 25% line)', async () => {
    fadeCut(await check('fault=fadecut&cutAt=0.8'), 'layer "card": keyframes[1] runs from 0.8s to 1.8s but the layer ends at 1.5s, so the last 30% of it never plays (a fade stops half way)');
  }, 150_000);

  it('?fault=fadecut&cutAt=0.6: a cut of 10% (under the 25% line) is left alone', async () => {
    quiet(await check('fault=fadecut&cutAt=0.6'));
  }, 150_000);
});
