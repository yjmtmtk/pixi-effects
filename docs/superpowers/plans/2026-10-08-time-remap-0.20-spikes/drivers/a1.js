// audio: chirp 200 -> 1000 Hz over 4 s (f(s) = 200 + 200 s) and a 440 Hz sine video track
const assets = [{ name: 'v', src: 't.mp4' }, { name: 'chirp', src: 'chirp.wav' }];
const freq = (t0, t1) => { const b = movie.audioBuffer; if (!b) return null; const d = b.getChannelData(0), sr = b.sampleRate; let c = 0, prev = d[Math.floor(t0 * sr)]; for (let i = Math.floor(t0 * sr) + 1; i < Math.floor(t1 * sr); i++) { if (prev < 0 && d[i] >= 0) c++; prev = d[i]; } return Math.round(c / (t1 - t0)); };
const rms = (t0, t1) => { const b = movie.audioBuffer; if (!b) return null; const d = b.getChannelData(0), sr = b.sampleRate; let s = 0, n = 0; for (let i = Math.floor(t0 * sr); i < Math.floor(t1 * sr); i++) { s += d[i] * d[i]; n++; } return +Math.sqrt(s / n).toFixed(3); };
const run = async (label, layer, probes, dur = 4) => {
  const t0 = performance.now();
  await mk({ duration: dur, assets, composition: { sequences: [layer] } });
  const ms = Math.round(performance.now() - t0);
  return { label, initMs: ms, probes: probes.map(([a, b, want]) => ({ win: [a, b], freq: freq(a, b), rms: rms(a, b), want })), logs: window.__logs.filter(l => !l.includes('Resolver')).slice(0, 2) };
};
const out = [];
out.push(await run('chirp plain (200+200s)', { type: 'audio', asset: 'chirp' }, [[0.5, 0.6, 'f(0.55)=310'], [3, 3.1, 'f(3.05)=810']]));
out.push(await run('chirp speed 2 (play 2x: source 2T, pitch x2)', { type: 'audio', asset: 'chirp', speed: 2, duration: 2 }, [[0.5, 0.6, '2*f(1.1)=840'], [1.5, 1.6, '2*f(3.1)=1640']], 4));
out.push(await run('chirp speed 0.5 (source T/2, pitch /2)', { type: 'audio', asset: 'chirp', speed: 0.5, duration: 4 }, [[1, 1.1, '0.5*f(0.525)=152'], [3, 3.1, '0.5*f(1.525)=253']]));
out.push(await run('chirp speed -1 (reverse: source 4-T)', { type: 'audio', asset: 'chirp', speed: -1, duration: 4 }, [[0.5, 0.6, 'f(3.45)=890'], [3, 3.1, 'f(0.95)=390']]));
out.push(await run('chirp ramp time 0->4 over 4 s power2.inOut', { type: 'audio', asset: 'chirp', keyframes: [{ at: 0, from: { time: 0 }, to: { time: 4 }, duration: 4, ease: 'power2.inOut' }] }, [[0.05, 0.15, 'slow start: ~f(0.0)*tiny'], [1.95, 2.05, 'mid: s=2, slope 3 -> 3*f(2)=1800 (aliasing risk)']]));
out.push(await run('chirp freeze: 0->1 over 1s, hold 1 (2s), 1->3 over 1 s', { type: 'audio', asset: 'chirp', keyframes: [{ at: 0, from: { time: 0 }, to: { time: 1 }, duration: 1, ease: 'none' }, { at: 1, to: { time: 1 }, duration: 2, ease: 'none' }, { at: 3, to: { time: 3 }, duration: 1, ease: 'none' }] }, [[0.2, 0.3, 'f(0.25)=250'], [1.5, 2.5, 'silent'], [3.5, 3.6, '2*f(2.1)+..']]));
out.push(await run('video track 440 Hz plain', { type: 'video', asset: 'v', duration: 4 }, [[1, 1.5, '440']]));
out.push(await run('video speed 2', { type: 'video', asset: 'v', duration: 4, speed: 2 }, [[1, 1.5, '880']]));
out.push(await run('video speed 0.5', { type: 'video', asset: 'v', duration: 4, speed: 0.5 }, [[1, 1.5, '220']]));
out.push(await run('composition speed -1 holding chirp at:0.5 (local 4-T)', { type: 'composition', duration: 4, speed: -1, sequences: [{ type: 'audio', asset: 'chirp', at: 0.5, duration: 3 }] }, [[0.5, 0.6, 'local 3.5-3.6: chirp src (3.55-0.5)=3.05 -> 810'], [3.5, 3.6, 'local 0.45: silent (chirp starts at .5)']]));
out.push(await run('composition speed 2 with video track', { type: 'composition', duration: 2, speed: 2, sequences: [{ type: 'video', asset: 'v', duration: 4, audio: true }] }, [[0.5, 1, '880']], 4));
return out;
