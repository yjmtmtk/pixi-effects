await mk({ duration: 8, composition: { sequences: [{ type: 'video', asset: 'v', duration: 8, audio: false }] } });
const seen = new Map(); const dups = [];
for (let f = 0; f < 240; f++) { const s = await snap(f); if (seen.has(s)) dups.push([f, seen.get(s)]); else seen.set(s, f); }
const v = movie._rootSequence._children[0];
const ts = [];
for (let k = 0; k < 8; k++) { const smp = await v._cache.sink.getSample(k / 30); ts.push(smp && smp.timestamp); }
const fl = []; for (let k = 55; k < 66; k++) fl.push(k / 30);
return { nDups: dups.length, first: dups.slice(0, 12), ts, firstFloats: fl.map(x => x.toString()) };
