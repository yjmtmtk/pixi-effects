// PLACEHOLDER for chapter 05-blend-matte (opus): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 7,
    sequences: [
      P.bg(C.ink),
      ...P.tag('05', 'BLEND AND MATTE', 'Blend modes (light leaks), one matte shared by several layer'),
      { type: 'text', name: 'big', text: 'BLEND AND MATTE', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
