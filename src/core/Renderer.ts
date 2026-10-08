import {
  Output, Mp4OutputFormat, MovOutputFormat, WebMOutputFormat, MkvOutputFormat,
  BufferTarget, CanvasSource, AudioBufferSource, getFirstEncodableAudioCodec,
  QUALITY_VERY_LOW, QUALITY_LOW, QUALITY_MEDIUM, QUALITY_HIGH, QUALITY_VERY_HIGH,
  Quality,
} from 'mediabunny';
import type { Movie, RenderOptions } from './Movie';
import { resolveMotionBlur } from './motionBlur';
import type { MotionBlurSpec } from './motionBlur';
import { resolveRange, resolveRenderOptions, sliceChannels } from './renderRange';

const VIDEO_CODEC_BY_FORMAT = {
  mp4: 'avc',
  mov: 'avc',
  webm: 'vp9',
  mkv: 'vp9',
} as const;

const AUDIO_CODEC_BY_FORMAT = {
  mp4: 'aac',
  mov: 'aac',
  webm: 'opus',
  mkv: 'opus',
} as const;

/** Audio codecs to try for each container, best first (the first one the browser can encode wins). */
const AUDIO_PREFERENCE = {
  mp4: ['aac', 'opus', 'mp3', 'flac'],
  mov: ['aac', 'mp3'],
  webm: ['opus', 'vorbis'],
  mkv: ['opus', 'vorbis', 'aac', 'flac', 'mp3'],
} as const;

/**
 * The audio codec to write. Not every browser can encode every codec: Chrome on Linux has no AAC encoder, which used to make every
 * mp4 / mov with sound fail with a message about encoder configurations. Unless the caller named a codec, use the first one in
 * `AUDIO_PREFERENCE` that this browser can encode (and say so); a codec the caller named is never swapped, but a failure says which would work.
 */
async function chooseAudioCodec(
  fmt: 'mp4' | 'mov' | 'webm' | 'mkv', requested: string | undefined, container: unknown, audio: AudioBuffer, bitrate: Quality,
): Promise<string> {
  const supported = (container as { getSupportedAudioCodecs?: () => string[] }).getSupportedAudioCodecs?.();
  const preferred = AUDIO_PREFERENCE[fmt].filter(c => !supported || supported.includes(c));
  const canEncode = (list: readonly string[]): Promise<string | null> =>
    getFirstEncodableAudioCodec(list as never, { numberOfChannels: audio.numberOfChannels ?? 2, sampleRate: audio.sampleRate, bitrate }) as Promise<string | null>;
  if (requested) {
    if (await canEncode([requested])) return requested;
    const alt = await canEncode(preferred.filter(c => c !== requested));
    throw new Error(`pixi-effects: this browser cannot encode "${requested}" audio for ${fmt}` +
      (alt ? `; "${alt}" would work: render({ format: '${fmt}', audio: { codec: '${alt}' } }), or leave audio.codec out and the best one is chosen.` : '; it has no audio encoder for this format at all (try another browser, or a movie without sound).'));
  }
  const chosen = await canEncode(preferred);
  if (!chosen) throw new Error(`pixi-effects: this browser has no audio encoder for ${fmt} (it tried ${preferred.join(', ')}): try another browser, or render a movie without sound.`);
  if (chosen !== preferred[0]) {
    console.warn(`pixi-effects: this browser cannot encode ${preferred[0]!.toUpperCase()} audio (Chrome on Linux has no AAC encoder), so the ${fmt} carries ${chosen} instead; current players play it. A webm export needs no AAC.`);
  }
  return chosen;
}

/** Samples of silence an AAC encoder puts in front of the audio (its priming / encoder delay). */
const AAC_PRIMING_SAMPLES = 2112;

const qualityMap: Record<string, Quality> = {
  'very-low': QUALITY_VERY_LOW,
  'low': QUALITY_LOW,
  'medium': QUALITY_MEDIUM,
  'high': QUALITY_HIGH,
  'very-high': QUALITY_VERY_HIGH,
};

function makeOutputFormat(name: 'mp4' | 'mov' | 'webm' | 'mkv') {
  switch (name) {
    case 'mp4': return new Mp4OutputFormat({ fastStart: 'in-memory' });
    case 'mov': return new MovOutputFormat({ fastStart: 'in-memory' });
    case 'webm': return new WebMOutputFormat();
    case 'mkv': return new MkvOutputFormat();
  }
}

/** The audio of `buffer` between two times as a new buffer (see `sliceChannels`). */
function sliceAudio(buffer: AudioBuffer, fromSec: number, toSec: number, fadeIn: boolean, fadeOut: boolean): AudioBuffer {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  const cut = sliceChannels(channels, buffer.sampleRate, fromSec, toSec, { fadeIn, fadeOut });
  const out = new AudioBuffer({ length: cut[0]!.length, numberOfChannels: cut.length, sampleRate: buffer.sampleRate });
  cut.forEach((data, c) => out.copyToChannel(data as Float32Array<ArrayBuffer>, c));
  return out;
}

