# Test Films, Phase 1: the harness, Export, Determinism Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline; the tasks share one harness and one folder) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start `tests/films/`, the purpose-built test films that become the library's real tests: one harness (`withFilm`), and the first two groups of guarantees (3 Export, 1 Determinism), seeded by moving the `examples/_checks` pages that already carry such tests.

**Architecture:** A film is an HTML page in `tests/films/` (a small composition, deterministic, no randomness without a seed) plus a `.test.ts` beside it that states the answers. `tests/films/support/withFilm.ts` opens a film in the shared Chrome (`tests/support/browser.ts`), waits for `window.__ready`, and hands the test `eval`, `render` (the real file as a Buffer) and `pictureFrames` (packet counts and key packets read with mediabunny in Node). Every test that used to repeat 15 lines of server / temp folder / tab / navigate / wait / cleanup now calls `withFilm`.

**Tech Stack:** vitest (node environment), the shared browser helper, mediabunny (already a dependency), `ai/tools/check.mjs` (`serve`, `findChrome`).

**Spec:** `docs/superpowers/specs/2026-10-15-test-films-design.md` (groups 1 and 3); the site design `2026-10-15-site-restructure-design.md` needs this phase done before `examples/` is deleted.

## Global Constraints

- No new dependency. Tests run in a real browser through `launchPage` (a tab of one shared Chrome per worker); they are skipped where `SKIP_BROWSER_TESTS` is set or there is no Chrome or no `dist/`.
- Answers are computed (a frame count, a measured length, a hash of pixels compared between paths), never a stored picture.
- A film page imports the library as `../../dist/index.js` (`tests/films/` is two folders deep, like `examples/_checks/`), and sets `window.movie`, `window.__logs` (every warn and error) and `window.__ready = true`.
- Moving a page or a test is `git mv` plus the smallest edit; its assertions are kept (they may only get stricter). A moved test that cannot be kept is stopped and reported, not deleted.
- `src/` is not changed in this phase. If a film shows a real defect, stop that task, record it in the ledger and tell the owner.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Nothing is pushed or released.

## Review Focus

Failure modes the spec implies that no task's old tests exercised (each has a test in the task that owns it):

1. A non-integer length (`duration` 1.5 s at 24 fps; 29.97 fps): the frame count is `round(duration × fps)`, not off by one (Task 3).
2. A range that ends at the very end of the movie, and a movie of one frame (Task 3).
3. The picture and the sound end together: the sound may be longer than the picture by at most one audio frame (Task 3).
4. A key packet at 0 and none missing for more than the keyframe interval (Task 3).
5. The same frame reached by four paths (forward, backward, jumps, twice) is one picture, and the export agrees with the snapshot to a measured tolerance (Task 4).

---

### Task 1: The harness `withFilm`

**Files:**
- Create: `tests/films/support/withFilm.ts`
- Create: `tests/films/harness.html`
- Create: `tests/films/harness.test.ts`

**Interfaces:**
- Produces: `filmsEnabled: boolean`; `runFilms` (= `describe.skipIf(!filmsEnabled)`); `withFilm<T>(name: string, fn: (film: Film) => Promise<T>, o?: { query?: string }): Promise<T>`; `interface Film { cdp; eval<T>(expression: string): Promise<T>; render(opts?: object): Promise<Buffer> }`; `pictureFrames(file: Buffer): Promise<{ frames: number; seconds: number; keyFrames: number[]; audioSeconds: number | null }>` (`keyFrames` are the picture frame numbers of the key packets).

- [ ] **Step 1: Write the failing test** `tests/films/harness.test.ts`

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runFilms, withFilm, pictureFrames } from './support/withFilm';

