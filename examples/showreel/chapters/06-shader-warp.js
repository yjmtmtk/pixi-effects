// PLACEHOLDER for chapter 06-shader-warp (opus): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 7,
    sequences: [
      P.bg(C.ink),
      ...P.tag('06', 'SHADER AND WARP', 'Fragment shaders drawn by formula, a title bent like water'),
      { type: 'text', name: 'big', text: 'SHADER AND WARP', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
