import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── mediabunny mock ──────────────────────────────────────────────────────
// Captures every constructor invocation and method call so the Renderer's
// orchestration can be asserted without touching WebCodecs / wasm.

vi.mock('mediabunny', () => {
  const calls = {
    Mp4OutputFormat: [] as unknown[],
    MovOutputFormat: [] as unknown[],
    WebMOutputFormat: [] as unknown[],
    MkvOutputFormat: [] as unknown[],
    BufferTarget: [] as unknown[],
    Output: [] as Array<{ format: unknown; target: unknown }>,
    CanvasSource: [] as Array<{ canvas: unknown; opts: unknown }>,
    AudioBufferSource: [] as unknown[],
    addVideoTrack: [] as Array<{ src: unknown; trackOpts: unknown }>,
    addAudioTrack: [] as unknown[],
    canvasSourceAdds: [] as Array<{ t: number; dt: number; opts: unknown }>,
    audioSourceAdds: [] as unknown[],
    audioSourceOptions: [] as unknown[],
    canvasSourceCloses: 0,
    audioSourceCloses: 0,
    starts: 0,
    finalizes: 0,
    encodable: { audio: ['aac', 'opus', 'mp3', 'flac', 'vorbis'] as string[] },
  };

  class Mp4OutputFormat { mimeType = 'video/mp4'; getSupportedAudioCodecs() { return ['aac', 'mp3', 'opus', 'flac']; } constructor(public opts?: unknown) { calls.Mp4OutputFormat.push(opts); } }
  class MovOutputFormat { mimeType = 'video/quicktime'; getSupportedAudioCodecs() { return ['aac', 'mp3']; } constructor(public opts?: unknown) { calls.MovOutputFormat.push(opts); } }
  class WebMOutputFormat { mimeType = 'video/webm'; getSupportedAudioCodecs() { return ['opus', 'vorbis']; } constructor(public opts?: unknown) { calls.WebMOutputFormat.push(opts); } }
  class MkvOutputFormat { mimeType = 'video/x-matroska'; getSupportedAudioCodecs() { return ['aac', 'mp3', 'opus', 'vorbis', 'flac']; } constructor(public opts?: unknown) { calls.MkvOutputFormat.push(opts); } }

  class BufferTarget {
    buffer = new ArrayBuffer(0);
    constructor() { calls.BufferTarget.push(true); }
  }

  class CanvasSource {
    constructor(public canvas: unknown, public opts: unknown) { calls.CanvasSource.push({ canvas, opts }); }
    async add(t: number, dt: number, opts?: unknown) { calls.canvasSourceAdds.push({ t, dt, opts }); }
    async close() { calls.canvasSourceCloses++; }
  }

  class AudioBufferSource {
    constructor(public opts: unknown, options?: unknown) { calls.AudioBufferSource.push(opts); calls.audioSourceOptions.push(options); }
    async add(buf: unknown) { calls.audioSourceAdds.push(buf); }
    async close() { calls.audioSourceCloses++; }
  }

  class Output {
    format: { mimeType: string };
    target: { buffer: ArrayBuffer };
    constructor(opts: { format: { mimeType: string }; target: { buffer: ArrayBuffer } }) {
      this.format = opts.format;
      this.target = opts.target;
      calls.Output.push(opts);
    }
    addVideoTrack(src: unknown, trackOpts: unknown) { calls.addVideoTrack.push({ src, trackOpts }); }
    addAudioTrack(src: unknown) { calls.addAudioTrack.push(src); }
    async start() { calls.starts++; }
    async finalize() { calls.finalizes++; }
  }

  return {
    QUALITY_VERY_LOW: 'qvl',
    QUALITY_LOW: 'ql',
    QUALITY_MEDIUM: 'qm',
    QUALITY_HIGH: 'qh',
    QUALITY_VERY_HIGH: 'qvh',
    Mp4OutputFormat,
    MovOutputFormat,
    WebMOutputFormat,
    MkvOutputFormat,
    BufferTarget,
    CanvasSource,
    AudioBufferSource,
    Output,
    getFirstEncodableAudioCodec: async (checked: string[]) => checked.find(c => calls.encodable.audio.includes(c)) ?? null,
    __calls: calls,
  };
});

import { exportFrames } from '../../src/core/Renderer';
import * as mb from 'mediabunny';

