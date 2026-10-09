// PLACEHOLDER for chapter 07-filters-particles (sonnet): replace this whole file.
export default function chapter(P) {
  const { C, F } = P;
  return {
    duration: 7,
    sequences: [
      P.bg(C.ink),
      ...P.tag('07', 'FILTERS AND PARTICLES', 'Glow, CRT, glitch, film grain; a seeded particle burst'),
      { type: 'text', name: 'big', text: 'FILTERS AND PARTICLES', style: { fontSize: 120, fill: C.bone, fontFamily: F.display }, initial: { x: 960, y: 540, anchorX: 0.5, anchorY: 0.5 } },
    ],
  };
}