runFilms('withFilm: the way every test film is opened', () => {
  it('opens a film, waits for it, and gives the test eval and the real file', async () => {
    await withFilm('harness', async (film) => {
      expect(await film.eval<number>('movie.totalFrames')).toBe(30);
      expect(await film.eval<string>('JSON.stringify(window.__logs)')).toBe('[]');
      const file = await film.render();
      const r = await pictureFrames(file);
      expect(r.frames).toBe(30);
      expect(r.seconds).toBeCloseTo(1, 3);
      expect(r.keyFrames[0]).toBe(0);
      expect(r.audioSeconds).toBeNull();                       // the film has no sound
    });
  }, 120_000);
  it('a query reaches the page; a film that does not exist says where it looked', async () => {
    await withFilm('harness', async (film) => { expect(await film.eval<string>('location.search')).toBe('?x=1'); }, { query: 'x=1' });
    await expect(withFilm('no-such-film', async () => 0)).rejects.toThrow(/tests\/films\/no-such-film\.html/);
  }, 120_000);
  it('a film that never becomes ready fails with the page\'s own warnings, it does not hang', async () => {
    await expect(withFilm('harness', async () => 0, { query: 'broken=1' })).rejects.toThrow(/never became ready.*broken on purpose/s);
  }, 120_000);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/films/harness.test.ts`
Expected: FAIL (cannot find `./support/withFilm`).

- [ ] **Step 3: Write the film** `tests/films/harness.html` (a 1 s, 30 fps, 160×90 movie of one rect; `?broken=1` never sets `__ready` and logs a warning)

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8" /><title>film · harness</title></head>
<body>
  <!-- The harness's own subject (tests/films/harness.test.ts): a 1 s movie of one rect, no sound. `?broken=1` never becomes ready. -->
  <canvas id="stage" width="160" height="90"></canvas>
  <script>
    window.__logs = [];
    for (const k of ['warn', 'error']) { const o = console[k].bind(console); console[k] = (...a) => { window.__logs.push(k + ': ' + a.map(x => (x && x.message) || String(x)).join(' ')); o(...a); }; }
  </script>
  <script type="importmap">{ "imports": { "pixi.js": "https://esm.sh/pixi.js@8.22.0?bundle-deps", "mediabunny": "https://esm.sh/mediabunny@1.61.3" } }</script>
  <script type="module">
    import { Movie } from '../../dist/index.js';
    const movie = new Movie();
    window.movie = movie;
    if (new URLSearchParams(location.search).has('broken')) { window.__logs.push('error: broken on purpose'); }
    else {
      try {
        await movie.init({ canvas: document.getElementById('stage'), width: 160, height: 90, duration: 1, frameRate: 30, background: '#102040',
          composition: { sequences: [{ type: 'shape', shape: 'rect', name: 'box', width: 40, height: 40, initial: { x: 20, y: 45, fillColor: '#ffffff' }, keyframes: [{ at: 0, to: { x: 140 }, duration: 1, ease: 'none' }] }] } });
        window.__ready = true;
      } catch (e) { window.__logs.push('init: ' + e.message); }
    }
  </script>
</body>
</html>
```

- [ ] **Step 4: Write the harness** `tests/films/support/withFilm.ts`

```ts
// The way every test film is opened: the shared Chrome of tests/support/browser.ts, the repository served, the film navigated and waited for.
// A film is tests/films/<name>.html; its test is the .test.ts beside it. See docs/superpowers/specs/2026-10-15-test-films-design.md.
import { describe } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as mb from 'mediabunny';
import { launchPage } from '../../support/browser';

const root = resolve(__dirname, '../../..');
const check: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'ai/tools/check.mjs')).href);
const chrome = check.findChrome();
const built = existsSync(join(root, 'dist/index.js'));

/** Films run only where browser tests run: a Chrome, a built dist/, and not `SKIP_BROWSER_TESTS` (CI sets it). */
export const filmsEnabled = !!chrome && built && !process.env.SKIP_BROWSER_TESTS;
export const runFilms = describe.skipIf(!filmsEnabled);

export interface Film {
  cdp: any;
  /** Run an expression in the page and return its (JSON-able) value; promises are awaited. */
  eval<T = any>(expression: string): Promise<T>;
  /** `movie.render(opts)` in the page, handed back as the real file. */
  render(opts?: object): Promise<Buffer>;
}

export async function withFilm<T>(name: string, fn: (film: Film) => Promise<T>, o: { query?: string } = {}): Promise<T> {
  const file = join(root, 'tests/films', `${name}.html`);
  if (!existsSync(file)) throw new Error(`film "${name}" not found: looked for tests/films/${name}.html`);
  const { server, port } = await check.serve(root);
  const dir = mkdtempSync(join(tmpdir(), 'film-'));
  const { proc, cdp } = await launchPage(chrome, dir);
  try {
    await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
    await cdp.send('Page.navigate', { url: `http://127.0.0.1:${port}/tests/films/${name}.html${o.query ? `?${o.query}` : ''}` });
    let ready = false;
    for (let i = 0; i < 300 && !ready; i++) { ready = await cdp.eval('window.__ready === true').catch(() => false); if (!ready) await check.sleep(200); }
    if (!ready) throw new Error(`film "${name}" never became ready (60 s); the page said: ${JSON.stringify(await cdp.eval('window.__logs').catch(() => null))}`);
    const film: Film = {
      cdp,
      eval: (expression) => cdp.eval(expression),
      render: async (opts = {}) => {
        const b64: string = await cdp.eval(`(async () => { const blob = await movie.render(${JSON.stringify(opts)}); const bytes = new Uint8Array(await blob.arrayBuffer()); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); })()`);
        return Buffer.from(b64, 'base64');
      },
    };
    return await fn(film);
  } finally {
    try { proc.kill(); } catch { /* gone */ }
    server.close();
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* held a moment longer */ }
  }
}

