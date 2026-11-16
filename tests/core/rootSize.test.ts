import { describe, it, expect } from 'vitest';
import { rootSize } from '../../src/core/rootSize';

// The size and the length of a movie can be written in two places: init({ width, height, duration }) and the composition's own
// width / height / duration. One place is enough; two that differ are said (the composition used to be cut silently to init's length).
describe('rootSize', () => {
  it('init alone, the composition alone, or neither (1920 × 1080, 10 s)', () => {
    expect(rootSize({ width: 1280, height: 720, duration: 4 })).toEqual({ width: 1280, height: 720, duration: 4, warnings: [] });
    expect(rootSize({ composition: { width: 1080, height: 1920, duration: 12 } })).toEqual({ width: 1080, height: 1920, duration: 12, warnings: [] });
    expect(rootSize({})).toEqual({ width: 1920, height: 1080, duration: 10, warnings: [] });
  });
  it('both, the same: nothing said; both, different: init wins and it is said', () => {
    expect(rootSize({ duration: 6, composition: { duration: 6 } }).warnings).toEqual([]);
    const r = rootSize({ width: 1920, height: 1080, duration: 6, composition: { width: 1280, height: 720, duration: 12 } });
    expect(r).toMatchObject({ width: 1920, height: 1080, duration: 6 });
    expect(r.warnings).toEqual([
      expect.stringMatching(/movie\.init\(\): duration 6 and the composition's duration 12 differ: the movie is 6 s \(write the length in one place\)/),
      expect.stringMatching(/movie\.init\(\): width × height 1920 × 1080 and the composition's 1280 × 720 differ: the movie is 1920 × 1080 \(write the size in one place\)/),
    ]);
  });
});
