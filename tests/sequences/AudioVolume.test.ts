import { describe, it, expect, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const m = (await import('../space/mockPixi')).createPixiMock();
  return m;
});
import { AudioSequence } from '../../src/sequences/Audio';
import { mixdown } from '../../src/core/AudioMixer';
import type { AudioDescriptor, CompositionShape, SequenceSpec } from '../../src/types';
import { Assets } from 'pixi.js';

const SR = 44100;
const comp: CompositionShape = { width: 1280, height: 720, duration: 10 };

/** Render an audio layer of constant amplitude 1 through the real mixer, return its level at `times` seconds. */
async function levels(spec: Record<string, unknown>, times: number[], total = 10): Promise<number[]> {
  const probe = new OfflineAudioContext(1, SR, SR);
  const buffer = probe.createBuffer(1, SR * total, SR);
  buffer.getChannelData(0).fill(1);
  (Assets as unknown as { get: unknown }).get = async () => ({ audioBuffer: buffer, duration: total });
  const seq = new AudioSequence({ type: 'audio', asset: 'a', loop: true, ...spec } as unknown as SequenceSpec, comp, comp);
  await seq.build();
  const out: AudioDescriptor[] = [];
  seq.collectAudio(out, 0);
  const mixed = await mixdown(out, total, SR);
  const data = mixed!.getChannelData(0);
  return times.map(t => data[Math.min(data.length - 1, Math.floor(t * SR))]);
}

describe('audio volume keyframes follow the same rules as every other keyframe', () => {
  it('the documented fade in + fade out: a `to` ramps from ITS OWN time, holding the value until then', async () => {
    const [in1, mid, endHold, fade, last] = await levels({
      duration: 10, volume: 0,
      keyframes: [
        { at: 0, to: { volume: 1 }, duration: 2 },
        { at: -2, to: { volume: 0 }, duration: 2 },
      ],
    }, [1, 4, 7.9, 9, 9.99]);
    expect(in1).toBeCloseTo(0.5, 1);
    expect(mid).toBeCloseTo(1, 2);
    expect(endHold).toBeCloseTo(1, 2);        // still full until the fade starts at 8 s
    expect(fade).toBeCloseTo(0.5, 1);
    expect(last).toBeLessThan(0.02);
  });

  it('`set` is a jump at its time, not a ramp towards it', async () => {
    const [before, justBefore, after] = await levels({
      duration: 10, volume: 1, keyframes: [{ at: 3, set: { volume: 0 } }],
    }, [2, 2.95, 3.05]);
    expect(before).toBeCloseTo(1, 2);
    expect(justBefore).toBeCloseTo(1, 2);
    expect(after).toBeCloseTo(0, 2);
  });

  it('keyframes are applied in time order, not array order', async () => {
    const [a, b, c] = await levels({
      duration: 10, volume: 1,
      keyframes: [
        { at: 6, set: { volume: 0.2 } },
        { at: 2, set: { volume: 0.6 } },
      ],
    }, [1, 4, 8]);
    expect(a).toBeCloseTo(1, 2);
    expect(b).toBeCloseTo(0.6, 2);
    expect(c).toBeCloseTo(0.2, 2);
  });

  it('from + to starts at its own time too', async () => {
    const [before, mid, after] = await levels({
      duration: 10, volume: 1,
      keyframes: [{ at: 4, from: { volume: 0 }, to: { volume: 1 }, duration: 2 }],
    }, [2, 5, 7]);
    expect(before).toBeCloseTo(1, 2);          // the initial volume holds until the keyframe starts
    expect(mid).toBeCloseTo(0.5, 1);
    expect(after).toBeCloseTo(1, 2);
  });
});

describe('audio layer default duration', () => {
  async function durationOf(spec: Record<string, unknown>): Promise<number> {
    const probe = new OfflineAudioContext(1, SR, SR);
    const buffer = probe.createBuffer(1, SR * 0.6, SR);
    (Assets as unknown as { get: unknown }).get = async () => ({ audioBuffer: buffer, duration: 0.6 });
    const seq = new AudioSequence({ type: 'audio', asset: 'a', ...spec } as unknown as SequenceSpec, comp, comp);
    await seq.build();
    return seq.duration!;
  }

  it('a one-shot (no duration, no loop) lasts exactly as long as its clip', async () => {
    expect(await durationOf({ at: 2 })).toBeCloseTo(0.6, 3);
  });

  it('a looping layer with no duration lasts until the composition ends, not one clip length', async () => {
    expect(await durationOf({ at: 2, loop: true })).toBe(8);
    expect(await durationOf({ loop: true })).toBe(10);
  });

  it('an explicit duration always wins', async () => {
    expect(await durationOf({ loop: true, duration: 3 })).toBe(3);
  });
});
