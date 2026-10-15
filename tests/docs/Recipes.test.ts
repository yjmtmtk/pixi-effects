import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  // every asset name resolves to something that works as image (size) and audio (buffer + 6 s duration)
  m.Assets.get = async () => ({ width: 1920, height: 1080, audioBuffer: { duration: 6 }, duration: 6 });
  return m;
});
import { CompositionSequence } from '../../src/sequences/Composition';
import { registerBlendModes } from '../../src/filters/blendModes';
// a movie that uses an advanced blend mode registers the blend filters in Movie.init; this test builds the compositions without a movie
registerBlendModes();
import { expandTransitions } from '../../src/core/Transitions';
import { kenBurns } from '../../src/presets/kenBurns';
import { withFade } from '../../src/transforms/withFade';
import { orbit } from '../../src/presets/orbit';
import { wiggle } from '../../src/presets/wiggle';
import { stagger } from '../../src/presets/stagger';
import { animateText } from '../../src/presets/animateText';
import { followPath } from '../../src/presets/followPath';
import { cameraPath } from '../../src/presets/cameraPath';
import { particles } from '../../src/presets/particles';
import { deck } from '../../src/present/deck';
import { react } from '../../src/presets/react';
import { bpmEnvelope } from '../../src/audio/envelope';
import { random, rand, noise, noise2 } from '../../src/expr/random';
import { samplePath } from '../../src/core/pathSample';
import { parseEase as ease } from '../../src/presets/_ease';
import { measureText, splitText } from '../../src/text/measure';
import { lintSequence } from '../../src/space/lint';
import { lintTiming } from '../../src/core/lint';
import { fakeGl, fake2d, installCanvas } from '../support/fakeGl';
import { resetGl } from '../../src/core/glShared';
import type { CompositionShape, SequenceSpec } from '../../src/types';
import { createTimeline } from '../../src/core/timelineEngine';

// the bar chart can grow its bars one at a time (EACH) without the highlight and the callout landing before the last bar
{
  const bar = readFileSync(resolve(__dirname, '../../skills/pixi-effects/reference/recipes.md'), 'utf8').split('// @recipe bar-chart')[1]!.split('```')[0]!;
  describe('the bar-chart recipe', () => {
    it('has EACH (the gap between bars) and times the highlight and the callout after the last bar', () => {
      expect(bar).toMatch(/const EACH = 0\.12;/);
      expect(bar).toMatch(/const PEAK_AT = Math\.max\(4,/);
      expect(bar).not.toMatch(/at: 4\.2|at: 4 - at/);
    });
  });
}

// the AI recipes: every `// @recipe` block in them is built and linted
const md = ['skills/pixi-effects/reference/recipes.md', 'skills/pixi-effects/reference/quickstart.md']
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

// a shader layer draws with a WebGL2 context: a recorded fake stands in for the browser's
beforeEach(() => { vi.restoreAllMocks(); resetGl(); installCanvas(fakeGl()); });

describe('skills/pixi-effects/reference/recipes.md', () => {
  it('contains the recipes (and marks the browser-only ones as docs-only)', () => {
    expect(recipes.length).toBeGreaterThanOrEqual(10);
    expect(blocks.filter(b => b.kind === 'docs-only').length).toBeGreaterThanOrEqual(2);
  });

  it('has the subtitles recipe (an SRT as timed text layers), merged from the old Guide', () => {
    expect(recipes.map(r => r.name)).toContain('subtitles');
  });

  for (const r of recipes) {
    it(`recipe "${r.name}" builds and binds with no warnings`, async () => {
      if (/type: 'canvas'/.test(r.code)) installCanvas(fakeGl(), fake2d());       // a canvas layer says so when a browser gives no 2D context, and happy-dom's gives none
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const out = new Function('kenBurns', 'withFade', 'orbit', 'splitText', 'measureText', 'wiggle', 'stagger', 'animateText', 'followPath', 'cameraPath', 'particles', 'deck', 'react', 'bpmEnvelope', 'random', 'rand', 'noise', 'noise2', 'samplePath', 'ease', r.code)(kenBurns, withFade, orbit, splitText, measureText, wiggle, stagger, animateText, followPath, cameraPath, particles, deck, react, bpmEnvelope, random, rand, noise, noise2, samplePath, ease) as
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
      comp.bindTimeline(createTimeline({ paused: true }));

      // (GSAP's own "Invalid property" notes appear because the test env does not register PixiPlugin; only ours matter.)
      expect(warn.mock.calls.map(c => String(c[0])).filter(m => m.startsWith('pixi-effects:'))).toEqual([]);
    });
  }
});
