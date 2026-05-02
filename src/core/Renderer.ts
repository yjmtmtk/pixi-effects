import {
  Output, Mp4OutputFormat, MovOutputFormat, WebMOutputFormat, MkvOutputFormat,
  BufferTarget, CanvasSource, AudioBufferSource,
  QUALITY_VERY_LOW, QUALITY_LOW, QUALITY_MEDIUM, QUALITY_HIGH, QUALITY_VERY_HIGH,
  Quality,
} from 'mediabunny';
import type { Movie, RenderOptions } from './Movie';

const qualityMap: Record<string, Quality> = {
  'very-low': QUALITY_VERY_LOW,
  'low': QUALITY_LOW,
  'medium': QUALITY_MEDIUM,
  'high': QUALITY_HIGH,
  'very-high': QUALITY_VERY_HIGH,
};

const formatMap = {
  mp4:  Mp4OutputFormat,
  mov:  MovOutputFormat,
  webm: WebMOutputFormat,
  mkv:  MkvOutputFormat,
} as const;

export async function exportFrames(movie: Movie, options: RenderOptions = {}): Promise<Blob> {
  const opts = {
    format: options.format ?? 'mp4',
    video: {
      codec: options.video?.codec ?? 'avc',
      bitrate: qualityMap[options.video?.bitrate ?? 'high'] ?? QUALITY_HIGH,
    },
    audio: {
      codec: options.audio?.codec ?? 'aac',
      bitrate: qualityMap[options.audio?.bitrate ?? 'high'] ?? QUALITY_HIGH,
    },
  };

  const output = new Output({
    format: new (formatMap[opts.format])(),
    target: new BufferTarget(),
  });
  const canvasSource = new CanvasSource(movie.app!.canvas as HTMLCanvasElement, {
    codec: opts.video.codec as any,
    bitrate: opts.video.bitrate,
  });
  output.addVideoTrack(canvasSource, { frameRate: movie.frameRate });

  if (movie.audioBuffer) {
    const audioSource = new AudioBufferSource({
      codec: opts.audio.codec as any,
      bitrate: opts.audio.bitrate,
    });
    output.addAudioTrack(audioSource);
    await output.start();
    await audioSource.add(movie.audioBuffer);
    audioSource.close();
  } else {
    await output.start();
  }

  movie.app!.ticker.stop();
  try {
    for (let frame = 0; frame <= movie.totalFrames; frame++) {
      await movie.gotoFrame(frame, true);
      await canvasSource.add(frame / movie.frameRate, 1 / movie.frameRate);
      const progress = Math.floor((frame / movie.totalFrames) * 100);
      movie.emit('progress', { progress, frame, totalFrames: movie.totalFrames });
    }
    await canvasSource.close();
    await output.finalize();
    return new Blob([output.target.buffer as ArrayBuffer], { type: output.format.mimeType });
  } finally {
    movie.app!.ticker.start();
  }
}