/** What a file's picture really holds, counted from its packets: frames, the picture's own length, the frame numbers of the key packets, and the sound's length (null: no sound). */
export async function pictureFrames(file: Buffer): Promise<{ frames: number; seconds: number; keyFrames: number[]; audioSeconds: number | null }> {
  const input = new mb.Input({ source: new mb.BufferSource(new Uint8Array(file)), formats: mb.ALL_FORMATS });
  const v = (await input.getPrimaryVideoTrack())!;
  const a = await input.getPrimaryAudioTrack();
  const stamps: number[] = [], keys: number[] = [];
  for await (const p of new mb.EncodedPacketSink(v).packets(undefined, undefined, { metadataOnly: true })) { stamps.push(p.timestamp); if (p.type === 'key') keys.push(p.timestamp); }
  const fps = (await v.computePacketStats(Infinity)).averagePacketRate;
  const sorted = [...stamps].sort((x, y) => x - y);
  const frameOf = (t: number) => sorted.findIndex((s) => Math.abs(s - t) < 1e-6);
  return { frames: stamps.length, seconds: await v.computeDuration(), keyFrames: keys.map(frameOf), audioSeconds: a ? await a.computeDuration() : null, ...(fps ? {} : {}) };
}
```

- [ ] **Step 5: Run the harness test to see it pass**

Run: `npx vitest run tests/films/harness.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Mutation check** (each must turn a test red, then be restored): make `render` return the buffer of an empty movie (frames 0); remove the `existsSync` guard; make `ready` always true.

- [ ] **Step 7: Commit**

```bash
git add tests/films/support/withFilm.ts tests/films/harness.html tests/films/harness.test.ts
git commit -m "tests: tests/films, the harness every test film is opened with (withFilm, pictureFrames)"
```

### Task 2: Move the Export seeds (render-range, render-formats, sfx-export) onto the harness

**Files:**
- Move: `examples/_checks/render-range.html` → `tests/films/export-range.html`; `render-formats.html` → `export-formats.html`; `sfx-export.html` → `export-sound.html`
- Move: `tests/tools/renderRange.test.ts` → `tests/films/export-range.test.ts`; `tests/tools/renderFormats.test.ts` → `tests/films/export-formats.test.ts`; the test that reads `sfx-export.html` (find it with `grep -rl "sfx-export" tests`) → `tests/films/export-sound.test.ts`
- Modify: `scripts/test-changed.mjs` (paths that name the moved pages and tests)

**Interfaces:**
- Consumes: `runFilms`, `withFilm`, `pictureFrames` from Task 1.

- [ ] **Step 1: Move the pages and tests**

```bash
git mv examples/_checks/render-range.html tests/films/export-range.html
git mv examples/_checks/render-formats.html tests/films/export-formats.html
git mv examples/_checks/sfx-export.html tests/films/export-sound.html
git mv tests/tools/renderRange.test.ts tests/films/export-range.test.ts
git mv tests/tools/renderFormats.test.ts tests/films/export-formats.test.ts
f=$(grep -rl "sfx-export" tests | head -1); git mv "$f" tests/films/export-sound.test.ts
```

