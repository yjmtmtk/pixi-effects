// PLACEHOLDER for chapter 09-sound (opus): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 8,
    sequences: [
      P.bg(C.ink),
      ...P.tag('09', 'SOUND', 'Sound is text too: the music of this reel as notation, sfx h'),
      { type: 'text', name: 'big', text: 'SOUND', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
