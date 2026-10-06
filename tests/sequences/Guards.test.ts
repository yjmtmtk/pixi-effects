import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  // Text whose width depends on the CURRENT style, like real text.
  class Text extends (m.Container as unknown as new (o?: unknown) => Record<string, unknown>) {
    style: Record<string, unknown>;
    private _t: string;
    constructor(o: { text: string; style: Record<string, unknown>; label?: string }) {
      super(o);
      this._t = o.text;
      this.style = { ...o.style };
    }
    get width() { return Number(this.style.fontSize) * this._t.length; }
    get height() { return Number(this.style.fontSize) * 1.2; }
  }
  (m as unknown as { Text: unknown }).Text = Text;
  m.Assets.get = async (n: string) => (n === 'bgm' ? { audioBuffer: { duration: 6 }, duration: 6 } : { width: 100, height: 100 });
  return m;
});
import { TextSequence } from '../../src/sequences/Text';
import { ShapeSequence } from '../../src/sequences/Shape';
import { AudioSequence } from '../../src/sequences/Audio';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const comp: CompositionShape = { width: 1280, height: 720, duration: 12 };
const mk = <T,>(C: new (s: SequenceSpec, p: CompositionShape, r: CompositionShape) => T, spec: unknown) => new C(spec as SequenceSpec, comp, comp);

beforeEach(() => { vi.restoreAllMocks(); });

describe('TextSequence intrinsic size', () => {
  it('w / h reflect the STYLED text, not the default style it is created with', async () => {
    const t = mk(TextSequence, { type: 'text', text: 'ABCD', style: { fontSize: 100 } });
    await t.build();
    expect(t.intrinsicWidth).toBe(400);        // 100 * 4 chars (default style would give 36 * 4 = 144)
    expect(t.intrinsicHeight).toBeCloseTo(120, 6);
  });
});

describe('ShapeSequence geometry in `initial`', () => {
  it('width / height / anchorX / anchorY / radius written in `initial` are honoured, like at the top level', async () => {
    const r = mk(ShapeSequence, { type: 'shape', shape: 'rect', initial: { width: 200, height: 80, anchorX: 0, anchorY: 1 } });
    await r.build();
    const st = (r as unknown as { _state: Record<string, number> })._state;
    expect(st.width).toBe(200);
    expect(st.height).toBe(80);
    expect(st.anchorX).toBe(0);
    expect(st.anchorY).toBe(1);
    const c = mk(ShapeSequence, { type: 'shape', shape: 'circle', initial: { radius: 40 } });
    await c.build();
    expect((c as unknown as { _state: Record<string, number> })._state.radius).toBe(40);
  });

  it('the top-level value wins when both are given', async () => {
    const r = mk(ShapeSequence, { type: 'shape', shape: 'rect', width: 300, height: 50, initial: { width: 999 } });
    await r.build();
    expect((r as unknown as { _state: Record<string, number> })._state.width).toBe(300);
  });
});

describe('AudioSequence shorter than its duration', () => {
  it('warns (naming the asset, both lengths and the fix) when the asset ends before the sequence and loop is off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a = mk(AudioSequence, { type: 'audio', asset: 'bgm', duration: 12 });
    await a.build();
    expect(warn).toHaveBeenCalledTimes(1);
    const msg = String(warn.mock.calls[0]![0]);
    expect(msg).toContain('"bgm"');
    expect(msg).toContain('6.0s');
    expect(msg).toContain('12.0s');
    expect(msg).toContain('loop: true');
  });

  it('is silent with loop: true, when the duration fits, and when no duration is given', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const extra of [{ duration: 12, loop: true }, { duration: 6 }, {}]) {
      await mk(AudioSequence, { type: 'audio', asset: 'bgm', ...extra }).build();
    }
    expect(warn).not.toHaveBeenCalled();
  });
});
