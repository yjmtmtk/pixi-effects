import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('./mockPixi')).createPixiMock());

import { LightSequence } from '../../src/space/LightSequence';
import { homeDistance } from '../../src/space/math';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
const make = (spec: Record<string, unknown> = {}) => new LightSequence({ type: 'light', ...spec } as unknown as SequenceSpec, shape, shape);
type Carrier = Record<string, unknown>;
beforeEach(() => { vi.restoreAllMocks(); });

describe('LightSequence', () => {
  it('builds a display-less carrier with the defaults: up and left of the picture, between it and the camera, looking at the middle', async () => {
    const l = make();
    await l.build();
    const c = l.target as unknown as Carrier;
    expect([c.x, c.y]).toEqual([1280 * 0.3, 720 * 0.2]);
    expect(c.z as number).toBeCloseTo(homeDistance(720, 40) * 0.6, 9);
    expect([c.lookAtX, c.lookAtY, c.lookAtZ]).toEqual([640, 360, 0]);
    expect([c.intensity, c.color, c.coneAngle, c.coneFeather, c.radius, c.falloffDistance, c.shadowDarkness, c.shadowDiffusion])
      .toEqual([1, '#ffffff', 90, 0.5, 500, 500, 1, 0]);
    expect(l.duration).toBe(10);
  });

  it('state(): the kind and falloff default to point and none; castsShadows is a flag; the colour becomes 0..1 channels', async () => {
    const l = make({ initial: { color: '#ff8000' } });
    await l.build();
    (l.target as unknown as Carrier).color = '#ff8000';
    const s = l.state();
    expect([s.kind, s.falloff, s.castsShadows]).toEqual(['point', 'none', false]);
    expect(s.r).toBe(1);
    expect(s.g).toBeCloseTo(128 / 255, 9);
    expect(s.b).toBe(0);
    const spot = make({ kind: 'spot', falloff: 'smooth', castsShadows: true });
    await spot.build();
    expect([spot.state().kind, spot.state().falloff, spot.state().castsShadows]).toEqual(['spot', 'smooth', true]);
  });

  it('state() keeps bad numbers safe: an unreadable colour is white, a negative intensity is 0, shadow darkness is clamped to 0..1, diffusion is not negative', async () => {
    const l = make();
    await l.build();
    const c = l.target as unknown as Carrier;
    c.color = 'not a colour'; c.intensity = -3; c.shadowDarkness = 7; c.shadowDiffusion = -4;
    const s = l.state();
    expect([s.r, s.g, s.b]).toEqual([1, 1, 1]);
    expect(s.intensity).toBe(0);
    expect(s.shadowDarkness).toBe(1);
    expect(s.shadowDiffusion).toBe(0);
    c.shadowDarkness = -1;
    expect(l.state().shadowDarkness).toBe(0);
  });

  it('window() is its lifespan on the timeline: at and duration (the composition\'s length by default)', async () => {
    const l = make({ at: 2, duration: 3 });
    await l.build();
    expect(l.window()).toEqual({ start: 2, end: 5 });
    const whole = make();
    await whole.build();
    expect(whole.window()).toEqual({ start: 0, end: 10 });
  });
});

describe('LightSequence — a kind or falloff nobody knows is the default the warning promises', () => {
  it('an unknown kind is a point light and an unknown falloff is none (the shader must never see NaN)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const l = make({ kind: 'directional', falloff: 'quadratic' });
    await l.build();
    expect([l.state().kind, l.state().falloff]).toEqual(['point', 'none']);
  });
});
