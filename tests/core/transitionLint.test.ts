import { describe, it, expect } from 'vitest';
import { lintTransitions } from '../../src/core/transitionLint';

// A transition that is not understood used to vanish with no word (an unknown kind expanded to nothing): now it is said, with what to write.
const movie = (t: Record<string, unknown>, nested = false) => {
  const transitions = [{ from: 'a', to: 'b', at: 1, duration: 1, ...t }];
  const sequences = [{ type: 'text', name: 'a', text: 'A' }, { type: 'text', name: 'b', text: 'B' }];
  return nested ? { sequences: [{ type: 'composition', name: 'scene', sequences, transitions }] } : { sequences, transitions };
};

describe('lintTransitions', () => {
  it('an unknown kind says the kinds there are, with the words other tools use (fade → crossfade, push → slide)', () => {
    expect(lintTransitions(movie({ kind: 'fade' }))[0]).toMatch(/transition "a" → "b": kind "fade" is not a transition — did you mean "crossfade"\? \(kinds: crossfade, wipe, iris, slide, dip, zoom, dissolve, luma\)/);
    expect(lintTransitions(movie({ kind: 'push' }))[0]).toMatch(/did you mean "slide"\?/);
    expect(lintTransitions(movie({ kind: 'wiep' }))[0]).toMatch(/did you mean "wipe"\?/);
  });
  it('no kind, or `type` written for it', () => {
    expect(lintTransitions(movie({ type: 'crossfade' }))[0]).toMatch(/transition "a" → "b": "type" is not a transition key — did you mean "kind"\? \(kind: 'crossfade'\)/);
    expect(lintTransitions(movie({}))[0]).toMatch(/transition "a" → "b" has no kind: give one of crossfade, wipe/);
  });
  it('a key the kind does not have, with did-you-mean and the keys it has; inside a composition too', () => {
    expect(lintTransitions(movie({ kind: 'wipe', direction: 'left', dirction: 'up' }))[0]).toMatch(/transition "a" → "b": "dirction" is not a key of a wipe — did you mean "direction"\?/);
    expect(lintTransitions(movie({ kind: 'crossfade', direction: 'left' }, true))[0]).toMatch(/composition "scene": transition "a" → "b": "direction" is not a key of a crossfade \(it belongs to wipe, slide\)/);
  });
  it('a good transition says nothing', () => {
    expect(lintTransitions(movie({ kind: 'wipe', direction: 'left', ease: 'power2.inOut' }))).toEqual([]);
    expect(lintTransitions({ sequences: [] })).toEqual([]);
  });
});
