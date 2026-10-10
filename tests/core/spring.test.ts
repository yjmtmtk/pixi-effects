// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { pureEase } from '../../src/core/pure/ease';
import { springEase, springResponse, springDuration, kfDuration, parseSpring, springProblem, SPRING_PRESETS } from '../../src/core/spring';
import { checkEase, __resetEaseWarnings } from '../../src/core/ease';
import { stagger } from '../../src/presets/stagger';
import { createTimeline } from '../../src/core/timelineEngine';


const CASES = {
  under: { mass: 1, stiffness: 170, damping: 12 },
  crit: { mass: 1, stiffness: 170, damping: 2 * Math.sqrt(170) },
  over: { mass: 1, stiffness: 170, damping: 40 },
  heavy: { mass: 3, stiffness: 50, damping: 4 },
};

describe('spring ease', () => {
  it('ends exactly at 0 and 1; under-damped overshoots, critical / over-damped never do', () => {
    for (const [name, p] of Object.entries(CASES)) {
      const f = springEase(p);
      let max = -Infinity;
      for (let i = 0; i <= 1000; i++) max = Math.max(max, f(i / 1000));
      expect(f(0)).toBe(0);
      expect(f(1)).toBe(1);
      if (name === 'under' || name === 'heavy') expect(max).toBeGreaterThan(1.05);
      else expect(max).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('is a pure function: same input, same output; a backwards sweep equals the forwards sweep', () => {
    for (const p of Object.values(CASES)) {
      const f = springEase(p), g = springEase(p);
      const fwd: number[] = [];
      for (let i = 0; i <= 600; i++) fwd.push(f(i / 600));
      const back: number[] = [];
      for (let i = 600; i >= 0; i--) back.unshift(g(i / 600));
      expect(back).toEqual(fwd);                                    // bit-identical
    }
  });

  it('springDuration: the error is above 0.5 % just before and below it from then on; the response matches a numeric integration', () => {
    for (const p of Object.values(CASES)) {
      const T = springDuration(p);
      const full = { ...p };
      expect(Math.abs(1 - springResponse(T * 0.999, full))).toBeGreaterThan(0.005 - 1e-4);
      for (let i = 0; i <= 2000; i++) expect(Math.abs(1 - springResponse(T * (1 + i / 400), full))).toBeLessThanOrEqual(0.005 + 1e-9);
      // semi-implicit Euler with a tiny step as an independent reference
      let x = 0, v = 0; const dt = 1e-5; const steps = Math.round(T / dt);
      for (let i = 0; i < steps; i++) { v += (-(p.stiffness / p.mass) * (x - 1) - (p.damping / p.mass) * v) * dt; x += v * dt; }
      expect(x).toBeCloseTo(springResponse(steps * dt, full), 3);
    }
  });

  it('the names spring(m,k,c), spring and the presets run our spring; a seeked timeline is the same going back and forth', () => {
    const a = pureEase('spring(1, 170, 12)');
    const b = springEase({ mass: 1, stiffness: 170, damping: 12 });
    expect(a(0.37)).toBe(b(0.37));
    expect(pureEase('spring.bouncy')(0.3)).toBe(springEase({ mass: 1, stiffness: 170, damping: 10 })(0.3));
    expect(pureEase('spring')(0.3)).toBe(springEase()(0.3));

    const o = { x: 0 };
    const tl = createTimeline({ paused: true, defaults: { ease: 'none' } });
    tl.fromTo(o, { x: 100 }, { x: 300, duration: 1.2, ease: 'spring(1, 170, 12)' }, 0.5);
    const times = [0, 0.5, 0.7, 0.9, 1.1, 1.4, 1.7, 2.5];
    const fwd = times.map(t => { tl.seek(t); return o.x; });
    const back = [...times].reverse().map(t => { tl.seek(t); return o.x; }).reverse();
    expect(back).toEqual(fwd);
    expect(fwd[0]).toBe(100);                                       // `from` is applied before the keyframe starts
    expect(fwd[fwd.length - 1]).toBe(300);
    expect(Math.max(...fwd)).toBeGreaterThan(300);                  // overshoot
  });

  it('parseSpring reads the three forms and refuses a malformed one', () => {
    expect(parseSpring('spring(1, 170, 12)')).toEqual({ mass: 1, stiffness: 170, damping: 12 });
    expect(parseSpring('spring.bouncy')).toEqual(SPRING_PRESETS.bouncy);
    expect(parseSpring('spring')).toEqual({ mass: 1, stiffness: 100, damping: 10 });
    expect(parseSpring('spring(1,170')).toBeNull();
  });
});

describe('spring: mistakes are said out loud', () => {
  it('springProblem names what is wrong, or is null for a good spring', () => {
    expect(springProblem('spring')).toBeNull();
    expect(springProblem('spring(1, 170, 12)')).toBeNull();
    expect(springProblem('spring.bouncy')).toBeNull();
    expect(springProblem('spring(1, 170')).toMatch(/expected "spring\(mass, stiffness, damping\)"/);
    expect(springProblem('spring(1,-5,3)')).toMatch(/greater than 0/);
    expect(springProblem('spring.floppy')).toMatch(/no preset "floppy".*gentle/);
  });
  it('checkEase says it once per name, with the spring reason, and is quiet for a good spring', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); __resetEaseWarnings();
    checkEase('spring.bouncy', 'x'); checkEase('spring(1, 170, 12)', 'x');
    expect(warn).not.toHaveBeenCalled();
    checkEase('spring.floppy', 'layer "a"'); checkEase('spring.floppy', 'layer "a"');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toMatch(/layer "a".*spring\.floppy.*no preset "floppy"/s);
    warn.mockRestore();
  });
  it("duration 'auto' is the time the spring takes to settle; without a spring ease it warns and uses 0.5 s", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(kfDuration({ duration: 'auto', ease: 'spring.bouncy' })).toBeCloseTo(1.08, 1);
    expect(kfDuration({ duration: 2 })).toBe(2);
    expect(kfDuration({})).toBe(0);
    expect(warn).not.toHaveBeenCalled();
    expect(kfDuration({ duration: 'auto', ease: 'power2.out' })).toBe(0.5);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/'auto' needs a spring ease/));
    warn.mockRestore();
  });
  it("'auto' with a malformed spring does not add a second, misleading warning (checkEase has said it); 'auto' without a spring says it once per ease", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(kfDuration({ duration: 'auto', ease: 'spring.floppy' })).toBe(0.5);
    expect(kfDuration({ duration: 'auto', ease: 'spring(1, 170' })).toBe(0.5);
    expect(warn).not.toHaveBeenCalled();
    kfDuration({ duration: 'auto', ease: 'sine.inOut' }); kfDuration({ duration: 'auto', ease: 'sine.inOut' });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
  it('the presets settle in the measured time (spike: gentle 0.72 s, snappy 0.42 s, bouncy 1.08 s, wobbly 1.61 s, slow 1.29 s)', () => {
    const want: Record<string, number> = { gentle: 0.72, snappy: 0.42, bouncy: 1.08, wobbly: 1.61, slow: 1.29 };
    for (const [n, t] of Object.entries(want)) expect(springDuration(SPRING_PRESETS[n]!), n).toBeCloseTo(t, 1);
  });
  it('stagger keeps its delays inside 0..amount even when the shape ease overshoots (a spring)', () => {
    const d = stagger(8, { each: 0.1, ease: 'spring.wobbly' });
    for (const v of d) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(0.7 + 1e-9); }
    expect(d[0]).toBe(0);
  });
});
