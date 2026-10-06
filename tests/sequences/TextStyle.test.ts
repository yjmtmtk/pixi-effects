import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { TextSequence } from '../../src/sequences/Text';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };
beforeEach(() => { vi.restoreAllMocks(); });

describe('text style values', () => {
  it('words in a style (stroke join / cap, named colours, baseline, whitespace) are not parsed as expressions', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = new TextSequence({
      type: 'text', text: 'hi',
      style: {
        fontSize: 'W / 20',                                           // numbers may still be expressions
        stroke: { color: 'red', width: 4, join: 'round', cap: 'round' },
        dropShadow: { color: 'black', blur: 4, distance: 2 },
        fontVariant: 'small-caps', textBaseline: 'middle', whiteSpace: 'pre', lineJoin: 'round',
      },
    } as unknown as SequenceSpec, comp, comp);
    await t.build();
    expect(warn).not.toHaveBeenCalled();
    const style = (t.target as unknown as { style: Record<string, any> }).style;
    expect(style.fontSize).toBe(64);                                   // 1280 / 20
    expect(style.stroke).toEqual({ color: 'red', width: 4, join: 'round', cap: 'round' });
    expect(style.dropShadow.color).toBe('black');
    expect(style.textBaseline).toBe('middle');
  });

  it('a named colour given directly as stroke is kept as it is', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = new TextSequence({ type: 'text', text: 'hi', style: { stroke: 'white' } } as unknown as SequenceSpec, comp, comp);
    await t.build();
    expect(warn).not.toHaveBeenCalled();
    expect((t.target as unknown as { style: { stroke: unknown } }).style.stroke).toBe('white');
  });
});
