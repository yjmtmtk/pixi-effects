import { describe, it, expect } from 'vitest';
import { PureTimeline, spacer } from '../../../src/core/pure/PureTimeline';
import { makeScript, build, rng, times, type AnyTl } from './fuzzHelpers';

/**
 * What GSAP cannot promise: the picture at a time does not depend on the way the playhead came to it. Overlapping tweens on one
 * property, a `set` that shares its start with a tween, `from` after `from`: GSAP answers by the direction it came from; the pure
 * timeline answers by the script alone. The test plays one timeline in a random order and asks a fresh one for the same time.
 */
describe('the pure timeline answers by the time alone', () => {
  for (const [name, opts] of [
    ['overlapping tweens on one property', { overlap: true, loops: false, kinds: ['set', 'to', 'from', 'fromTo'] as const, rel: false }],
    ['loops and relative values', { overlap: true, loops: true, kinds: ['set', 'to', 'from', 'fromTo'] as const, rel: true }],
  ] as const) {
    it(name, () => {
      let compared = 0;
      for (let seed = 1; seed <= 150; seed++) {
        const s = makeScript(seed, { ...opts, kinds: [...opts.kinds] });
        const mk = (): { tl: PureTimeline; objs: Record<string, number>[] } => {
          const objs = s.init.map(o => ({ ...o }));
          const tl = new PureTimeline({ paused: true, defaults: { ease: 'none' } });
          build(tl as unknown as AnyTl, objs, s, d => spacer(d));
          return { tl, objs };
        };
        const played = mk();
        const r = rng(seed ^ 0x51ed);
        for (const t of times(r, s.total)) {
          played.tl.time(t);
          const fresh = mk();
          fresh.tl.time(t);
          expect(played.objs, `seed ${seed} t=${t}`).toEqual(fresh.objs);
          compared++;
        }
      }
      expect(compared).toBeGreaterThan(5000);
    });
  }
});
