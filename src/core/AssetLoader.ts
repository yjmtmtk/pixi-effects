import { Assets, ExtensionType, extensions } from 'pixi.js';
import type { VideoSampleSink, InputVideoTrack } from 'mediabunny';
import { loadMediabunny } from './mediabunny';   // fetched for the first video asset, never by a movie without one
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
  sink: VideoSampleSink;
}

/** The sound files an audio asset may be: what browsers decode with `decodeAudioData` (a query or a hash after the name is allowed). */
const AUDIO_FILE = /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)([?#].*)?$/i;
export const AUDIO_FORMATS = 'mp3, wav, ogg, m4a, flac or opus';

let registered = false;

export function ensureLoadersRegistered(audioContext: AudioContext): void {
  if (registered) return;
  registered = true;

  extensions.add({
    // Above PixiJS's own video loader, which takes `.ogg` as a video (an `.ogg` sound then played nothing, with no warning).
    extension: { type: ExtensionType.LoadParser, name: 'pixi-effects-audio', priority: 1 },
    test: (url: string) => AUDIO_FILE.test(url),
    async load(url: string): Promise<AudioAssetData> {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`pixi-effects: failed to load ${url}: ${res.status} ${res.statusText}`);
      const buffer = await res.arrayBuffer();
      let audioBuffer: AudioBuffer;
      try { audioBuffer = await audioContext.decodeAudioData(buffer); }
      catch (err) { throw new Error(`pixi-effects: ${url} could not be decoded as sound (${err instanceof Error ? err.message : String(err)}); use ${AUDIO_FORMATS}`); }
      return { audioBuffer, duration: audioBuffer.duration };
    },
  });

  extensions.add({
    extension: { type: ExtensionType.LoadParser, name: 'pixi-effects-video', priority: 1 },
    test: (url: string) => /\.(mp4|webm|mov|mkv)([?#].*)?$/i.test(url),
    async load(url: string): Promise<VideoAssetData> {
      const [M, blob] = await Promise.all([loadMediabunny(), fetch(url).then(r => r.blob())]);
      const { Input, BlobSource, ALL_FORMATS, Output, WavOutputFormat, BufferTarget, Conversion, VideoSampleSink } = M;
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
          audioBuffer = await audioContext.decodeAudioData((out.target as InstanceType<typeof BufferTarget>).buffer as ArrayBuffer);
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
        sink: new VideoSampleSink(videoTrack as InputVideoTrack),
      };
    },
  });
}

export async function loadAssetBundle(
  assets: AssetSpec[],
  audioContext: AudioContext,
  onProgress?: (fraction: number) => void,
): Promise<Record<string, AudioAssetData | VideoAssetData>> {
  ensureLoadersRegistered(audioContext);
  const bundle = assets.map(a => ({ alias: a.name, src: a.src }));
  Assets.addBundle('pixi-effects', bundle);
  return await Assets.loadBundle('pixi-effects', onProgress);
}
