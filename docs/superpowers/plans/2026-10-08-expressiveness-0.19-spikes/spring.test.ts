// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { gsap } from 'gsap';
import { springEase, springResponse, springDuration, registerSpringEases, kfDuration, checkEase, parseSpring } from '../../src/core/spring';

registerSpringEases();

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

  it('GSAP resolves spring(m,k,c), spring and the named presets; a seeked timeline is the same going back and forth', () => {
    const a = gsap.parseEase('spring(1, 170, 12)') as (p: number) => number;
    const b = springEase({ mass: 1, stiffness: 170, damping: 12 });
    expect(a(0.37)).toBe(b(0.37));
    expect(gsap.parseEase('spring.bouncy')(0.3)).toBe(springEase({ mass: 1, stiffness: 170, damping: 10 })(0.3));
    expect(gsap.parseEase('spring')(0.3)).toBe(springEase()(0.3));

    const o = { x: 0 };
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    tl.fromTo(o, { x: 100 }, { x: 300, duration: 1.2, ease: 'spring(1, 170, 12)' }, 0.5);
    const times = [0, 0.5, 0.7, 0.9, 1.1, 1.4, 1.7, 2.5];
    const fwd = times.map(t => { tl.seek(t); return o.x; });
    const back = [...times].reverse().map(t => { tl.seek(t); return o.x; }).reverse();
    expect(back).toEqual(fwd);
    expect(fwd[0]).toBe(100);                                       // `from` is applied before the keyframe starts
    expect(fwd[fwd.length - 1]).toBe(300);
    expect(Math.max(...fwd)).toBeGreaterThan(300);                  // overshoot
  });

  it("duration: 'auto' is the settle time; a malformed spring or an unknown ease warns", () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(kfDuration({ duration: 'auto', ease: 'spring(1, 170, 12)' })).toBeCloseTo(springDuration({ mass: 1, stiffness: 170, damping: 12 }), 3);
    expect(kfDuration({ duration: 0.7 })).toBe(0.7);
    expect(warn).not.toHaveBeenCalled();
    expect(kfDuration({ duration: 'auto', ease: 'power2.out' })).toBe(0.5);
    expect(warn).toHaveBeenCalledTimes(1);
    checkEase('spring(1, 170');   checkEase('spring(1, -5, 3)');   checkEase('spring.floppy');   checkEase('power9.out');   checkEase('power3.out');   checkEase('spring(1,170,26)');
    expect(warn).toHaveBeenCalledTimes(5);
    expect(parseSpring('spring(1,170')).toBeNull();
    warn.mockRestore();
  });
});
