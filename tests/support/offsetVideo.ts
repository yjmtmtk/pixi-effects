import * as mb from 'mediabunny';

/** colors.mp4 copied packet by packet with the PICTURE moved `by` seconds later (the sound stays): a file whose first frame is not at 0, as a cut or a recording can be. */
export async function writeLateVideo(from: string, to: string, by: number): Promise<void> {
  const input = new mb.Input({ source: new mb.FilePathSource(from), formats: mb.ALL_FORMATS });
  const v = (await input.getPrimaryVideoTrack())!, a = (await input.getPrimaryAudioTrack())!;
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.FilePathTarget(to) });
  const vs = new mb.EncodedVideoPacketSource('avc'), as = new mb.EncodedAudioPacketSource('aac');
  output.addVideoTrack(vs); output.addAudioTrack(as);
  await output.start();
  let first = true;
  const vcfg = await v.getDecoderConfig(), acfg = await a.getDecoderConfig();
  for await (const p of new mb.EncodedPacketSink(v).packets()) { await vs.add(p.clone({ timestamp: p.timestamp + by }), first ? { decoderConfig: vcfg! } : undefined); first = false; }
  first = true;
  for await (const p of new mb.EncodedPacketSink(a).packets()) { await as.add(p, first ? { decoderConfig: acfg! } : undefined); first = false; }
  await output.finalize();
}
