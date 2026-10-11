import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  class Text extends (m.Container as unknown as new (o?: unknown) => Record<string, unknown>) {
    style: Record<string, unknown>;
    constructor(o: { text: string; style: Record<string, unknown> }) { super(o); this.style = { ...o.style }; }
    get width() { return 100; }
    get height() { return 40; }
  }
  (m as unknown as { Text: unknown }).Text = Text;
  return m;
});
import { TextSequence } from '../../src/sequences/Text';
import type { CompositionShape, SequenceSpec } from '../../src/types';

// An outline on text is drawn with PixiJS's default line join, `miter`: the sharp corners of W, V, A, k, 4 grow spikes ("the outline sticks out").
// A text outline is round-joined unless the author says otherwise.
const comp: CompositionShape = { width: 1280, height: 720, duration: 4 };
const build = async (style: unknown) => {
  const t = new TextSequence({ type: 'text', text: 'WAVE', style } as unknown as SequenceSpec, comp, comp);
  await t.build();
  return (t.target as unknown as { style: Record<string, any> }).style;
};

beforeEach(() => { vi.restoreAllMocks(); });

describe('text outline (style.stroke)', () => {
  it('is round-joined by default, so the corners of the letters do not spike', async () => {
    const style = await build({ fontSize: 80, stroke: { color: '#000000', width: 8 } });
    expect(style.stroke).toEqual({ color: '#000000', width: 8, join: 'round' });
  });

  it('keeps a join the author chose (miter or bevel on purpose)', async () => {
    expect((await build({ stroke: { color: '#000', width: 6, join: 'miter' } })).stroke.join).toBe('miter');
    expect((await build({ stroke: { color: '#000', width: 6, join: 'bevel' } })).stroke.join).toBe('bevel');
    expect((await build({ stroke: { color: '#000', width: 6, lineJoin: 'bevel' } })).stroke.join).toBeUndefined();   // lineJoin is the author's word: left alone
  });

  it('leaves a text with no outline, and a colour-only outline, as they were', async () => {
    expect((await build({ fontSize: 40 })).stroke).toBeUndefined();
    expect((await build({ stroke: '#ff0000' })).stroke).toBe('#ff0000');
  });
});