const calls = (mb as unknown as { __calls: Record<string, unknown> }).__calls as ReturnType<typeof bag>;
function bag() {
  return {
    Mp4OutputFormat: [] as unknown[],
    MovOutputFormat: [] as unknown[],
    WebMOutputFormat: [] as unknown[],
    MkvOutputFormat: [] as unknown[],
    BufferTarget: [] as unknown[],
    Output: [] as Array<{ format: unknown; target: unknown }>,
    CanvasSource: [] as Array<{ canvas: unknown; opts: { codec: string; bitrate: string } }>,
    AudioBufferSource: [] as Array<{ codec: string; bitrate: string }>,
    addVideoTrack: [] as Array<{ src: unknown; trackOpts: { frameRate: number } }>,
    addAudioTrack: [] as unknown[],
    canvasSourceAdds: [] as Array<{ t: number; dt: number; opts: { keyFrame?: true } | undefined }>,
    audioSourceAdds: [] as unknown[],
    audioSourceOptions: [] as unknown[],
    canvasSourceCloses: 0,
    audioSourceCloses: 0,
    starts: 0,
    finalizes: 0,
    encodable: { audio: [] as string[] },
  };
}

beforeEach(() => {
  (calls as unknown as { encodable: { audio: string[] } }).encodable.audio = ['aac', 'opus', 'mp3', 'flac', 'vorbis'];
  for (const key of Object.keys(calls)) {
    const val = (calls as Record<string, unknown>)[key];
    if (Array.isArray(val)) val.length = 0;
    else if (typeof val === 'number') (calls as Record<string, unknown>)[key] = 0;
  }
});

interface MovieStub {
  app: { canvas: HTMLCanvasElement; ticker: { stop(): void; start(): void } };
  frameRate: number;
  totalFrames: number;
  duration: number;
  timelineData(): { rows: Array<{ name: string; start: number; end: number; depth: number }> };
  audioBuffer: AudioBuffer | null;
  gotoFrame(frame: number, force?: boolean): Promise<void>;
  emit(event: string, data: unknown): void;
}

function fakeMovie(opts: { totalFrames?: number; frameRate?: number; audioBuffer?: AudioBuffer | null } = {}) {
  const totalFrames = opts.totalFrames ?? 6;
  const frameRate = opts.frameRate ?? 30;
  const local = {
    gotoFrame: [] as Array<{ frame: number; force?: boolean }>,
    emit: [] as Array<{ event: string; data: unknown }>,
    tickerStops: 0,
    tickerStarts: 0,
  };
  const movie: MovieStub = {
    app: {
      canvas: { tagName: 'CANVAS' } as unknown as HTMLCanvasElement,
      ticker: {
        stop() { local.tickerStops++; },
        start() { local.tickerStarts++; },
      },
    },
    frameRate,
    totalFrames,
    duration: totalFrames / frameRate,
    timelineData: () => ({ rows: [{ name: 'title', start: 1, end: 2, depth: 0 }] }),
    audioBuffer: opts.audioBuffer ?? null,
    async gotoFrame(frame: number, force?: boolean) { local.gotoFrame.push({ frame, force }); },
    emit(event: string, data: unknown) { local.emit.push({ event, data }); },
  };
  return { movie, local };
}

// Helper: cast our MovieStub to the Movie type Renderer expects.
function asMovie(stub: MovieStub): Parameters<typeof exportFrames>[0] {
  return stub as unknown as Parameters<typeof exportFrames>[0];
}

// ── format → codec & fastStart mapping ───────────────────────────────────