- [ ] **Step 2: Put each moved test on the harness.** In each of the three files: delete the local `withMovie` / `withPage` helper and the imports it needed (`mkdtempSync`, `launchPage`, `check.serve` …), import `{ runFilms, withFilm }` (and `pictureFrames` where the file counts frames), replace the helper's call sites by `withFilm('export-range', async (film) => { … film.eval(…) … })` (`cdp.eval` → `film.eval`), and `describe.skipIf(...)` by `runFilms`. Keep every assertion. In the three pages, change the comment that names the test file. Where a test counted frames with the local `FILE` / `pictureFrames` helper (export-range), import the shared `pictureFrames` and delete the local copy.

- [ ] **Step 3: Update `scripts/test-changed.mjs`**: every `examples/_checks/render-range.html`, `render-formats.html`, `sfx-export.html` becomes `tests/films/export-range.html`, `export-formats.html`, `export-sound.html`; every `tests/tools/renderRange.test.ts`, `renderFormats.test.ts` (and the sfx one) becomes its `tests/films/…` path. Also add the rule `{ name: 'test films', paths: ['tests/films/'], tests: ['tests/films/'] }`.

- [ ] **Step 4: Run**

Run: `npx vitest run tests/films && node scripts/test-changed.mjs -- --dry`
Expected: PASS for the harness and the three moved files (the same number of assertions as before the move); the dry run lists nothing unknown.

- [ ] **Step 5: Commit**

```bash
git add -A tests/films tests/tools examples/_checks scripts/test-changed.mjs
git commit -m "tests: the Export seeds (render-range, render-formats, sfx-export) move to tests/films onto the harness, assertions kept"
```

### Task 3: The Export film (frame counts, ends, key packets)

**Files:**
- Create: `tests/films/export-frames.html`
- Create: `tests/films/export-frames.test.ts`

**Interfaces:**
- Consumes: `withFilm`, `pictureFrames`.
- Produces: the film `export-frames`, a movie sized by the query `?duration=&fps=&sound=1` (defaults 2 s, 30 fps, no sound).

- [ ] **Step 1: Write the film** `tests/films/export-frames.html` (same skeleton as `harness.html`): reads `duration` (default 2), `fps` (default 30) and `sound` from `location.search`; the composition is one rect moving across the whole duration; with `sound=1` it also has `{ type: 'audio', name: 'tone', music: { bpm: 120, tracks: [{ inst: 'pad', notes: 'c3:8', attack: 0.01 }] } }` (a sustained sound all the way through).

- [ ] **Step 2: Write the failing tests** `tests/films/export-frames.test.ts`

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runFilms, withFilm, pictureFrames } from './support/withFilm';

const framesOf = async (query: string, opts: object = {}) => withFilm('export-frames', async (film) => pictureFrames(await film.render(opts)), { query });

