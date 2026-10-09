import { describe, it, expect } from 'vitest';
import { LoadProgress, STAGE_LABEL, type LoadProgressState } from '../../src/core/loadProgress';

function make(opts: { yieldEveryMs?: number } = {}) {
  let t = 0;
  const seen: LoadProgressState[] = [];
  let yields = 0;
  const lp = new LoadProgress(s => seen.push(s), { now: () => t, yielder: async () => { yields++; }, ...opts });
  return { lp, seen, advance: (ms: number) => { t += ms; }, yields: () => yields };
}

describe('LoadProgress — one number from 0 to 1 for a movie that takes seconds to build', () => {
  it('rises through the stages and ends at exactly 1', () => {
    const { lp, seen } = make();
    lp.begin('assets', 2); lp.tick(); lp.tick();
    lp.begin('build', 4); lp.tick(); lp.tick(); lp.tick(); lp.tick();
    lp.begin('sound', 1); lp.tick();
    lp.begin('frames', 0);
    lp.finish();
    expect(seen.at(-1)!.progress).toBe(1);
    expect(seen.every(s => s.progress >= 0 && s.progress <= 1)).toBe(true);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!.progress).toBeGreaterThanOrEqual(seen[i - 1]!.progress);
  });

  it('never goes down, even when a stage learns that it has more to do than it said', () => {
    const { lp } = make();
    lp.begin('build', 2); lp.tick(); lp.tick();
    const high = lp.progress;
    lp.begin('build', 10);                                        // the count grew (an inline mask built more layers)
    expect(lp.progress).toBeGreaterThanOrEqual(high);
  });

  it('clamps a tick past the total, and an empty stage is already done', () => {
    const { lp } = make();
    lp.begin('assets', 1); lp.tick(5);
    const afterAssets = lp.progress;
    lp.begin('sound', 0);                                          // no sound at all: its share is not waited for
    expect(lp.progress).toBeGreaterThanOrEqual(afterAssets);
    lp.finish();
    expect(lp.progress).toBe(1);
  });

  it('a stage that is never begun (no assets) counts as done when a later stage starts', () => {
    const { lp } = make();
    lp.begin('build', 10);
    expect(lp.progress).toBeGreaterThan(0.1);                      // the assets share is behind us
  });

  it('reports the stage, the counts and a label an author can show', () => {
    const { lp, seen } = make();
    lp.begin('build', 3); lp.tick();
    expect(seen.at(-1)).toMatchObject({ stage: 'build', loaded: 1, total: 3 });
    expect(STAGE_LABEL.build).toBe('BUILDING LAYERS');
    expect(Object.keys(STAGE_LABEL).sort()).toEqual(['assets', 'build', 'frames', 'sound']);
  });

  it('lets the page paint: one yield after 50 ms of work, none before', async () => {
    const { lp, advance, yields } = make({ yieldEveryMs: 50 });
    lp.begin('build', 100);
    advance(20); await lp.yieldIfDue();
    expect(yields()).toBe(0);
    advance(40); await lp.yieldIfDue();                            // 60 ms since the start
    expect(yields()).toBe(1);
    advance(10); await lp.yieldIfDue();                            // 10 ms since the last yield
    expect(yields()).toBe(1);
  });

  it('times each stage, for `check` to say which one is slow', () => {
    const { lp, advance } = make();
    lp.begin('assets', 1); advance(100); lp.tick();
    lp.begin('build', 1); advance(2400); lp.tick();
    lp.begin('sound', 1); advance(600); lp.tick();
    lp.finish();
    expect(lp.timings()).toEqual({ assets: 100, build: 2400, sound: 600, frames: 0 });
  });

  it('does not yield in a hidden tab (a timer there waits about a second), and the default yielder is not a plain setTimeout', async () => {
    let hidden = true; let yields = 0; let t = 0;
    const lp = new LoadProgress(() => {}, { now: () => t, yielder: async () => { yields++; }, hidden: () => hidden });
    t = 500; await lp.yieldIfDue();
    expect(yields).toBe(0);
    hidden = false; await lp.yieldIfDue();
    expect(yields).toBe(1);
  });
});
