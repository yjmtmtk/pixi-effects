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

  it('a style value that is undefined (a variable that was never set) is ignored with a warning that names the key, and the text still has a size', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = new TextSequence({ type: 'text', name: 'big', text: 'hi', style: { fontSize: undefined, fill: '#ff0000', fontWeight: undefined } } as unknown as SequenceSpec, comp, comp);
    await t.build();
    const style = (t.target as unknown as { style: Record<string, any> }).style;
    expect('fontSize' in style || 'fontWeight' in style).toBe(false);   // never written as undefined: Pixi keeps its default (36 px)
    expect(style.fill).toBe('#ff0000');                                // the rest of the style still applies
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/style\.fontSize, style\.fontWeight are undefined.*omit the key/);
    expect(String(warn.mock.calls[0]![0])).toContain('big');
  });

  it('initial.fill is the text\'s colour from the start (it used to be ignored without a word): it wins over style.fill', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = new TextSequence({ type: 'text', text: 'hi', style: { fill: '#ffffff' }, initial: { fill: '#ff0000' } } as unknown as SequenceSpec, comp, comp);
    await t.build();
    expect((t.target as unknown as { style: Record<string, unknown> }).style.fill).toBe('#ff0000');
    expect(warn).not.toHaveBeenCalled();
    const bare = new TextSequence({ type: 'text', text: 'hi', initial: { fill: 0x00ff00 } } as unknown as SequenceSpec, comp, comp);
    await bare.build();
    expect((bare.target as unknown as { style: Record<string, unknown> }).style.fill).toBe(0x00ff00);      // a number works, and no style is needed
  });

  it('resolution draws the text at that many times the pixels, so a parent that scales it up (a zoom, a pull-in) keeps it sharp; without it the renderer\'s own resolution stays', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = new TextSequence({ type: 'text', text: 'hi', resolution: 3 } as unknown as SequenceSpec, comp, comp);
    await t.build();
    expect((t.target as unknown as { resolution: number }).resolution).toBe(3);
    const plain = new TextSequence({ type: 'text', text: 'hi' } as unknown as SequenceSpec, comp, comp);
    await plain.build();
    expect((plain.target as unknown as { resolution: number }).resolution).not.toBe(3);
    expect(warn).not.toHaveBeenCalled();
  });

  it('a resolution that is not a number from 1 to 8 is said and ignored', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const bad of [0, 12, 'big', -2]) {
      const t = new TextSequence({ type: 'text', name: 'title', text: 'hi', resolution: bad } as unknown as SequenceSpec, comp, comp);
      await t.build();
      expect((t.target as unknown as { resolution: number }).resolution).not.toBe(bad);
    }
    expect(warn).toHaveBeenCalledTimes(4);
    expect(String(warn.mock.calls[0]![0])).toMatch(/title.*resolution.*1 (and|to) 8/);
  });

  it('a named colour given directly as stroke is kept as it is', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = new TextSequence({ type: 'text', text: 'hi', style: { stroke: 'white' } } as unknown as SequenceSpec, comp, comp);
    await t.build();
    expect(warn).not.toHaveBeenCalled();
    expect((t.target as unknown as { style: { stroke: unknown } }).style.stroke).toBe('white');
  });
});
