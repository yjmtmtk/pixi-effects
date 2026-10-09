// PLACEHOLDER for chapter 02-shapes (opus): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 7,
    sequences: [
      P.bg(C.ink),
      ...P.tag('02', 'SHAPES', 'Draw-on strokes, arcs and rings, gradients that move, a path'),
      { type: 'text', name: 'big', text: 'SHAPES', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
