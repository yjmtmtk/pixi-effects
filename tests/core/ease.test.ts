import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { checkEase, EASE_NAMES, __resetEaseWarnings } from '../../src/core/ease';
import { normalizeKeyframe } from '../../src/core/Timeline';
import { parseEase } from '../../src/presets/_ease';

beforeEach(() => { __resetEaseWarnings(); vi.restoreAllMocks(); });

describe('checkEase', () => {
  it.each(['none', 'power2.inOut', 'power4.out', 'back.out(1.7)', 'elastic.out(1, 0.3)', 'steps(12)', 'sine.inOut', 'circ.in', 'expo.out', 'bounce.out'])(
    'does not warn for %s', (e) => {
      const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
      checkEase(e, 'test'); expect(w).not.toHaveBeenCalled();
    });
  it('warns for an unknown name, with a guess, and says what would happen', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    checkEase('power3.outt', 'keyframe');
    expect(w).toHaveBeenCalledTimes(1);
    const msg = String(w.mock.calls[0]![0]);
    expect(msg).toMatch(/unknown ease "power3\.outt"/);
    expect(msg).toMatch(/did you mean "power3\.out"/);
    expect(msg).toMatch(/default ease|power1\.out/);
  });
  it('warns once per name, not once per keyframe', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 5; i++) checkEase('bogus', 'keyframe');
    expect(w).toHaveBeenCalledTimes(1);
  });
  it('every ease the repository itself writes is a real one (no false alarm on the examples, the gallery or the docs)', () => {
    const root = resolve(__dirname, '../..');
    const files = ['ai/reference/cheatsheet.md', 'ai/reference/recipes.md', 'docs/dsl.md',
      ...readdirSync(resolve(root, 'examples/gallery')).filter((f) => f.endsWith('.html')).map((f) => `examples/gallery/${f}`),
      ...readdirSync(resolve(root, 'examples')).filter((f) => /^\d\d-.*\.html$/.test(f)).map((f) => `examples/${f}`),
      ...readdirSync(resolve(root, 'site/guide')).filter((f) => f.endsWith('.md')).map((f) => `site/guide/${f}`)];
    const names = new Set<string>();
    for (const f of files) for (const m of readFileSync(resolve(root, f), 'utf8').matchAll(/\bease\s*:\s*['"]([^'"$`]+)['"]/g)) names.add(m[1]!);
    expect(names.size).toBeGreaterThan(8);
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const n of names) checkEase(n, 'repo');
    expect(w.mock.calls.map((c) => c[0])).toEqual([]);
  });
  it('a keyframe with a mistyped ease warns (this is where an author meets it), and so does a preset', () => {
    const w = vi.spyOn(console, 'warn').mockImplementation(() => {});
    normalizeKeyframe({ at: 0, to: { x: 1 }, duration: 1, ease: 'power3.outt' }, 5);
    expect(String(w.mock.calls[0]![0])).toMatch(/a keyframe: unknown ease "power3\.outt"/);
    parseEase('sine.inOutt');
    expect(String(w.mock.calls[1]![0])).toMatch(/a preset: unknown ease "sine\.inOutt"/);
  });
  it('EASE_NAMES lists the families the suggestions are chosen from', () => {
    expect(EASE_NAMES).toEqual(expect.arrayContaining(['none', 'power2.out', 'back.inOut', 'sine.in']));
  });
});
