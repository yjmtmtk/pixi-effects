import { describe, it, expect, vi, beforeEach } from 'vitest';
import { warnUnknownOptions, suggestName } from '../../src/core/options';
import { orbit } from '../../src/presets/orbit';
import { kenBurns } from '../../src/presets/kenBurns';
import { withFade } from '../../src/transforms/withFade';
import { Movie } from '../../src/core/Movie';

beforeEach(() => { vi.restoreAllMocks(); });

describe('suggestName', () => {
  const valid = ['frames', 'times', 'count', 'columns', 'cellWidth', 'as'];
  it('finds the intended name for typos, abbreviations and case slips', () => {
    expect(suggestName('cols', valid)).toBe('columns');
    expect(suggestName('colums', valid)).toBe('columns');
    expect(suggestName('cellwidth', valid)).toBe('cellWidth');
    expect(suggestName('frame', valid)).toBe('frames');
  });
  it('returns null when nothing is close', () => {
    expect(suggestName('banana', valid)).toBeNull();
  });
});

describe('warnUnknownOptions', () => {
  it('warns once per unknown key with a suggestion and the valid list; stays silent for valid / missing options', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnUnknownOptions('movie.contactSheet()', { cols: 2, count: 4 }, ['frames', 'times', 'count', 'columns']);
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]![0]);
    expect(msg).toContain('movie.contactSheet()');
    expect(msg).toContain('"cols"');
    expect(msg).toContain('did you mean "columns"');
    expect(msg).toContain('frames, times, count, columns');
    warn.mockClear();
    warnUnknownOptions('x', { count: 1 }, ['count']);
    warnUnknownOptions('x', undefined, ['count']);
    expect(warn).not.toHaveBeenCalled();
  });
  it('omits the suggestion when nothing is close', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    warnUnknownOptions('f()', { zzz: 1 }, ['alpha', 'beta']);
    expect(String(warn.mock.calls[0]![0])).not.toContain('did you mean');
  });
});

describe('the public entry points use it', () => {
  it('presets warn about a typo\'d option', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    orbit({ duration: 2, degrees: 10, degree: 5 } as never);
    expect(String(warn.mock.calls[0]![0])).toMatch(/orbit\(\).*"degree".*did you mean "degrees"/);
    warn.mockClear();
    kenBurns({ asset: 'a', duration: 3, motion: 'scale', zoomm: 1.2 } as never);
    expect(String(warn.mock.calls[0]![0])).toMatch(/kenBurns\(\).*"zoomm".*did you mean "zoom"/);
    warn.mockClear();
    withFade({ type: 'text', text: 'a', duration: 2 }, { fadeIn: 1 } as never);
    expect(String(warn.mock.calls[0]![0])).toMatch(/withFade\(\).*"fadeIn".*did you mean "in"/);
  });

  it('movie methods warn before anything else, even when the movie is not ready yet', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const m = new Movie();
    await expect(m.contactSheet({ cols: 2 } as never)).rejects.toThrow(/ready/);
    expect(String(warn.mock.calls[0]![0])).toMatch(/contactSheet\(\).*"cols".*did you mean "columns"/);
    warn.mockClear();
    await expect(m.snapshot(0, { sacle: 2 } as never)).rejects.toThrow(/ready/);
    expect(String(warn.mock.calls[0]![0])).toMatch(/snapshot\(\).*"sacle".*did you mean "scale"/);
    warn.mockClear();
    await expect(m.init({ fps: 24 } as never).catch(() => {})).resolves.toBeUndefined();
    expect(warn.mock.calls.some(c => /init\(\).*"fps".*did you mean "frameRate"/.test(String(c[0])))).toBe(true);
  });
});
