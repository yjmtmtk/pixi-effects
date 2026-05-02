import { Assets, ExtensionType, extensions } from 'pixi.js';
import {
  Input, BlobSource, ALL_FORMATS, Output, WavOutputFormat,
  BufferTarget, Conversion, VideoSampleSink,
} from 'mediabunny';
import type { AssetSpec } from '../types';

export interface AudioAssetData {
  audioBuffer: AudioBuffer;
  duration: number;
}

export interface VideoAssetData {
  videoTrack: unknown;
  audioBuffer: AudioBuffer | null;
  videoDuration: number;
  audioDuration: number;
  duration: number;
  sink: InstanceType<typeof VideoSampleSink>;
}

let registered = false;

export function ensureLoadersRegistered(audioContext: AudioContext): void {
  if (registered) return;
  registered = true;

  extensions.add({
    extension: { type: ExtensionType.LoadParser, name: 'pixi-effects-audio' },
    test: (url: string) => /\.(mp3|wav|ogg)$/i.test(url),
    async load(url: string): Promise<AudioAssetData> {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`pixi-effects: failed to load ${url}: ${res.statusText}`);
      const buffer = await res.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(buffer);
      return { audioBuffer, duration: audioBuffer.duration };
    },
  });

  extensions.add({
    extension: { type: ExtensionType.LoadParser, name: 'pixi-effects-video', priority: 1 },
    test: (url: string) => /\.(mp4|webm|mov|mkv)$/i.test(url),
    async load(url: string): Promise<VideoAssetData> {
      const blob = await fetch(url).then(r => r.blob());
      const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      const videoTrack = await input.getPrimaryVideoTrack();
      if (!videoTrack || !await videoTrack.canDecode()) {
        throw new Error('pixi-effects: video track cannot be decoded');
      }
      const audioTrack = await input.getPrimaryAudioTrack();
      const videoDuration = await videoTrack.computeDuration();
      const audioDuration = audioTrack ? await audioTrack.computeDuration() : 0;

      let audioBuffer: AudioBuffer | null = null;
      if (audioTrack) {
        try {
          const out = new Output({ format: new WavOutputFormat(), target: new BufferTarget() });
          const conv = await Conversion.init({ input, output: out, video: { discard: true } });
          await conv.execute();
          audioBuffer = await audioContext.decodeAudioData((out.target as BufferTarget).buffer as ArrayBuffer);
        } catch (e) {
          console.warn('pixi-effects: audio extraction failed:', e);
        }
      }
      return {
        videoTrack,
        audioBuffer,
        videoDuration,
        audioDuration,
        duration: Math.max(videoDuration, audioDuration),
        sink: new VideoSampleSink(videoTrack as import('mediabunny').InputVideoTrack),
      };
    },
  });
}

export async function loadAssetBundle(
  assets: AssetSpec[],
  audioContext: AudioContext,
): Promise<Record<string, AudioAssetData | VideoAssetData>> {
  ensureLoadersRegistered(audioContext);
  const bundle = assets.map(a => ({ alias: a.name, src: a.src }));
  Assets.addBundle('pixi-effects', bundle);
  return await Assets.loadBundle('pixi-effects');
}