describe('Renderer — output format & codec mapping', () => {
  it('mp4 default: avc/aac, fastStart in-memory, BufferTarget', async () => {
    const { movie } = fakeMovie();
    await exportFrames(asMovie(movie));
    expect(calls.Mp4OutputFormat.length).toBe(1);
    expect(calls.Mp4OutputFormat[0]).toEqual({ fastStart: 'in-memory' });
    expect(calls.MovOutputFormat.length).toBe(0);
    expect(calls.WebMOutputFormat.length).toBe(0);
    expect(calls.MkvOutputFormat.length).toBe(0);
    expect(calls.BufferTarget.length).toBe(1);
    expect(calls.CanvasSource[0]!.opts).toEqual({ codec: 'avc', bitrate: 'qh' });
  });

  it('mov: avc/aac, fastStart in-memory', async () => {
    const { movie } = fakeMovie();
    await exportFrames(asMovie(movie), { format: 'mov' });
    expect(calls.MovOutputFormat[0]).toEqual({ fastStart: 'in-memory' });
    expect(calls.CanvasSource[0]!.opts).toEqual({ codec: 'avc', bitrate: 'qh' });
  });

  it('webm: vp9/opus, no fastStart option', async () => {
    const { movie } = fakeMovie({ audioBuffer: {} as AudioBuffer });
    await exportFrames(asMovie(movie), { format: 'webm' });
    expect(calls.WebMOutputFormat.length).toBe(1);
    expect(calls.WebMOutputFormat[0]).toBeUndefined();
    expect(calls.CanvasSource[0]!.opts).toEqual({ codec: 'vp9', bitrate: 'qh' });
    expect(calls.AudioBufferSource[0]).toEqual({ codec: 'opus', bitrate: 'qh' });
  });

  it('mkv: vp9/opus, no fastStart option', async () => {
    const { movie } = fakeMovie({ audioBuffer: {} as AudioBuffer });
    await exportFrames(asMovie(movie), { format: 'mkv' });
    expect(calls.MkvOutputFormat.length).toBe(1);
    expect(calls.MkvOutputFormat[0]).toBeUndefined();
    expect(calls.CanvasSource[0]!.opts).toEqual({ codec: 'vp9', bitrate: 'qh' });
    expect(calls.AudioBufferSource[0]).toEqual({ codec: 'opus', bitrate: 'qh' });
  });

  it('explicit codec override beats the per-format default', async () => {
    const { movie } = fakeMovie({ audioBuffer: {} as AudioBuffer });
    await exportFrames(asMovie(movie), {
      format: 'webm',
      video: { codec: 'av1' },
      audio: { codec: 'vorbis' },
    });
    expect(calls.CanvasSource[0]!.opts).toEqual({ codec: 'av1', bitrate: 'qh' });
    expect(calls.AudioBufferSource[0]).toEqual({ codec: 'vorbis', bitrate: 'qh' });
  });
});

// ── quality preset mapping ───────────────────────────────────────────────

describe('Renderer — quality preset mapping', () => {
  it.each([
    ['very-low',  'qvl'],
    ['low',       'ql'],
    ['medium',    'qm'],
    ['high',      'qh'],
    ['very-high', 'qvh'],
  ] as const)('%s → %s', async (preset, expected) => {
    const { movie } = fakeMovie({ audioBuffer: {} as AudioBuffer });
    await exportFrames(asMovie(movie), { video: { bitrate: preset }, audio: { bitrate: preset } });
    expect(calls.CanvasSource[0]!.opts.bitrate).toBe(expected);
    expect(calls.AudioBufferSource[0]!.bitrate).toBe(expected);
  });

  it('defaults to high when bitrate is omitted', async () => {
    const { movie } = fakeMovie();
    await exportFrames(asMovie(movie));
    expect(calls.CanvasSource[0]!.opts.bitrate).toBe('qh');
  });
});

// ── encode loop & keyframes ──────────────────────────────────────────────

