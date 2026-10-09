// 03 SPACE — 2.5D without a 3D engine: five cards hang at five depths (each prints its own z), a camera dollies in on offsetZ while the near
// cards slip past the lens, and the focus racks from the nearest card to the far one, the vermilion word DEPTH.
export default function chapter(P) {
  const { C, F } = P;
  const HERO_Z = -700;
  // A card is a threeD composition: a paper rect, a small mono "z", the big number (or word). Identical cards, only z differs: the screen size,
  // the overlap and the blur are the depth.
  const card = ({ name, x, y, z, w, h, fill, ink, rotY = 0, rotX = 0, big, size, label, near = false, keyframes = [] }) => ({
    type: 'composition', name, threeD: true, hideBehindCamera: near, width: w, height: h,
    initial: { x, y, z, pivotX: w / 2, pivotY: h / 2, rotationY: rotY, rotationX: rotX },
    keyframes,
    sequences: [
      { type: 'shape', shape: 'rect', name: name + '-paper', width: w, height: h, cornerRadius: 10,
        initial: { x: w / 2, y: h / 2, fillColor: fill, strokeColor: C.ink, strokeWidth: 3 } },
      { type: 'text', name: name + '-z', text: label, style: { fontSize: 46, fill: ink, fontFamily: F.mono, letterSpacing: 2 },
        initial: { x: 30, y: 26, anchorX: 0, anchorY: 0, alpha: 0.8 } },
      { type: 'text', name: name + '-word', text: big, style: { fontSize: size, fill: ink, fontFamily: F.display },
        initial: { x: w / 2, y: h / 2 + 22, anchorX: 0.5, anchorY: 0.5 } },
    ],
  });
  const paper = { w: 400, h: 240, fill: C.bone, ink: C.ink, size: 92, label: 'z' };
  return {
    duration: 8,
    poster: 6.0,
    sequences: [
      P.bg(C.ink),
      // The camera: looks at the far card the whole time (so it stays centred and everything else parallaxes), dollies in on offsetZ, sways a
      // little, and racks the focus from the nearest card to the far one half way through the flight.
      { type: 'camera', name: 'cam',
        initial: { x: 880, y: 590, lookAtX: 960, lookAtY: 540, lookAtZ: HERO_Z, focus: 'card-near', aperture: 44 },
        keyframes: [
          { at: 1.2, to: { offsetZ: -900 }, duration: 4.4, ease: 'power2.inOut' },
          { at: 1.2, to: { x: 1010, y: 510 }, duration: 4.4, ease: 'power2.inOut' },
          { at: 3.0, to: { focus: 'card-hero' }, duration: 1.5, ease: 'power2.inOut' },
        ] },
      // Far to near (array order does not matter for threeD layers: they are drawn farthest-first). The side cards sit far enough off the
      // camera's path that they leave the frame whole as the camera passes them.
      card({ name: 'card-hero', x: 960, y: 540, z: HERO_Z, w: 1000, h: 560, fill: C.red, ink: C.bone, size: 196, label: 'z  -700', big: 'DEPTH',
        rotY: -16, rotX: 4, keyframes: [{ at: 1.6, to: { rotationY: 0, rotationX: 0 }, duration: 3.8, ease: 'power2.inOut' }] }),
      card({ ...paper, name: 'card-d', x: 560, y: 690, z: -450, rotY: 14, rotX: -3, big: '-450' }),
      card({ ...paper, name: 'card-c', x: 1700, y: 250, z: -200, rotY: -12, rotX: 5, big: '-200' }),
      card({ ...paper, name: 'card-b', x: 440, y: 380, z: 150, rotY: 12, rotX: 2, big: '+150', near: true }),
      card({ ...paper, name: 'card-near', x: 1280, y: 650, z: 500, rotY: -10, rotX: -4, big: '+500', near: true }),
      // Sound: the flight starts, the focus lands, the dolly settles.
      { type: 'audio', name: 'sfx-fly', sfx: 'swoosh', at: 1.25, volume: 0.35 },
      { type: 'audio', name: 'sfx-focus', sfx: 'click', at: 4.75, volume: 0.45 },
      { type: 'audio', name: 'sfx-land', sfx: { preset: 'hit', pitch: -5 }, at: 5.45, volume: 0.3 },
      // The label last: it is 2D and must stay on top of the cards.
      ...P.tag('03', 'SPACE', 'cards at five depths: a dolly in, a rack focus to the far one'),
    ],
  };
}
