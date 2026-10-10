import { describe, it, expect } from 'vitest';
import { run, type Kind } from './fuzzHelpers';

type Opts = Parameters<typeof run>[1];

const SEEDS = (n: number, from = 1) => Array.from({ length: n }, (_, i) => from + i);

function sweep(name: string, opts: Opts, n = 300) {
  const cases: [string, Opts][] = [['forward, as an export plays it; segments may touch', { ...opts, ascending: true }]];
  // In any order GSAP answers a gap after a `from` / `fromTo` by the direction it came from; only `to` and `set` are compared that way.
  const plain = opts.kinds.filter(k => k === 'to' || k === 'set');
  if (plain.length) cases.push(['any order, with a gap between segments', { ...opts, kinds: plain, ascending: false }]);
  for (const [label, o] of cases) {
    it(`${name} (${label})`, () => {
      const failures: string[] = [];
      for (const seed of SEEDS(n)) { const bad = run(seed, o); if (bad.length) failures.push(bad.join('\n')); }
      expect(failures.length, failures.slice(0, 2).join('\n---\n')).toBe(0);
    });
  }
}

describe('PureTimeline equals gsap.timeline (plain objects, numbers)', () => {
  sweep('to only, one segment per property at a time', { overlap: false, loops: false, kinds: ['to'], rel: false });
  sweep('set and to', { overlap: false, loops: false, kinds: ['set', 'to'], rel: false });
  sweep('from and fromTo (the start value shows from the beginning)', { overlap: false, loops: false, kinds: ['to', 'from', 'fromTo'], rel: false });
  sweep('repeat, yoyo and repeatDelay', { overlap: false, loops: true, kinds: ['to', 'fromTo', 'from'], rel: false });
  sweep('relative values', { overlap: false, loops: true, kinds: ['to', 'from', 'set'], rel: true });
  // Overlapping tweens on one property are a conflict; GSAP then answers by the direction it came from. Pure answers by one rule
  // (the segment that started last wins), so only the forward, export-like order is compared, and only where one segment is active.
});
