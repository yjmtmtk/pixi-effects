// What every chapter of the reel shares. The build (scripts/build-showreel.mjs) inlines this file into one page: it is ONE function, no imports,
// no other top-level code. `lib` is everything pixi-effects exports at run time; `facts` is what the reel knows about itself (for the last chapter).
export default function shared(lib, facts) {
  // The reel's palette: ink and bone carry it, vermilion is the signal, cyan and gold are guests (one of them per chapter, not both everywhere).
  const C = { ink: '#0b0d12', ink2: '#141824', bone: '#f2ede4', dim: '#98a1b3', red: '#ff5a36', cyan: '#38c8ff', gold: '#ffd166' };
  // System font stacks only (nothing is loaded): the same on any machine that has them.
  const F = {
    display: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
    sans: "'Helvetica Neue', Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    mono: "ui-monospace, Menlo, Consolas, monospace",
    jp: "'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Noto Sans JP', sans-serif",
  };
  // The label every chapter wears, so the reel reads as one piece: "03 / SPACE" top left, one line of caption bottom left.
  // Margins are 96 px left and right, 54 px top and bottom: keep everything else inside them. The reel is watched on a phone, often with the
  // sound off (X plays video muted): every piece of text must still be readable at a quarter of the size (nothing under 34 px).
  function tag(n, title, caption, o = {}) {
    const at = o.at ?? 0.5;
    return [
      { type: 'text', name: 'tag', text: `${n} / ${title}`, style: { fontSize: 34, fill: o.color ?? C.dim, fontFamily: F.mono, letterSpacing: 8 },
        initial: { x: 96, y: 84, anchorX: 0, anchorY: 0.5, alpha: 0 }, keyframes: [{ at, to: { alpha: 1 }, duration: 0.5 }] },
      caption ? { type: 'text', name: 'caption', text: caption, style: { fontSize: 40, fill: o.captionColor ?? C.bone, fontFamily: F.mono, letterSpacing: 1 },
        initial: { x: 96, y: 996, anchorX: 0, anchorY: 0.5, alpha: 0 }, keyframes: [{ at: at + 0.2, to: { alpha: 0.85 }, duration: 0.5 }] } : null,
    ].filter(Boolean);
  }
  // A full-frame opaque background. EVERY chapter starts with one: the transitions blend two whole chapters.
  const bg = (color = C.ink, name = 'bg') => ({ type: 'shape', shape: 'rect', name, width: 1920, height: 1080, anchorX: 0, anchorY: 0, initial: { x: 0, y: 0, fillColor: color } });
  // When each chapter starts: a chapter starts `overlap` seconds before the one before it ends (the transition between them runs in that overlap).
  function planOf(table) {
    let at = 0;
    const chapters = table.chapters.map((c, i) => { if (i > 0) at -= table.overlap; const row = { id: c.id, at, duration: c.duration }; at += c.duration; return row; });
    return { total: Math.round(at * 1000) / 1000, overlap: table.overlap, chapters };
  }
  return { ...lib, C, F, tag, bg, planOf, facts, music: undefined };
}
