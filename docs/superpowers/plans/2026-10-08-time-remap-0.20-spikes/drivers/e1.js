// export path: movie.render() of remapped content; decode the mp4 and compare with the seek snapshots (lossy: compare against a wrong frame as control)
const { Input, BlobSource, ALL_FORMATS, VideoSampleSink } = mb;
const scene = { type: 'composition', width: 320, height: 180, duration: 3, speed: -1, sequences: [
  { type: 'video', asset: 'v', duration: 3, speed: 1.5 },
  { type: 'shape', shape: 'circle', radius: 14, initial: { x: 30, y: 150, fillColor: '#ff0' }, keyframes: [{ at: 0, to: { x: 290 }, duration: 3, ease: 'none' }, { at: 1, from: { scale: 0.3 }, duration: 0.5 }] },
] };
await mk({ duration: 3, composition: { sequences: [scene] } });
const t0 = performance.now();
const blob = await movie.render({ format: 'mp4' });
const renderMs = Math.round(performance.now() - t0);
const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
const track = await input.getPrimaryVideoTrack();
const sink = new VideoSampleSink(track);
const px = async (img) => { const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d'); g.drawImage(img, 0, 0, 320, 180); return g.getImageData(0, 0, 320, 180).data; };
const mad = (A, B) => { let s = 0; for (let i = 0; i < A.length; i += 4) s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); return +(s / (A.length / 4) / 3).toFixed(2); };
const out = [];
for (const f of [0, 20, 45, 70, 88]) {
  const sample = await sink.getSample(f / 30 + 0.001);
  const vf = sample.toVideoFrame(); const dec = await px(vf); vf.close();
  const same = await pix(await snap(f));
  const other = await pix(await snap(Math.min(89, f + 6)));
  out.push({ f, madSame: mad(dec, same), madOtherFrame: mad(dec, other) });
}
const hasAudio = !!(await input.getPrimaryAudioTrack());
return { renderMs, bytes: blob.size, hasAudio, out, logs: window.__logs.filter(l => !l.includes('Resolver')) };
