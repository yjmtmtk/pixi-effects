import { describe, it, expect, vi } from 'vitest';
import { particles } from '../../src/presets/particles';

const kf = (l: any) => l.keyframes as any[];
const base = { count: 10, life: 2, area: { x: 100, y: 200 } };
const close = (a: number, b: number, d = 6) => expect(a).toBeCloseTo(b, d);

describe('particles(): layers, timing and seeds', () => {
  it('makes `count` named shape layers (circles by default) at the emitter point', () => {
    const out = particles({ ...base, name: 'spark' }) as any[];
    expect(out).toHaveLength(10);
    expect(out.map(l => l.name).slice(0, 2)).toEqual(['spark-0', 'spark-1']);
    expect(out[0]).toMatchObject({ type: 'shape', shape: 'circle' });
    expect(out[0].initial).toMatchObject({ x: 100, y: 200 });
    expect((particles(base)[0] as any).name).toBe('particle-0');
  });

  it('a burst is born all at once; `emit` spreads the births over that many seconds; `life` may be a range', () => {
    const burst = particles({ ...base, at: 1 }) as any[];
    expect(new Set(burst.map(l => l.at))).toEqual(new Set([1]));
    const stream = particles({ ...base, count: 40, at: 1, emit: 3 }) as any[];
    expect(Math.min(...stream.map(l => l.at))).toBeGreaterThanOrEqual(1);
    expect(Math.max(...stream.map(l => l.at))).toBeLessThanOrEqual(4);
    expect(new Set(stream.map(l => l.at)).size).toBeGreaterThan(20);
    const lives = (particles({ ...base, count: 40, life: [1, 3] }) as any[]).map(l => l.duration);
    expect(Math.min(...lives)).toBeGreaterThanOrEqual(1);
    expect(Math.max(...lives)).toBeLessThanOrEqual(3);
    expect(new Set(lives).size).toBeGreaterThan(20);
  });

  it('is deterministic: the same seed gives the same particles, another seed other ones', () => {
    const a = particles({ ...base, seed: 3 }), b = particles({ ...base, seed: 3 }), c = particles({ ...base, seed: 4 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('a rectangle area spreads the starting points over it (centred on x, y)', () => {
    const out = particles({ ...base, count: 60, area: { x: 500, y: 300, width: 200, height: 100 } }) as any[];
    const xs = out.map(l => l.initial.x), ys = out.map(l => l.initial.y);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(400); expect(Math.max(...xs)).toBeLessThanOrEqual(600);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(250); expect(Math.max(...ys)).toBeLessThanOrEqual(350);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
  });
});

describe('particles(): motion', () => {
  const straight = { count: 1, life: 2, area: { x: 100, y: 200 }, angle: 0, speed: 100 };

  it('with no gravity, drag or sway a particle is one straight tween at constant velocity', () => {
    const l = particles(straight)[0] as any;
    const move = kf(l).filter(k => k.to && 'x' in k.to);
    expect(move).toHaveLength(1);
    expect(move[0]).toMatchObject({ at: 0, duration: 2, ease: 'none' });
    close(move[0].to.x, 300); close(move[0].to.y, 200);
  });

  it('angle: 0 is right, 90 down, −90 up (degrees, like rotation)', () => {
    const end = (angle: number) => { const l = particles({ ...straight, angle }, ) [0] as any; const m = kf(l).find(k => k.to && 'x' in k.to); return [m.to.x, m.to.y]; };
    const up = end(-90), down = end(90);
    close(up[0], 100); close(up[1], 0);
    close(down[0], 100); close(down[1], 400);
  });

  it('gravity bends the path: sampled positions follow y = y0 + vy·t + ½·g·t²', () => {
    const l = particles({ ...straight, angle: -90, gravity: 200, sampleRate: 4 }) as any;
    const moves = kf(l[0]).filter(k => k.to && 'y' in k.to);
    expect(moves).toHaveLength(8);                                    // 2 s × 4 samples
    for (const m of moves) {
      const t = m.at + m.duration;
      close(m.to.y, 200 + -100 * t + 0.5 * 200 * t * t, 4);
      close(m.to.x, 100, 4);
    }
    expect(moves.every(m => m.ease === 'none')).toBe(true);
  });

  it('wind pushes sideways', () => {
    const m = kf(particles({ ...straight, speed: 0, wind: 50, sampleRate: 2 })[0]).filter(k => k.to && 'x' in k.to).at(-1);
    close(m.to.x, 100 + 0.5 * 50 * 4, 4);
  });

  it('drag slows it down toward a terminal speed (exponential)', () => {
    const k = 2;
    const m = kf(particles({ ...straight, drag: k, sampleRate: 2 })[0]).filter(x => x.to && 'x' in x.to).at(-1);
    close(m.to.x, 100 + (100 / k) * (1 - Math.exp(-k * 2)), 4);
    const g = kf(particles({ ...straight, angle: 90, speed: 0, gravity: 100, drag: 1, sampleRate: 1 })[0]).filter(x => x.to && 'y' in x.to).at(-1);
    const t = 2, vInf = 100;                                         // a / k
    close(g.to.y, 200 + vInf * t + (0 - vInf) * (1 - Math.exp(-t)) / 1, 4);
  });

  it('sway wobbles x smoothly around the path and starts exactly at the birth point', () => {
    const l = particles({ ...straight, speed: 0, sway: { amp: 20, freq: 1 }, sampleRate: 10 }) as any;
    const xs = kf(l[0]).filter(k => k.to && 'x' in k.to).map(k => k.to.x);
    expect(Math.max(...xs.map(x => Math.abs(x - 100)))).toBeGreaterThan(2);
    expect(Math.max(...xs.map(x => Math.abs(x - 100)))).toBeLessThanOrEqual(40.0001);
    expect(l[0].initial.x).toBe(100);
  });

  it('spin turns it at a steady rate (and starts at a random angle)', () => {
    const l = particles({ ...straight, spin: 90 })[0] as any;
    const r = kf(l).find(k => k.to && 'rotation' in k.to);
    expect(r).toMatchObject({ at: 0, duration: 2, ease: 'none' });
    close(r.to.rotation - l.initial.rotation, 180);
    expect('rotation' in particles(straight)[0]!.initial!).toBe(false);
  });
});

describe('particles(): look', () => {
  it('size is the radius (a range is random per particle), scale animates over the life', () => {
    const out = particles({ ...base, count: 30, size: [4, 8] }) as any[];
    const r = out.map(l => l.radius);
    expect(Math.min(...r)).toBeGreaterThanOrEqual(4); expect(Math.max(...r)).toBeLessThanOrEqual(8); expect(new Set(r).size).toBeGreaterThan(10);
    const s = particles({ ...base, scale: [1, 0] })[0] as any;
    expect(s.initial.scale).toBe(1);
    expect(kf(s).find(k => k.to && 'scale' in k.to)).toMatchObject({ at: 0, duration: 2, to: { scale: 0 }, ease: 'none' });
  });

  it('fade in and out are alpha tweens at the start and at the end', () => {
    const l = particles({ ...base, fade: { in: 0.2, out: 0.5 } })[0] as any;
    expect(l.initial.alpha).toBe(0);
    expect(kf(l).find(k => k.to && k.to.alpha === 1)).toMatchObject({ at: 0, duration: 0.2 });
    expect(kf(l).find(k => k.to && k.to.alpha === 0)).toMatchObject({ at: -0.5, duration: 0.5, from: { alpha: 1 } });
  });

  it('colours are picked from the list (seeded)', () => {
    const out = particles({ ...base, count: 40, colors: ['#ff0000', '#00ff00', '#0000ff'] }) as any[];
    const used = new Set(out.map(l => l.initial.fillColor));
    expect(used).toEqual(new Set(['#ff0000', '#00ff00', '#0000ff']));
  });

  it('shapes: circle, rect (a square of the size) and star (ten points)', () => {
    const rect = particles({ ...base, shape: 'rect', size: 5 })[0] as any;
    expect(rect).toMatchObject({ shape: 'rect', width: 10, height: 10 });
    const star = particles({ ...base, shape: 'star', size: 6 })[0] as any;
    expect(star.shape).toBe('polygon');
    expect(star.points).toHaveLength(10);
  });

  it('a template layer (any type) is used instead of a shape, with its own keyframes kept', () => {
    const t = { type: 'image', asset: 'petal', keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.1 }], blendMode: 'add' };
    const l = particles({ ...base, template: t as never })[0] as any;
    expect(l).toMatchObject({ type: 'image', asset: 'petal', blendMode: 'add', name: 'particle-0' });
    expect(kf(l)[0]).toEqual(t.keyframes[0]);
    expect(kf(l).some(k => k.to && 'x' in k.to)).toBe(true);
    expect(l.initial).toMatchObject({ x: 100, y: 200 });
  });

  it('blendMode passes through to shapes', () => {
    expect((particles({ ...base, blendMode: 'add' })[0] as any).blendMode).toBe('add');
  });
});

describe('particles(): mistakes are said out loud', () => {
  it('rejects what cannot work, naming the option', () => {
    expect(() => particles({ ...base, count: 0 })).toThrow(/count/);
    expect(() => particles({ ...base, count: 1.5 })).toThrow(/count/);
    expect(() => particles({ ...base, life: 0 })).toThrow(/life/);
    expect(() => particles({ ...base, life: [3, 1] })).toThrow(/life/);
    expect(() => particles({ ...base, area: undefined as never })).toThrow(/area/);
    expect(() => particles({ ...base, shape: 'blob' as never })).toThrow(/shape.*"blob"/s);
    expect(() => particles({ ...base, emit: -1 })).toThrow(/emit/);
    expect(() => particles({ ...base, sampleRate: 0 })).toThrow(/sampleRate/);
  });

  it('refuses to bake an absurd number of keyframes, saying how to cut it', () => {
    expect(() => particles({ ...base, count: 1000, life: 10, gravity: 100 })).toThrow(/too many keyframes.*sampleRate/s);
  });

  it('warns about a misspelt option', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    particles({ ...base, graviti: 10 } as never);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/graviti.*gravity/s));
    warn.mockRestore();
  });
});