export async function exportFrames(movie: Movie, options: RenderOptions = {}): Promise<Blob> {
  const fmt = options.format ?? 'mp4';
  const eff = resolveRenderOptions(options);                         // `draft` expanded, `scale` checked
  const range = resolveRange(options.range, { frameRate: movie.frameRate, totalFrames: movie.totalFrames, duration: movie.duration, rows: typeof options.range === 'string' ? movie.timelineData().rows : undefined });
  const opts = {
    format: fmt,
    video: {
      codec: options.video?.codec ?? VIDEO_CODEC_BY_FORMAT[fmt],
      bitrate: qualityMap[eff.bitrate ?? 'high'] ?? QUALITY_HIGH,
    },
    audio: {
      codec: options.audio?.codec ?? AUDIO_CODEC_BY_FORMAT[fmt],
      bitrate: qualityMap[options.audio?.bitrate ?? 'high'] ?? QUALITY_HIGH,
    },
  };

  const container = makeOutputFormat(opts.format);
  // a range cuts the audio the same way (with a short fade on a cut edge, not on the movie's own start or end)
  const audio = movie.audioBuffer && range.partial ? sliceAudio(movie.audioBuffer, range.fromSec, range.toSec, range.fromFrame > 0, range.toFrame < movie.totalFrames) : movie.audioBuffer;
  if (audio) opts.audio.codec = await chooseAudioCodec(fmt, options.audio?.codec, container, audio, opts.audio.bitrate) as never;
  const output = new Output({
    format: container,
    target: new BufferTarget(),
  });
  // With motion blur every frame is drawn several times and averaged into this canvas, which is what gets encoded.
  const mb = eff.motionBlur !== undefined ? resolveMotionBlur(eff.motionBlur as MotionBlurSpec, 'movie.render()') : (movie.motionBlur ?? null);
  const stage = movie.app!.canvas as HTMLCanvasElement;
  const blurCanvas = mb ? Object.assign(document.createElement('canvas'), { width: stage.width, height: stage.height }) : null;
  // `scale` < 1: each frame is copied smaller into this canvas and that is what gets encoded (even sides: H.264 needs them)
  const small = eff.scale < 1
    ? Object.assign(document.createElement('canvas'), { width: Math.max(2, Math.round((stage.width * eff.scale) / 2) * 2), height: Math.max(2, Math.round((stage.height * eff.scale) / 2) * 2) })
    : null;
  const smallCtx = small?.getContext('2d') ?? null;
  const canvasSource = new CanvasSource(small ?? blurCanvas ?? stage, {
    codec: opts.video.codec as any,
    bitrate: opts.video.bitrate,
  });
  output.addVideoTrack(canvasSource, { frameRate: movie.frameRate });

  if (audio) {
    // AAC encoders emit AAC_PRIMING_SAMPLES of silence first. Starting the track that much earlier makes
    // mediabunny write an edit list that trims them, so the file's audio starts where the browser's does
    // (without it every sound in an MP4 / MOV was ~45 ms late). Opus signals its own pre-skip.
    const audioSource = new AudioBufferSource({
      codec: opts.audio.codec as any,
      bitrate: opts.audio.bitrate,
    }, { startTimestamp: opts.audio.codec === 'aac' ? -AAC_PRIMING_SAMPLES / audio.sampleRate : 0 });
    output.addAudioTrack(audioSource);
    await output.start();
    await audioSource.add(audio);
    await audioSource.close();
  } else {
    await output.start();
  }

  movie.app!.ticker.stop();
  // Force a keyframe every ~2 seconds (and at frame 0). Improves seek
  // responsiveness in players without inflating bitrate appreciably.
  const keyframeIntervalFrames = Math.max(1, Math.round(2 * movie.frameRate));
  try {
    const count = Math.max(1, range.toFrame - range.fromFrame);
    for (let frame = range.fromFrame; frame <= range.toFrame; frame++) {
      if (mb && blurCanvas) await movie._exposeFrame(frame, mb, blurCanvas, false);
      else await movie.gotoFrame(frame, true);
      if (small && smallCtx) smallCtx.drawImage(blurCanvas ?? stage, 0, 0, small.width, small.height);
      const rel = frame - range.fromFrame;
      const isKey = rel === 0 || rel % keyframeIntervalFrames === 0;
      const addOpts = isKey ? { keyFrame: true } : undefined;
      await canvasSource.add(rel / movie.frameRate, 1 / movie.frameRate, addOpts);
      const progress = Math.floor((rel / count) * 100);
      movie.emit('progress', { progress, frame, totalFrames: movie.totalFrames });
    }
    await canvasSource.close();
    await output.finalize();
    if (mb) await movie.gotoFrame(range.toFrame, true);              // the stage shows the last exported frame itself, not its last sample
    return new Blob([output.target.buffer as ArrayBuffer], { type: output.format.mimeType });
  } finally {
    movie.app!.ticker.start();
  }
}
