import { describe, it, expect } from 'vitest';
import { BASIC_BLEND_MODES, ADVANCED_BLEND_MODES, BLEND_MODES, isAdvancedBlend, blendProblem, usesAdvancedBlend } from '../../src/core/blend';

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
