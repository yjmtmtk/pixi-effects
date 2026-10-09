// PLACEHOLDER for chapter 04-light (opus): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 8,
    sequences: [
      P.bg(C.ink),
      ...P.tag('04', 'LIGHT', 'A lamp across a dark room: lit cards, shadows on the wall, f'),
      { type: 'text', name: 'big', text: 'LIGHT', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