runFilms('Export: a file is exactly the frames of its movie', () => {
  it('whole numbers and not: round(duration × fps) frames, whatever the length (1.5 s at 24 fps = 36; 2 s at 29.97 = 60; 0.5 s at 60 = 30)', async () => {
    for (const [duration, fps, frames] of [[1.5, 24, 36], [2, 29.97, 60], [0.5, 60, 30], [3, 30, 90]] as const) {
      const r = await framesOf(`duration=${duration}&fps=${fps}`);
      expect(r.frames, `${duration} s at ${fps} fps`).toBe(frames);
      expect(r.seconds).toBeCloseTo(frames / fps, 2);
    }
  }, 300_000);
  it('a movie of one frame is a file of one frame', async () => {
    expect((await framesOf('duration=0.0333&fps=30')).frames).toBe(1);
  }, 120_000);
  it('a range is [from, to): 1 to 2.5 s is 45 frames; a range that ends at the very end keeps the last frame and no more; one that starts at 0 and ends at the end is the whole movie', async () => {
    expect((await framesOf('duration=4', { range: [1, 2.5] })).frames).toBe(45);
    expect((await framesOf('duration=4', { range: [3, 4] })).frames).toBe(30);
    expect((await framesOf('duration=4', { range: [0, 4] })).frames).toBe(120);
  }, 300_000);
  it('the sound ends with the picture: no more than one audio frame (about 21 ms) longer, never shorter by more than that', async () => {
    const r = await framesOf('duration=3&sound=1');
    expect(r.audioSeconds).not.toBeNull();
    expect(Math.abs(r.audioSeconds! - r.seconds)).toBeLessThan(0.05);
  }, 120_000);
  it('a key packet at the first frame, and never more than the keyframe interval (2 s = 60 frames) without one', async () => {
    const r = await framesOf('duration=5');
    expect(r.keyFrames[0]).toBe(0);
    const gaps = r.keyFrames.slice(1).map((k, i) => k - r.keyFrames[i]!);
    expect(Math.max(...gaps, r.frames - r.keyFrames[r.keyFrames.length - 1]!)).toBeLessThanOrEqual(61);
  }, 120_000);
  it('every format and codec writes the same number of frames: mp4 and mov (avc), webm (vp9)', async () => {
    for (const [format, codec] of [['mp4', 'avc'], ['mov', 'avc'], ['webm', 'vp9']] as const) {
      const r = await framesOf('duration=2', { format, video: { codec } });
      expect(r.frames, `${format} ${codec}`).toBe(60);
    }
  }, 300_000);
});
```

- [ ] **Step 3: Run to see which pass and which fail**

Run: `npx vitest run tests/films/export-frames.test.ts`
Expected: the tests are written against the 0.39.0 behaviour, so they should PASS; any FAIL is a real finding. For a FAIL: do not change `src/`; record the measured number in the ledger and tell the owner. (Tolerances in the sound and key-packet tests are the measured values: adjust them only to what the first run shows, and say so in the commit message.)

- [ ] **Step 4: Mutation check:** in a scratch copy of `src/core/Renderer.ts` loop (`frame < range.toFrame` → `<=`), rebuild, and confirm the 1-frame, range and whole-number tests turn red; restore and rebuild.

- [ ] **Step 5: Commit**

```bash
git add tests/films/export-frames.html tests/films/export-frames.test.ts
git commit -m "tests: the Export film: exact frame counts for whole and fractional lengths, a one-frame movie, ranges, sound and picture ending together, key packets, three formats"
```

### Task 4: The Determinism film (four paths, and the export)

**Files:**
- Create: `tests/films/determinism.html`
- Create: `tests/films/determinism.test.ts`

**Interfaces:**
- Consumes: `withFilm`.
- Produces: in the page, `window.hashOf(frame): Promise<string>` (a 32-bit FNV-1a hash of `movie.snapshot(frame, { as: 'imageData' })`) and `window.psnrAgainstFile(base64, frame): Promise<number>` (decodes the file's picture at that frame with mediabunny's `CanvasSink` and returns the PSNR in dB against the snapshot of the same frame).

- [ ] **Step 1: Write the film** `tests/films/determinism.html`: a 3 s, 30 fps, 320×180 movie with one layer of each kind that must be deterministic: a rect with an eased keyframe; a text with `visibleChars` typing; a `canvas` layer drawing from `info.time` and `info.random`; a `grain` filter on the root (`filters: [{ type: 'grain', seed: 7, amount: 0.05 }]`); particles from the `particles` preset (seeded). Add the two helpers above to the page (`import * as mb from 'mediabunny'` through the page's import map).

- [ ] **Step 2: Write the failing tests** `tests/films/determinism.test.ts`

```ts
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { runFilms, withFilm } from './support/withFilm';

const FRAMES = [0, 1, 17, 29, 30, 59, 60, 89];       // the seams of a 30 fps, 3 s movie and some frames in between

