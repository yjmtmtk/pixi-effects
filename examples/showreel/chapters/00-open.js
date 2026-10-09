// PLACEHOLDER for chapter 00-open (fable): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 6,
    sequences: [
      P.bg(C.ink),
      ...P.tag('00', 'OPEN', 'A word becomes a video: the title and the claim a video is '),
      { type: 'text', name: 'big', text: 'OPEN', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
