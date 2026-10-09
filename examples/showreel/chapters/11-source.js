// PLACEHOLDER for chapter 11-source (fable): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 8,
    sequences: [
      P.bg(C.ink),
      ...P.tag('11', 'SOURCE', 'This videos own data scrolling, the measured size, the inst'),
      { type: 'text', name: 'big', text: 'SOURCE', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
