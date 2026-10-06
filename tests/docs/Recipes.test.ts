import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { gsap } from 'gsap';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  // every asset name resolves to something that works as image (size) and audio (buffer + 6 s duration)
  m.Assets.get = async () => ({ width: 1920, height: 1080, audioBuffer: { duration: 6 }, duration: 6 });
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
import { expandTransitions } from '../../src/core/Transitions';
import { kenBurns } from '../../src/presets/kenBurns';
import { withFade } from '../../src/transforms/withFade';
import { orbit } from '../../src/presets/orbit';
import { wiggle } from '../../src/presets/wiggle';
import { stagger } from '../../src/presets/stagger';
import { animateText } from '../../src/presets/animateText';
import { random, rand, noise } from '../../src/expr/random';
import { measureText, splitText } from '../../src/text/measure';
import { lintSequence } from '../../src/space/lint';
import { lintTiming } from '../../src/core/lint';
import type { CompositionShape, SequenceSpec } from '../../src/types';

// the AI recipes, and the human cookbook (site/guide): every `// @recipe` block in either is built and linted
const md = ['ai/reference/recipes.md', 'site/guide/cookbook.md', 'site/guide/text.md', 'site/guide/shapes.md', 'site/guide/transitions.md', 'site/guide/motion.md']
  .map(f => readFileSync(resolve(__dirname, '../..', f), 'utf8')).join('\n');
const blocks = [...md.matchAll(/```js\n\/\/ @(recipe|docs-only)([^\n]*)\n([\s\S]*?)```/g)]
  .map(m => ({ kind: m[1]!, name: m[2]!.trim(), code: m[3]! }));
const recipes = blocks.filter(b => b.kind === 'recipe');

function walk(seqs: SequenceSpec[], fn: (s: SequenceSpec, parentDuration: number) => void, parentDuration: number): void {
  for (const s of seqs) {
    fn(s, parentDuration);
    const kids = (s as { sequences?: SequenceSpec[] }).sequences;
    if (kids) walk(kids, fn, s.duration ?? parentDuration);
  }
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('ai/reference/recipes.md', () => {
  it('contains the recipes (and marks the browser-only ones as docs-only)', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(10);
    expect(blocks.filter(b => b.kind === 'docs-only').length).toBeGreaterThanOrEqual(2);
  });

  for (const r of recipes) {
    it(`recipe "${r.name}" builds and binds with no warnings`, async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const out = new Function('kenBurns', 'withFade', 'orbit', 'splitText', 'measureText', 'wiggle', 'stagger', 'animateText', 'random', 'rand', 'noise', r.code)(kenBurns, withFade, orbit, splitText, measureText, wiggle, stagger, animateText, random, rand, noise) as
        SequenceSpec[] | { sequences: SequenceSpec[]; transitions?: unknown[]; duration?: number };
      const sequences = Array.isArray(out) ? out : out.sequences;
      const transitions = Array.isArray(out) ? undefined : out.transitions;
      const duration = (!Array.isArray(out) && out.duration) || 8;
      expect(sequences.length).toBeGreaterThan(0);

      // static lint: the spec itself must not trigger any authoring warning
      walk(sequences, (s, pd) => { lintSequence(s); lintTiming(s, pd); }, duration);

      const root: CompositionShape = { width: 1280, height: 720, duration };
      const spec = expandTransitions({ width: 1280, height: 720, duration, sequences, ...(transitions ? { transitions } : {}) } as never);
      const comp = new CompositionSequence({ type: 'composition', ...spec } as never, null, root);
      await comp.build();
      comp.bindTimeline(gsap.timeline({ paused: true }));

      // (GSAP's own "Invalid property" notes appear because the test env does not register PixiPlugin; only ours matter.)
      expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.startsWith('pixi-effects:'))).toEqual([]);
    });
  }
});
