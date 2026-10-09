// PLACEHOLDER for chapter 03-space (fable): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 8,
    sequences: [
      P.bg(C.ink),
      ...P.tag('03', 'SPACE', '2.5D: cards in depth, a camera flight, depth of field with a'),
      { type: 'text', name: 'big', text: 'SPACE', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
