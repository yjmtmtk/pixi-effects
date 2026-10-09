import { describe, it, expect, vi } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { BASIC_BLEND_MODES, ADVANCED_BLEND_MODES, BLEND_MODES, isAdvancedBlend, blendProblem, usesAdvancedBlend, enableAdvancedBlend, blendFilterFor, maxConcurrentAdvanced, MANY_ADVANCED } from '../../src/core/blend';

describe('the blend mode table', () => {
  it('is 4 basic and 14 advanced modes: the CSS names (add and linear-burn are the two that CSS does not have)', () => {
    expect(BASIC_BLEND_MODES).toEqual(['normal', 'add', 'screen', 'multiply']);
    expect(ADVANCED_BLEND_MODES).toHaveLength(14);
    expect(BLEND_MODES).toHaveLength(18);
    for (const m of ['overlay', 'soft-light', 'hard-light', 'color-dodge', 'color-burn', 'darken', 'lighten', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity']) {
      expect(ADVANCED_BLEND_MODES).toContain(m);
    }
    expect(new Set(BLEND_MODES).size).toBe(18);
  });
  it('isAdvancedBlend: the 14, not the basic 4, not a typo', () => {
    expect(isAdvancedBlend('soft-light')).toBe(true);
    expect(isAdvancedBlend('add')).toBe(false);
    expect(isAdvancedBlend('normal')).toBe(false);
    expect(isAdvancedBlend('softlight')).toBe(false);
    expect(isAdvancedBlend(undefined)).toBe(false);
  });
});

describe('blendProblem', () => {
  it('is null for every name in the table', () => {
    for (const m of BLEND_MODES) expect(blendProblem(m)).toBeNull();
  });
  it('says what was meant for the usual slips, and lists the modes', () => {
    const cases: Array<[string, string]> = [
      ['softlight', 'soft-light'], ['soft_light', 'soft-light'], ['SoftLight', 'soft-light'], ['hardlight', 'hard-light'],
      ['dodge', 'color-dodge'], ['colour', 'color'], ['overlay2', 'overlay'], ['lumiosity', 'luminosity'], ['Multiply', 'multiply'],
    ];
    for (const [typed, meant] of cases) {
      const p = blendProblem(typed)!;
      expect(p, typed).toContain(`blendMode "${typed}" is not supported`);
      expect(p, typed).toContain(`did you mean "${meant}"?`);
      expect(p).toContain('soft-light');
    }
  });
  it('a name that is nothing like any mode has no guess, still lists the modes; a non-string is a problem too', () => {
    expect(blendProblem('glow')).toMatch(/not supported \(use normal, add, screen, multiply, overlay/);
    expect(blendProblem('glow')).not.toContain('did you mean');
    expect(blendProblem(3)).toMatch(/blendMode 3 is not supported/);
  });
});

describe('usesAdvancedBlend', () => {
  const comp = (sequences: unknown[], extra: Record<string, unknown> = {}) => ({ type: 'composition', sequences, ...extra });
  it('finds an advanced mode on a layer, in a nested composition, and on a mask layer', () => {
    expect(usesAdvancedBlend(comp([{ type: 'shape', shape: 'circle', blendMode: 'overlay' }]))).toBe(true);
    expect(usesAdvancedBlend(comp([comp([comp([{ type: 'text', text: 'a', blendMode: 'hue' }])])]))).toBe(true);
    expect(usesAdvancedBlend(comp([{ type: 'shape', shape: 'circle', mask: { type: 'shape', shape: 'rect', blendMode: 'difference' } }]))).toBe(true);
    expect(usesAdvancedBlend(comp([{ type: 'composition', blendMode: 'color', sequences: [] }]))).toBe(true);
  });
  it('is false for no blend mode, the basic four, a typo, and for things that are not specs', () => {
    expect(usesAdvancedBlend(comp([{ type: 'shape', shape: 'circle' }]))).toBe(false);
    expect(usesAdvancedBlend(comp([{ type: 'shape', shape: 'circle', blendMode: 'add' }, { type: 'text', text: 'a', blendMode: 'multiply' }]))).toBe(false);
    expect(usesAdvancedBlend(comp([{ type: 'shape', shape: 'circle', blendMode: 'softlight' }]))).toBe(false);
    expect(usesAdvancedBlend(undefined)).toBe(false);
    expect(usesAdvancedBlend('soft-light')).toBe(false);
  });
});

describe('enableAdvancedBlend', () => {
  it('registers the blends (blend.ts can then make a filter) and turns the WebGL back buffer on', async () => {
    const renderer = { backBuffer: { useBackBuffer: false } };
    await enableAdvancedBlend(renderer);
    expect(renderer.backBuffer.useBackBuffer).toBe(true);
    expect(blendFilterFor('overlay')).not.toBeNull();
  });
  it('a renderer with no back buffer (WebGPU) is fine', async () => {
    await expect(enableAdvancedBlend({})).resolves.toBeUndefined();
  });
});

describe('maxConcurrentAdvanced', () => {
  const L = (at: number, duration: number | undefined, blendMode: unknown = 'overlay') => ({ at, duration, blendMode });
  it('counts the most layers with an advanced mode that are on screen at one instant (from their at and duration, not the order they were visited)', () => {
    expect(MANY_ADVANCED).toBe(10);
    expect(maxConcurrentAdvanced(Array.from({ length: 12 }, () => L(0, undefined)), 10)).toBe(12);
    expect(maxConcurrentAdvanced(Array.from({ length: 24 }, (_, i) => L(i, 1)), 24)).toBe(1);         // slides one after another
    expect(maxConcurrentAdvanced([L(0, 5), L(2, 5), L(4, 5)], 10)).toBe(3);                            // 4–5 s: all three
    expect(maxConcurrentAdvanced([L(0, 2), L(2, 2)], 10)).toBe(1);                                     // [0, 2) and [2, 4) do not overlap
  });
  it('does not count the basic modes, normal, or layers with no mode; a layer with no duration lasts to the end of the composition', () => {
    expect(maxConcurrentAdvanced([L(0, 5, 'add'), L(0, 5, 'normal'), L(0, 5, null), L(0, 5, 'multiply')], 10)).toBe(0);
    expect(maxConcurrentAdvanced([L(8, undefined), L(9, undefined)], 10)).toBe(2);
    expect(maxConcurrentAdvanced([], 10)).toBe(0);
  });
});
