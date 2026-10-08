const W = 320, H = 180;
const bg = { type: 'shape', shape: 'rect', width: W, height: H, initial: { x: W / 2, y: H / 2, fillColor: '#101830' } };
const spring = () => [{ type: 'shape', shape: 'circle', radius: 20, initial: { x: 160, y: 30, fillColor: '#ffcc00' }, keyframes: [
  { at: 1, from: { y: 30 }, to: { y: 150 }, duration: 2, ease: 'spring(1, 170, 12)' }, { at: 4, to: { y: 40 }, duration: 'auto', ease: 'spring(1, 170, 12)' }] }];
await mk({ frameRate: 60, duration: 8, composition: { sequences: [{ type: 'composition', width: W, height: H, duration: 8, sequences: [bg, ...spring()] }] } });
const a = await snap(100);
const ys = []; const lay = movie._rootSequence._children[0]._children[1];
for (const f of [99, 100, 101]) { await movie.gotoFrame(f, true); ys.push(lay.target.y); }
await mk({ frameRate: 60, duration: 4, composition: { sequences: [{ type: 'composition', width: W, height: H, duration: 4, speed: 2, sequences: [bg, ...spring()] }] } });
const b = await snap(50);
await movie.gotoFrame(50, true);
const lay2 = movie._rootSequence._children[0]._children[1];
return { a, b, y1: lay2.target.y, yPlain: ys, clock: movie._rootSequence._children[0]._clock.time };
