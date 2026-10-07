import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('pixi.js', async () => (await import('./mockPixi')).createPixiMock());

import { gsap } from 'gsap';
import { wiggle } from '../../src/presets/wiggle';
import { CameraSequence } from '../../src/space/CameraSequence';
import { homeDistance } from '../../src/space/math';
import type { CompositionShape, SequenceSpec } from '../../src/types';

const shape: CompositionShape = { width: 1280, height: 720, duration: 10 };
const make = (spec: Record<string, unknown> = {}) =>
  new CameraSequence({ type: 'camera', ...spec } as unknown as SequenceSpec, shape, shape);

beforeEach(() => { vi.restoreAllMocks(); });

describe('CameraSequence', () => {
  it('builds a display-less carrier seeded with the home camera', async () => {
    const cam = make();
    await cam.build();
    const s = cam.state();
    expect(s.x).toBe(640);
    expect(s.y).toBe(360);
    expect(s.lookAtX).toBe(640);
    expect(s.lookAtY).toBe(360);
    expect(s.lookAtZ).toBe(0);
    expect(s.fov).toBe(40);
    expect(s.z).toBeCloseTo(homeDistance(720, 40), 9);
    expect(cam.duration).toBe(10);
  });

  it('z is auto when never specified: it follows fov so the z=0 plane stays 1:1', async () => {
    const cam = make({ keyframes: [{ at: 0, to: { fov: 70 }, duration: 1 }] });
    await cam.build();
    expect(cam.autoZ).toBe(true);
    (cam.target as unknown as { fov: number }).fov = 70;
    expect(cam.state().z).toBeCloseTo(homeDistance(720, 70), 9);
  });

  it('z is manual when specified in initial or any keyframe', async () => {
    const a = make({ initial: { z: 900 } });
    await a.build();
    expect(a.autoZ).toBe(false);
    const b = make({ keyframes: [{ at: 1, to: { z: 500 }, duration: 1 }] });
    await b.build();
    expect(b.autoZ).toBe(false);
  });

  it('manual z reads the carrier value', async () => {
    const cam = make({ initial: { z: 900 } });
    await cam.build();
    (cam.target as unknown as { z: number }).z = 450;
    expect(cam.state().z).toBe(450);
  });

  it('clamps fov to [1, 179] with a single warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cam = make({ name: 'main' });
    await cam.build();
    (cam.target as unknown as { fov: number }).fov = 500;
    expect(cam.state().fov).toBe(179);
    cam.state();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('fov');
  });

  it('FIX: warns once when lookAt equals the camera position, and still returns a state', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cam = make({ name: 'main', initial: { z: 0 } });   // manual z = 0 = default lookAtZ
    await cam.build();
    const c = cam.target as unknown as { x: number; y: number; z: number; lookAtX: number; lookAtY: number };
    c.x = c.lookAtX = 640; c.y = c.lookAtY = 360; c.z = 0;   // initial.z is applied at bindTimeline; set it directly here
    cam.state();
    cam.state();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toContain('lookAt');
  });

  it('window() is [absoluteStart, absoluteStart + duration)', async () => {
    const cam = make({ at: 2, duration: 3 });
    await cam.build();
    cam.absoluteStart = 7;
    expect(cam.window()).toEqual({ start: 7, end: 10 });
  });

  it('offsetX / offsetY / offsetZ and lookOffsetX / lookOffsetY / lookOffsetZ are added to the camera, so a shake never collides with its moves', async () => {
    const cam = make({ initial: { z: 900 } });
    await cam.build();
    const c = cam.target as unknown as Record<string, number>;
    c.x = 700; c.y = 300; c.z = 800; c.lookAtX = 640; c.lookAtY = 360; c.lookAtZ = 0;
    c.offsetX = 5; c.offsetY = -3; c.offsetZ = 12; c.lookOffsetX = 2; c.lookOffsetY = 4; c.lookOffsetZ = 1;
    expect(cam.state()).toMatchObject({ x: 705, y: 297, z: 812, lookAtX: 642, lookAtY: 364, lookAtZ: 1 });
    c.offsetX = c.offsetY = c.offsetZ = c.lookOffsetX = c.lookOffsetY = c.lookOffsetZ = 0;
    expect(cam.state()).toMatchObject({ x: 700, y: 300, z: 800, lookAtX: 640, lookAtY: 360, lookAtZ: 0 });
  });

  it('with an automatic z the offset is added to the distance that follows fov', async () => {
    const cam = make();
    await cam.build();
    (cam.target as unknown as { offsetZ: number }).offsetZ = 20;
    expect(cam.state().z).toBeCloseTo(homeDistance(720, 40) + 20, 9);
  });

  it('the offsets are animatable like any camera prop (they are on the carrier from the start)', async () => {
    const cam = make({ keyframes: [{ at: 0, to: { offsetX: 10 }, duration: 1 }] });
    await cam.build();
    const c = cam.target as unknown as Record<string, number>;
    for (const k of ['offsetX', 'offsetY', 'offsetZ', 'lookOffsetX', 'lookOffsetY', 'lookOffsetZ']) expect(c[k], k).toBe(0);
  });

  it('a handheld shake (wiggle on the offsets) rides on top of a dolly: both are in the state at once, and the shake ends at rest', async () => {
    const cam = make({
      initial: { z: 1000 },
      keyframes: [{ at: 0, to: { z: 600 }, duration: 4, ease: 'none' }, ...wiggle({ duration: 4, freq: 6, seed: 3, ease: 'none', props: { offsetX: { around: 0, amp: 8 }, offsetY: { around: 0, amp: 5 } } })],
    });
    await cam.build();
    const tl = gsap.timeline({ paused: true });
    cam.bindTimeline(tl, 0);
    let moved = 0;
    for (const t of [0.5, 1, 2, 3]) {
      tl.time(t);
      const s = cam.state();
      expect(s.z, `z at ${t}s follows the dolly`).toBeCloseTo(1000 - 100 * t, 6);                // the dolly is not overwritten by the shake
      if (Math.abs(s.x - 640) > 0.01) moved++;
    }
    expect(moved).toBeGreaterThanOrEqual(3);                                                      // and the shake is really in x
    tl.time(4);
    const end = cam.state();
    expect(end.x).toBeCloseTo(640, 6);
    expect(end.y).toBeCloseTo(360, 6);
    expect(end.z).toBeCloseTo(600, 6);
  });
});
