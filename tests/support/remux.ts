import * as mb from 'mediabunny';

export interface RemuxOptions {
  /** Seconds added to every picture / sound timestamp (a track that starts late, or a negative one: AAC's encoder-delay packet). */
  videoShift?: number;
  audioShift?: number;
  /** Keep only the picture packets before this time (a clip whose sound is longer than its picture). */
  videoUntil?: number;
  /** Append a byte to the video decoder config: the same codec with other parameters (profile, level, parameter sets). Only for refusal tests: the file is not meant to play. */
  tweakVideoConfig?: boolean;
  /** Write a second sound track (a copy of the first). */
  twoAudioTracks?: boolean;
}

/** `from` copied packet by packet into `to` (an mp4), with the changes asked for. Test fixtures of the shapes real files have. */
export async function remux(from: string, to: string, o: RemuxOptions = {}): Promise<void> {
  const input = new mb.Input({ source: new mb.FilePathSource(from), formats: mb.ALL_FORMATS });
  const v = await input.getPrimaryVideoTrack(), a = await input.getPrimaryAudioTrack();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.FilePathTarget(to) });
  const vs = v ? new mb.EncodedVideoPacketSource(v.codec!) : null;
  const as = a ? new mb.EncodedAudioPacketSource(a.codec!) : null;
  const as2 = a && o.twoAudioTracks ? new mb.EncodedAudioPacketSource(a.codec!) : null;
  if (v && vs) output.addVideoTrack(vs, { rotation: await v.getRotation() });
  if (a && as) output.addAudioTrack(as);
  if (as2) output.addAudioTrack(as2);
  await output.start();
  if (v && vs) {
    const cfg = (await v.getDecoderConfig())!;
    const description = o.tweakVideoConfig && cfg.description ? (() => { const d = new Uint8Array((cfg.description as Uint8Array).length + 1); d.set(cfg.description as Uint8Array); return d; })() : cfg.description;
    let first = true;
    for await (const p of new mb.EncodedPacketSink(v).packets()) {
      if (o.videoUntil !== undefined && p.timestamp >= o.videoUntil) break;
      await vs.add(p.clone({ timestamp: p.timestamp + (o.videoShift ?? 0) }), first ? { decoderConfig: { ...cfg, description } } : undefined); first = false;
    }
  }
  if (a && as) {
    const cfg = (await a.getDecoderConfig())!;
    for (const src of [as, as2]) {
      if (!src) continue;
      let first = true;
      for await (const p of new mb.EncodedPacketSink(a).packets()) { await src.add(p.clone({ timestamp: p.timestamp + (o.audioShift ?? 0) }), first ? { decoderConfig: cfg } : undefined); first = false; }
    }
  }
  await output.finalize();
}
