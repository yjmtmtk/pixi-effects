import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('../space/mockPixi')).createPixiMock());
import { animateText } from '../../src/presets/animateText';

const style = { fontSize: 20 };               // the mock: 10 px per character, 24 px per line
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
const kf = (l: any) => l.keyframes as any[];

describe('animateText(): one text layer per piece', () => {
  it('makes a named text layer for every visible character, centred on its own spot', () => {
    const out = animateText('AB C', style, { x: 100, y: 50, duration: 4, name: 'title', in: false }) as any[];
    expect(out.map(l => [l.type, l.name, l.text])).toEqual([['text', 'title-0', 'A'], ['text', 'title-1', 'B'], ['text', 'title-2', 'C']]);
    expect(out[0].style).toEqual(style);
    expect(out[0].initial).toMatchObject({ anchorX: 0.5, anchorY: 0.5, x: 105, y: 62 });     // the piece's left + half its width, top + half the line
    expect(out[2].initial).toMatchObject({ x: 135, y: 62 });                                // 'C' starts at 30
  });

  it('by words and lines, align and an empty text', () => {
    expect(animateText('AB CD', style, { by: 'words', duration: 3, in: false }).map((l: any) => l.text)).toEqual(['AB', 'CD']);
    expect(animateText('AB\nCDEF', style, { by: 'lines', duration: 3, in: false }).map((l: any) => l.text)).toEqual(['AB', 'CDEF']);
    const c = animateText('AB', style, { x: 100, align: 'center', duration: 3, in: false }) as any[];
    expect(c.map(l => l.initial.x)).toEqual([95, 105]);
    expect(animateText('', style, { duration: 3 })).toEqual([]);
  });

  it('the name defaults to "text"', () => {
    expect((animateText('A', style, { duration: 2, in: false })[0] as any).name).toBe('text-0');
  });
});

describe('animateText(): timing', () => {
  it('pieces start one after the other (stagger) and all end together at `at + duration`', () => {
    const out = animateText('ABCD', style, { at: 1, duration: 5, in: 'fade', stagger: { each: 0.1 } }) as any[];
    expect(out.map(l => l.at)).toEqual([1, 1.1, 1.2, 1.3].map(v => expect.closeTo(v, 6)));
    for (const l of out) expect(l.at + l.duration).toBeCloseTo(6, 6);
  });

  it('the default wave is 0.04 s apart from the start; from: center works like stagger()', () => {
    const d = animateText('ABC', style, { duration: 3, in: 'fade' }) as any[];
    expect(d.map(l => l.at)).toEqual([0, 0.04, 0.08].map(v => expect.closeTo(v, 6)));
    const c = animateText('ABC', style, { duration: 3, in: 'fade', stagger: { each: 0.1, from: 'center' } }) as any[];
    expect(c.map(l => l.at)).toEqual([0.1, 0, 0.1].map(v => expect.closeTo(v, 6)));
  });
});

describe('animateText(): in', () => {
  it('a preset is an explicit from → to tween, measured from the start of the piece (`rise`: up from below, fading in)', () => {
    const l = animateText('A', style, { y: 50, duration: 4, in: 'rise' })[0] as any;
    expect(kf(l)).toHaveLength(1);
    expect(kf(l)[0]).toMatchObject({ at: 0, from: { y: 62 + 40, alpha: 0 }, to: { y: 62, alpha: 1 }, duration: 0.5, ease: 'back.out(2)' });
  });

  it('the default is `rise`; every named preset exists', () => {
    expect(kf(animateText('A', style, { duration: 4 })[0])[0].from.alpha).toBe(0);
    for (const p of ['rise', 'drop', 'fade', 'pop', 'zoom', 'slide', 'spin']) {
      const l = animateText('A', style, { duration: 4, in: p as never })[0] as any;
      expect(kf(l)[0].from, p).toBeTruthy();
    }
  });

  it('your own from / to / duration / ease: x and y in `from` are offsets from the resting place; the rest are absolute', () => {
    const l = animateText('A', style, { x: 100, y: 50, duration: 4, in: { from: { x: -30, scale: 0.5, rotation: 20 }, duration: 0.8, ease: 'power3.out' } })[0] as any;
    expect(kf(l)[0]).toMatchObject({ from: { x: 105 - 30, scale: 0.5, rotation: 20 }, to: { x: 105, scale: 1, rotation: 0 }, duration: 0.8, ease: 'power3.out' });
  });

  it('a preset with overrides', () => {
    const l = animateText('A', style, { duration: 4, in: { preset: 'rise', duration: 0.9, from: { y: 100 } } })[0] as any;
    expect(kf(l)[0]).toMatchObject({ duration: 0.9, from: { y: 12 + 100, alpha: 0 } });
  });

  it('in: false has no entrance at all', () => {
    expect(kf(animateText('A', style, { duration: 4, in: false })[0])).toEqual([]);
  });
});

