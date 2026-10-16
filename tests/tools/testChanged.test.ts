// @vitest-environment node
// `npm run test:changed` picks the browser tests for what changed (the fast unit tests always run). A file it does not know means everything runs.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(__dirname, '../..');
const { testsFor, AREAS }: any = await import(/* @vite-ignore */ pathToFileURL(join(root, 'scripts/test-changed.mjs')).href);

describe('testsFor: which browser tests a change needs', () => {
  it('a spring change needs the spring test and nothing slow besides', () => {
    const r = testsFor(['src/core/spring.ts']);
    expect(r.full).toBe(false);
    expect(r.files).toContain('tests/tools/springSeek.test.ts');
    expect(r.files).not.toContain('tests/tools/noFalseWarnings.test.ts');
  });
  it('a change to the key lint needs the corpus test (the test films); a gallery piece needs only the gallery test, never the corpus', () => {
    expect(testsFor(['src/core/lint.ts']).files).toContain('tests/tools/noFalseWarnings.test.ts');
    const piece = testsFor(['examples/gallery/aurora-logo.html']).files;
    expect(piece).toEqual(['tests/site/galleryBrowser.test.ts']);
  });
  it('a change to documents needs no browser test at all', () => {
    const r = testsFor(['docs/dsl.md', 'skills/pixi-effects/reference/cheatsheet.md', 'CHANGELOG.md', 'llms-full.txt']);
    expect(r).toEqual({ full: false, files: [] });
  });
  it('the changes of several files add up, without a test twice', () => {
    const r = testsFor(['src/core/spring.ts', 'src/filters/Grain.ts', 'src/core/spring.ts']);
    expect(r.files).toEqual(expect.arrayContaining(['tests/tools/springSeek.test.ts', 'tests/tools/grain.test.ts']));
    expect(new Set(r.files).size).toBe(r.files.length);
  });
  it('a file it does not know (or the build and the test tools themselves) means everything', () => {
    expect(testsFor(['src/somethingNew/Thing.ts']).full).toBe(true);
    expect(testsFor(['package.json']).full).toBe(true);
    expect(testsFor(['ai/tools/check.mjs']).full).toBe(true);
    expect(testsFor(['tests/support/browser.ts']).full).toBe(true);
    expect(testsFor(['docs/dsl.md', 'src/somethingNew/Thing.ts']).full).toBe(true);
  });
  it('a test file that changed runs itself', () => {
    expect(testsFor(['tests/tools/grain.test.ts'])).toEqual({ full: false, files: ['tests/tools/grain.test.ts'] });
    expect(testsFor(['tests/core/spring.test.ts'])).toEqual({ full: false, files: [] });          // a unit test: the fast run has it
  });
  it('a test film that changed runs, whether the page, its test or the harness changed (never the skipped fast run only)', () => {
    for (const f of ['tests/films/export-frames.html', 'tests/films/export-frames.test.ts', 'tests/films/support/withFilm.ts']) {
      expect(testsFor([f]), f).toEqual({ full: false, files: ['tests/films/'] });
    }
  });
  it('a renderer change runs the export films, and a change to what the determinism film draws runs the determinism film', () => {
    expect(testsFor(['src/core/Renderer.ts']).files).toEqual(expect.arrayContaining(['tests/films/export-frames.test.ts', 'tests/films/determinism.test.ts']));
    for (const f of ['src/filters/Grain.ts', 'src/presets/particles.ts', 'src/presets/wiggle.ts', 'src/text/spans.ts']) {
      expect(testsFor([f]).files, f).toContain('tests/films/determinism.test.ts');
    }
  });
  it('every test file the table names exists', () => {
    for (const a of AREAS) for (const f of a.tests) expect(existsSync(join(root, f)), `${a.name}: ${f}`).toBe(true);
    expect(readdirSync(join(root, 'tests/tools')).length).toBeGreaterThan(10);
  });
});
