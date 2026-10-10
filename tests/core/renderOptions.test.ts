import { describe, it, expect } from 'vitest';
import { parseBitrate, chooseVideoCodec, isAudioFormat, AUDIO_FORMATS } from '../../src/core/renderOptions';

describe('render options: a bitrate is a quality name or a number of bits a second', () => {
  it('reads quality names, numbers, and "8M" / "800k" / "2.5M" strings', () => {
    expect(parseBitrate('high')).toEqual({ quality: 'high' });
    expect(parseBitrate(8_000_000)).toEqual({ bps: 8_000_000 });
    expect(parseBitrate('8M')).toEqual({ bps: 8_000_000 });
    expect(parseBitrate('800k')).toEqual({ bps: 800_000 });
    expect(parseBitrate('2.5m')).toEqual({ bps: 2_500_000 });
    expect(parseBitrate('6000000')).toEqual({ bps: 6_000_000 });
    expect(parseBitrate(undefined)).toEqual({});
  });
  it('refuses nonsense with what is allowed', () => {
    for (const bad of ['loud', -5, 0, NaN, '8 megabits', '5G', {}]) expect(() => parseBitrate(bad as never), String(bad)).toThrow(/bitrate.*very-low.*8M/s);
  });
});

describe('render options: which video codec to write', () => {
  const only = (...ok: string[]) => async (c: string) => ok.includes(c);

  it('uses the format\'s usual codec when this browser can encode it (avc for mp4, vp9 for webm)', async () => {
    expect(await chooseVideoCodec({ fmt: 'mp4', canEncode: only('avc', 'hevc') })).toEqual({ codec: 'avc' });
    expect(await chooseVideoCodec({ fmt: 'webm', canEncode: only('vp9', 'av1') })).toEqual({ codec: 'vp9' });
  });

  it('falls back to the next one that works when the usual one cannot be encoded, and says which', async () => {
    expect(await chooseVideoCodec({ fmt: 'mp4', canEncode: only('hevc', 'vp9') })).toEqual({ codec: 'hevc', fellBackFrom: 'avc' });
  });

  it('a codec you name is never swapped: it is used, or the error says which one would work', async () => {
    expect(await chooseVideoCodec({ fmt: 'mp4', requested: 'hevc', canEncode: only('avc', 'hevc') })).toEqual({ codec: 'hevc' });
    await expect(chooseVideoCodec({ fmt: 'mp4', requested: 'av1', canEncode: only('avc') })).rejects.toThrow(/cannot encode "av1".*mp4.*"avc" would work.*codec: 'avc'/s);
    await expect(chooseVideoCodec({ fmt: 'mp4', requested: 'vp8', canEncode: only('avc', 'vp8') })).rejects.toThrow(/"vp8".*mp4.*avc, hevc, vp9, av1/s);   // a codec the container does not hold
  });

  it('a name that is not a codec gets a did-you-mean', async () => {
    await expect(chooseVideoCodec({ fmt: 'mp4', requested: 'h264', canEncode: only('avc') })).rejects.toThrow(/"h264".*did you mean "avc"/s);
    await expect(chooseVideoCodec({ fmt: 'mp4', requested: 'h265', canEncode: only('hevc') })).rejects.toThrow(/did you mean "hevc"/);
  });

  it('nothing works at all: one sentence that says what was tried', async () => {
    await expect(chooseVideoCodec({ fmt: 'mp4', canEncode: only() })).rejects.toThrow(/no video encoder for mp4.*avc, hevc, vp9, av1/s);
  });
});

describe('render options: audio-only formats', () => {
  it('wav and ogg are the audio formats', () => {
    expect(AUDIO_FORMATS).toEqual(['wav', 'ogg']);
    expect(isAudioFormat('wav')).toBe(true);
    expect(isAudioFormat('ogg')).toBe(true);
    expect(isAudioFormat('mp4')).toBe(false);
  });
});
