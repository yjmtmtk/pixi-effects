// decode cost: forward vs reverse on 720p green.mp4 (and the 320x180 test clip)
const res = {};
for (const [label, asset, src, w, h] of [['t.mp4 320x180 g=30', 'v', 't.mp4', 320, 180], ['green.mp4 1280x720', 'g', '../examples/_assets/green.mp4', 1280, 720]]) {
  for (const [name, extra] of [['forward', {}], ['reverse', { speed: -1 }], ['speed2', { speed: 2 }]]) {
    await mk({ width: w, height: h, duration: 5, assets: [{ name: asset, src }], composition: { sequences: [{ type: 'video', asset, duration: 5, audio: false, ...extra }] } });
    const canvas = document.getElementById('stage');
    const t0 = performance.now();
    for (let f = 0; f < 150; f++) await movie.gotoFrame(f, true);
    res[label + ' ' + name] = +((performance.now() - t0) / 150).toFixed(2);
  }
}
return res;
