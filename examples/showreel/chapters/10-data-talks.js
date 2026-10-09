// PLACEHOLDER for chapter 10-data-talks (sonnet): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 7,
    sequences: [
      P.bg(C.ink),
      ...P.tag('10', 'DATA AND TALKS', 'A chart that draws itself, a counter, a slide deck with stop'),
      { type: 'text', name: 'big', text: 'DATA AND TALKS', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
