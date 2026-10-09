// PLACEHOLDER for chapter 08-motion (sonnet): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 7,
    sequences: [
      P.bg(C.ink),
      ...P.tag('08', 'MOTION', 'Springs, cubic-bezier easing, a time remap (slow, freeze, re'),
      { type: 'text', name: 'big', text: 'MOTION', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