describe('Renderer — encode loop', () => {
  it('iterates frame 0..totalFrames inclusive, calling gotoFrame(force=true)', async () => {
    const { movie, local } = fakeMovie({ totalFrames: 5, frameRate: 30 });
    await exportFrames(asMovie(movie));
    expect(local.gotoFrame.map((c) => c.frame)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(local.gotoFrame.every((c) => c.force === true)).toBe(true);
    expect(calls.canvasSourceAdds.map((c) => c.t)).toEqual([0, 1 / 30, 2 / 30, 3 / 30, 4 / 30, 5 / 30]);
    expect(calls.canvasSourceAdds.every((c) => c.dt === 1 / 30)).toBe(true);
  });

  it('a range encodes only those frames (the end included), the file starts at 0, and progress counts within the range', async () => {
    const { movie, local } = fakeMovie({ totalFrames: 300, frameRate: 30 });
    await exportFrames(asMovie(movie), { range: [2, 3] });
    expect(local.gotoFrame.map((c) => c.frame)).toEqual(Array.from({ length: 31 }, (_, i) => 60 + i));
    expect(calls.canvasSourceAdds[0]!.t).toBe(0);
    expect(calls.canvasSourceAdds[30]!.t).toBeCloseTo(1, 10);
    const progress = local.emit.filter((e) => e.event === 'progress').map((e) => (e.data as { progress: number }).progress);
    expect(progress[0]).toBe(0); expect(progress[progress.length - 1]).toBe(100);
    expect((calls.canvasSourceAdds[0]!.opts as { keyFrame?: true }).keyFrame).toBe(true);        // the first frame of the file is a keyframe
  });

  it('a layer name is a range', async () => {
    const { movie, local } = fakeMovie({ totalFrames: 300, frameRate: 30 });
    await exportFrames(asMovie(movie), { range: 'title' });
    expect(local.gotoFrame[0]!.frame).toBe(30);
    expect(local.gotoFrame[local.gotoFrame.length - 1]!.frame).toBe(60);
  });

  it('a movie that is encoded whole is unchanged: the same frames and timestamps as without any new option', async () => {
    const { movie, local } = fakeMovie({ totalFrames: 4, frameRate: 30 });
    await exportFrames(asMovie(movie), { range: [0, 4 / 30] });
    expect(local.gotoFrame.map((c) => c.frame)).toEqual([0, 1, 2, 3, 4]);
  });

  it('forces a keyframe at frame 0 and every ~2 seconds (fps 30 → every 60 frames)', async () => {
    const { movie } = fakeMovie({ totalFrames: 180, frameRate: 30 });
    await exportFrames(asMovie(movie));
    const keyFrames = calls.canvasSourceAdds.filter((c) => c.opts && (c.opts as { keyFrame?: true }).keyFrame === true);
    expect(keyFrames.map((_, i) => i * 60)).toEqual([0, 60, 120, 180]);
    expect(keyFrames).toHaveLength(4);
    // Non-keyframe slots: opts is undefined.
    const nonKey = calls.canvasSourceAdds.filter((c) => c.opts === undefined);
    expect(nonKey).toHaveLength(180 + 1 - 4);
  });

  it('clamps the keyframe interval to at least 1 frame even at sub-1 fps', async () => {
    const { movie } = fakeMovie({ totalFrames: 3, frameRate: 0.4 });
    await exportFrames(asMovie(movie));
    // Math.max(1, round(0.8)) === 1 → every frame is a keyframe.
    const keyFrames = calls.canvasSourceAdds.filter((c) => c.opts && (c.opts as { keyFrame?: true }).keyFrame === true);
    expect(keyFrames).toHaveLength(4);
  });

  it('emits "progress" once per frame with rounded percent', async () => {
    const { movie, local } = fakeMovie({ totalFrames: 4 });
    await exportFrames(asMovie(movie));
    const progress = local.emit.filter((e) => e.event === 'progress').map((e) => e.data);
    expect(progress).toEqual([
      { progress: 0,   frame: 0, totalFrames: 4 },
      { progress: 25,  frame: 1, totalFrames: 4 },
      { progress: 50,  frame: 2, totalFrames: 4 },
      { progress: 75,  frame: 3, totalFrames: 4 },
      { progress: 100, frame: 4, totalFrames: 4 },
    ]);
  });
});

// ── audio path ───────────────────────────────────────────────────────────

describe('Renderer — audio path', () => {
  it('skips audio entirely when movie.audioBuffer is null', async () => {
    const { movie } = fakeMovie({ audioBuffer: null });
    await exportFrames(asMovie(movie));
    expect(calls.AudioBufferSource).toHaveLength(0);
    expect(calls.addAudioTrack).toHaveLength(0);
    expect(calls.audioSourceAdds).toHaveLength(0);
    expect(calls.audioSourceCloses).toBe(0);
  });

  it('adds + awaits audio source when movie.audioBuffer is set', async () => {
    const buf = { fake: 'AudioBuffer' } as unknown as AudioBuffer;
    const { movie } = fakeMovie({ audioBuffer: buf });
    await exportFrames(asMovie(movie));
    expect(calls.AudioBufferSource).toHaveLength(1);
    expect(calls.addAudioTrack).toHaveLength(1);
    expect(calls.audioSourceAdds).toEqual([buf]);
    expect(calls.audioSourceCloses).toBe(1);
  });

  it('order: addAudioTrack → start → audioSource.add → audioSource.close', async () => {
    // Use the call counters captured by the mock to verify ordering through
    // the encode pipeline. start() runs once, then audio.add, then audio.close,
    // then the encode loop, then output.finalize.
    const buf = {} as AudioBuffer;
    const { movie } = fakeMovie({ audioBuffer: buf, totalFrames: 1 });
    await exportFrames(asMovie(movie));
    expect(calls.starts).toBe(1);
    expect(calls.audioSourceAdds).toHaveLength(1);
    expect(calls.audioSourceCloses).toBe(1);
    expect(calls.canvasSourceCloses).toBe(1);
    expect(calls.finalizes).toBe(1);
  });
});

// ── ticker, return value, error handling ─────────────────────────────────

describe('Renderer — ticker, blob, error handling', () => {
  it('stops the PIXI ticker before encoding and restarts it after success', async () => {
    const { movie, local } = fakeMovie();
    await exportFrames(asMovie(movie));
    expect(local.tickerStops).toBe(1);
    expect(local.tickerStarts).toBe(1);
  });

  it('restarts the PIXI ticker even if the encode loop throws', async () => {
    const { movie, local } = fakeMovie();
    movie.gotoFrame = async () => { throw new Error('boom'); };
    await expect(exportFrames(asMovie(movie))).rejects.toThrow('boom');
    expect(local.tickerStops).toBe(1);
    expect(local.tickerStarts).toBe(1);
  });

  it('returns a Blob whose type matches the format mimeType', async () => {
    const { movie } = fakeMovie();
    const blob = await exportFrames(asMovie(movie), { format: 'mp4' });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('video/mp4');

    const webm = await exportFrames(asMovie(movie), { format: 'webm' });
    expect(webm.type).toBe('video/webm');

    const mov = await exportFrames(asMovie(movie), { format: 'mov' });
    expect(mov.type).toBe('video/quicktime');

    const mkv = await exportFrames(asMovie(movie), { format: 'mkv' });
    expect(mkv.type).toBe('video/x-matroska');
  });

  it('passes the canvas to CanvasSource and frameRate to addVideoTrack', async () => {
    const { movie } = fakeMovie({ frameRate: 24 });
    await exportFrames(asMovie(movie));
    expect(calls.CanvasSource[0]!.canvas).toBe(movie.app.canvas);
    expect(calls.addVideoTrack[0]!.trackOpts).toEqual({ frameRate: 24 });
  });
});

describe('Renderer — the audio lines up with the picture', () => {
  it('AAC (mp4 / mov): the track starts 2112 samples early, so the encoder delay is cut off by an edit list', async () => {
    for (const format of ['mp4', 'mov'] as const) {
      const { movie } = fakeMovie({ audioBuffer: { sampleRate: 48000 } as AudioBuffer });
      await exportFrames(asMovie(movie), { format });
    }
    expect(calls.audioSourceOptions).toEqual([{ startTimestamp: -2112 / 48000 }, { startTimestamp: -2112 / 48000 }]);
  });

  it('Opus (webm / mkv) starts at 0: the container carries its own pre-skip', async () => {
    for (const format of ['webm', 'mkv'] as const) {
      const { movie } = fakeMovie({ audioBuffer: { sampleRate: 44100 } as AudioBuffer });
      await exportFrames(asMovie(movie), { format });
    }
    expect(calls.audioSourceOptions).toEqual([{ startTimestamp: 0 }, { startTimestamp: 0 }]);
  });
});

describe('Renderer — the audio codec the browser can actually encode', () => {
  const setEncodable = (codecs: string[]) => { (calls as unknown as { encodable: { audio: string[] } }).encodable.audio = codecs; };
  const audioMovie = () => fakeMovie({ audioBuffer: { sampleRate: 48000, numberOfChannels: 2 } as AudioBuffer }).movie;

  it('a browser without an AAC encoder (Chrome on Linux) gets Opus in the mp4, a warning, and no AAC priming offset', async () => {
    setEncodable(['opus', 'flac']);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await exportFrames(asMovie(audioMovie()), { format: 'mp4' });
    expect((calls.AudioBufferSource[0] as { codec: string }).codec).toBe('opus');
    expect(calls.audioSourceOptions[0]).toEqual({ startTimestamp: 0 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]![0])).toMatch(/AAC.*opus.*webm/s);
    warn.mockRestore();
  });

  it('with an AAC encoder nothing changes: aac, the priming offset, no warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await exportFrames(asMovie(audioMovie()), { format: 'mp4' });
    expect((calls.AudioBufferSource[0] as { codec: string }).codec).toBe('aac');
    expect((calls.audioSourceOptions[0] as { startTimestamp: number }).startTimestamp).toBeLessThan(0);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a codec you ask for is never swapped silently: if it cannot be encoded the error says which ones can', async () => {
    setEncodable(['opus']);
    await expect(exportFrames(asMovie(audioMovie()), { format: 'mp4', audio: { codec: 'aac' } }))
      .rejects.toThrow(/cannot encode.*aac.*opus/s);
  });

  it('no usable audio encoder at all: one clear error, not a browser internals message', async () => {
    setEncodable([]);
    await expect(exportFrames(asMovie(audioMovie()), { format: 'webm' })).rejects.toThrow(/no audio encoder/i);
  });

  it('a movie without audio never asks the browser about audio encoders', async () => {
    setEncodable([]);
    await expect(exportFrames(asMovie(fakeMovie().movie), { format: 'mp4' })).resolves.toBeInstanceOf(Blob);
  });
});
