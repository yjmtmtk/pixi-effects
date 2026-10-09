// PLACEHOLDER for chapter 01-type (fable): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 8,
    sequences: [
      P.bg(C.ink),
      ...P.tag('01', 'TYPE', 'Kinetic typography: per-letter and per-word entrances, a cou'),
      { type: 'text', name: 'big', text: 'TYPE', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