describe('animateText(): out', () => {
  it('leaves in the same wave and finishes with the last piece exactly at the end', () => {
    const out = animateText('ABC', style, { duration: 6, in: 'fade', out: 'fade', stagger: { each: 0.1 } }) as any[];
    const o = out.map(l => kf(l).at(-1));
    expect(o.map(k => k.at)).toEqual([-(0.5 + 0.2), -(0.5 + 0.1), -0.5].map(v => expect.closeTo(v, 6)));
    expect(o[0]).toMatchObject({ from: { alpha: 1 }, to: { alpha: 0 }, duration: 0.5 });
    expect(o[0].ease).toBe('power1.in');                    // the entrance eased out, so the exit eases in
  });

  it('is the entrance run backwards: `rise` out goes back down', () => {
    const l = animateText('A', style, { y: 50, duration: 6, in: 'rise', out: 'rise' })[0] as any;
    expect(kf(l).at(-1)).toMatchObject({ from: { y: 62, alpha: 1 }, to: { y: 62 + 40, alpha: 0 } });
  });

  it('an exit without an entrance works too', () => {
    const l = animateText('A', style, { duration: 3, in: false, out: 'fade' })[0] as any;
    expect(kf(l)).toHaveLength(1);
    expect(kf(l)[0].at).toBeLessThan(0);
  });
});

describe('animateText(): idle', () => {
  it('a seeded wiggle fills the time between the entrance and the exit, each piece its own', () => {
    const out = animateText('AB', style, { y: 50, duration: 8, in: 'fade', out: 'fade', stagger: { each: 0.1 }, idle: { y: 4, rotation: 1, freq: 1, seed: 2 } }) as any[];
    const k0 = kf(out[0]), k1 = kf(out[1]);
    const first = k0.find((k, i) => i > 0 && k.set);
    expect(first.at).toBeCloseTo(0.5, 6);                   // right after the entrance
    expect(first.set).toEqual({ y: 62, rotation: 0 });
    expect(k0).not.toEqual(k1.map((k: any) => ({ ...k })));
    // the last idle step ends where the exit begins (piece 0: len 8, exit starts 8 - 0.5 - 0.1 = 7.4)
    const idleSteps = k0.filter(k => k.to && k.at >= 0.5 && k.at < 7.4);
    expect(idleSteps.length).toBeGreaterThan(3);
    const last = idleSteps.at(-1);
    expect(last.at + last.duration).toBeCloseTo(7.4, 6);
    const again = animateText('AB', style, { y: 50, duration: 8, in: 'fade', out: 'fade', stagger: { each: 0.1 }, idle: { y: 4, rotation: 1, freq: 1, seed: 2 } }) as any[];
    expect(again).toEqual(out);                             // seeded: the same every time
  });

  it('skips the idle when there is no room for it', () => {
    const l = animateText('A', style, { duration: 1.2, in: 'fade', out: 'fade', idle: { y: 4 } })[0] as any;
    expect(kf(l).filter(k => k.set)).toEqual([]);
  });
});

describe('animateText(): styleFor', () => {
  it('lets each piece have its own style', () => {
    const out = animateText('AB', style, { duration: 3, in: false, styleFor: p => (p.index === 0 ? { fill: '#ff0000' } : {}) }) as any[];
    expect(out[0].style).toEqual({ fontSize: 20, fill: '#ff0000' });
    expect(out[1].style).toEqual({ fontSize: 20 });
  });
});

describe('animateText(): mistakes are said out loud', () => {
  it('needs a duration, and enough of it for the wave', () => {
    expect(() => animateText('A', style, {} as never)).toThrow(/duration/);
    expect(() => animateText('ABCDE', style, { duration: 0.6, in: 'fade', stagger: { each: 0.2 } })).toThrow(/duration 0\.6.*at least 1\.3/s);
    expect(() => animateText('A', style, { duration: 1, in: 'fade', out: 'fade' })).not.toThrow();
    expect(() => animateText('A', style, { duration: 0.9, in: 'fade', out: 'fade' })).toThrow(/at least 1/);
  });

  it('an unknown preset names the real ones', () => {
    expect(() => animateText('A', style, { duration: 3, in: 'rize' as never })).toThrow(/"rize".*"rise"/s);
  });

  it('a property with no resting value needs a `to`', () => {
    expect(() => animateText('A', style, { duration: 3, in: { from: { skewX: 30 } } })).toThrow(/skewX/);
    expect(() => animateText('A', style, { duration: 3, in: { from: { skewX: 30 }, to: { skewX: 0 } } })).not.toThrow();
  });

  it('warns about a misspelt option', () => {
    animateText('A', style, { duration: 3, in: false, staggr: { each: 0.1 } } as never);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/staggr.*stagger/s));
  });
});