runFilms('Determinism: a frame is a function of the script and the time, whichever way it is reached', () => {
  it('forward, backward, by jumps and twice in a row: one picture per frame', async () => {
    await withFilm('determinism', async (film) => {
      const hashes = async (order: number[]) => { const out: Record<number, string> = {}; for (const f of order) out[f] = await film.eval(`hashOf(${f})`); return out; };
      const forward = await hashes(FRAMES);
      const backward = await hashes([...FRAMES].reverse());
      const jumps = await hashes([60, 0, 89, 17, 1, 59, 29, 30]);
      const twice = await hashes(FRAMES.flatMap((f) => [f, f]));
      expect(backward).toEqual(forward);
      expect(jumps).toEqual(forward);
      expect(twice).toEqual(forward);
      expect(new Set(Object.values(forward)).size, 'the film really changes from frame to frame').toBeGreaterThan(6);
    });
  }, 300_000);
  it('a second load of the film gives the same pictures (nothing comes from the clock)', async () => {
    const first = await withFilm('determinism', async (film) => Promise.all(FRAMES.map((f) => film.eval<string>(`hashOf(${f})`))));
    const second = await withFilm('determinism', async (film) => Promise.all(FRAMES.map((f) => film.eval<string>(`hashOf(${f})`))));
    expect(second).toEqual(first);
  }, 300_000);
  it('the export agrees with the snapshot of the same frame (PSNR in dB, the picture is lossy)', async () => {
    await withFilm('determinism', async (film) => {
      const file = await film.render({ video: { bitrate: 'very-high' } });
      const psnr: number[] = [];
      for (const f of [0, 17, 59, 89]) psnr.push(await film.eval<number>(`psnrAgainstFile(${JSON.stringify(file.toString('base64'))}, ${f})`));
      for (const p of psnr) expect(p, `PSNR ${psnr.map((x) => x.toFixed(1)).join(', ')}`).toBeGreaterThan(30);
    });
  }, 300_000);
});
```

- [ ] **Step 3: Run; write the missing page helpers until the tests run; record the measured PSNR numbers** in the ledger and set the bound to a value below the lowest measured with a margin of 3 dB.

Run: `npx vitest run tests/films/determinism.test.ts`
Expected: PASS once the helpers exist. A FAIL in the first test (paths disagree) is a real defect: stop, record which layer type differs (remove layers one at a time to find it) and tell the owner.

- [ ] **Step 4: Mutation check:** make the canvas layer read `Date.now()` in `draw` (the page then logs a warning and the paths disagree); confirm the first two tests turn red. Restore.

- [ ] **Step 5: Commit**

```bash
git add tests/films/determinism.html tests/films/determinism.test.ts
git commit -m "tests: the Determinism film: one picture per frame by four paths and by two loads, the export against the snapshot with a measured tolerance"
```

### Task 5: Move the Determinism seeds (seeded, first-frame, card-seek, poster)

**Files:**
- Move: `examples/_checks/{seeded,first-frame,card-seek,poster}.html` → `tests/films/determinism-{seeded,first-frame,card-seek,poster}.html`
- Move: `tests/tools/{seeded,firstFrame,cardSeek,poster}.test.ts` → `tests/films/determinism-{seeded,first-frame,card-seek,poster}.test.ts`
- Modify: `scripts/test-changed.mjs`

- [ ] **Step 1: `git mv` the four pages and four tests** (names as above).
- [ ] **Step 2: Put each moved test on `withFilm`** exactly as in Task 2 Step 2 (the `seeded` test passes `?seed=N` as `query`; `poster` passes `noposter` as a query for its second test). Keep every assertion.
- [ ] **Step 3: Update `scripts/test-changed.mjs`** for the moved paths.
- [ ] **Step 4: Run** `npx vitest run tests/films` — Expected: all films PASS.
- [ ] **Step 5: Commit** `git commit -am "tests: the Determinism seeds (seeded, first-frame, card-seek, poster) move to tests/films onto the harness"`

### Task 6: The coverage list and the way to run the films

**Files:**
- Create: `tests/films/COVERAGE.md`
- Modify: `package.json` (script `test:films`), `AGENTS.md` (one line), `docs/superpowers/specs/2026-10-15-test-films-design.md` (status line)

- [ ] **Step 1: Write `tests/films/COVERAGE.md`**: the 15 groups of the design as a table (group, guarantees, films that carry it now, still to do). Groups 1 and 3 list their films and tests; the others list their seed pages that are still in `examples/_checks` and what is missing (copy the "Seed" and "Gap" columns of the design).
- [ ] **Step 2: Add `"test:films": "vitest run tests/films"` to `package.json` scripts.**
- [ ] **Step 3: One line in `AGENTS.md`, section "If you are changing the library itself":** "The real tests are the test films in `tests/films/` (`npm run test:films`; the list of what each group guarantees is `tests/films/COVERAGE.md`); the gallery's tests are the secondary net."
- [ ] **Step 4: Run the whole suite** `npx vitest run` — Expected: all green; the number of test files is the same as before plus the new films.
- [ ] **Step 5: Commit** `git add -A tests/films package.json AGENTS.md docs && git commit -m "tests: tests/films/COVERAGE.md (the 15 groups and what carries each), npm run test:films"`
