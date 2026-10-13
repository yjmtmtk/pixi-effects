// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { writeTone } from '../support/tone';
import { join, resolve } from 'node:path';
import { Input, ALL_FORMATS, FilePathSource } from 'mediabunny';

const dir = resolve(__dirname, '../fixtures/media');
const open = (name: string) => new Input({ source: new FilePathSource(join(dir, name)), formats: ALL_FORMATS });

describe('the media fixtures (made by scripts/make-media-fixtures.mjs from our own renderer)', () => {
  it('colors.mp4, .webm and .mov: 320x180, 6 s, one video and one audio track; each is under 200 KB', async () => {
    const want: Record<string, [string, string]> = { 'colors.mp4': ['avc', 'aac'], 'colors.webm': ['vp9', 'opus'], 'colors.mov': ['avc', 'aac'] };
    for (const [name, [vc, ac]] of Object.entries(want)) {
      expect(existsSync(join(dir, name)), name).toBe(true);
      expect(statSync(join(dir, name)).size, name).toBeLessThan(200_000);
      const input = open(name);
      expect(Math.abs((await input.computeDuration()) - 6), name).toBeLessThan(0.1);
      const v = await input.getPrimaryVideoTrack(), a = await input.getPrimaryAudioTrack();
      expect([v?.codec, a?.codec], name).toEqual([vc, ac]);
      expect([v!.displayWidth, v!.displayHeight], name).toEqual([320, 180]);
    }
  });

  it('rotated.mp4 is colors.mp4 with rotation 90; video-only.mp4 and audio-only.m4a each have one kind of track', async () => {
    const r = await open('rotated.mp4').getPrimaryVideoTrack();
    expect(r!.rotation).toBe(90);
    const vo = open('video-only.mp4');
    expect(await vo.getPrimaryAudioTrack()).toBeNull();
    expect(await vo.getPrimaryVideoTrack()).not.toBeNull();
    const ao = open('audio-only.m4a');
    expect(await ao.getPrimaryVideoTrack()).toBeNull();
    expect((await ao.getPrimaryAudioTrack())!.codec).toBe('aac');
  });

  it('the first video packets of colors.mp4 are key packets at 0, 2 and 4 s (what a cut by copy has to start from)', async () => {
    const { EncodedPacketSink } = await import('mediabunny');
    const track = await open('colors.mp4').getPrimaryVideoTrack();
    const sink = new EncodedPacketSink(track!);
    const keys: number[] = [];
    for await (const p of sink.packets()) if (p.type === 'key') keys.push(Math.round(p.timestamp * 100) / 100);
    expect(keys.slice(0, 3)).toEqual([0, 2, 4]);
  });

  it('writeTone makes a 4 s stereo 48 kHz PCM WAV that mediabunny reads (the loudness tests use it)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tone-'));
    try {
      const file = join(tmp, 'tone.wav');
      writeTone(file, -20);
      const input = new Input({ source: new FilePathSource(file), formats: ALL_FORMATS });
      expect(Math.abs((await input.computeDuration()) - 4)).toBeLessThan(0.01);
      const a = await input.getPrimaryAudioTrack();
      expect([a!.numberOfChannels, a!.sampleRate]).toEqual([2, 48000]);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  });
});
