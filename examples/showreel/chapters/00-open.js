// 00-open: the reel's first six seconds and its thumbnail. A red diamond (the mark) shrinks into place, the letters of
// `pixi-effects` assemble beside it, a hairline underlines them, and the claim lands in plain words: a video is a file of data.
export default function chapter(P) {
  const { C, F } = P;
  const D = 6;
  // --- the title group: diamond + gap + word, centred as one block ---------------------------------------------------------
  const SIZE = 184;
  const titleStyle = { fontSize: SIZE, fontFamily: F.display, fill: C.bone, letterSpacing: -2 };
  const wordW = P.measureText('pixi-effects', titleStyle).width;
  const SIDE = 76, DIAG = SIDE * Math.SQRT2, GAP = 56;
  const groupW = DIAG + GAP + wordW;
  const left = 960 - groupW / 2;
  const TOP = 352;                                  // top of the title's line box
  const midY = TOP + SIZE * 0.62;                   // the x-height centre of the lowercase word, where the mark sits
  const diamondX = left + DIAG / 2;
  const wordX = left + DIAG + GAP;
  const RULE_Y = TOP + SIZE * 1.02;                 // the hairline, just under the baseline (descenders sit on it)
  // --- when -----------------------------------------------------------------------------------------------------------------
  const MARK_IN = 0.6;                              // the mark is in place before the first letters reach it
  const LETTERS_AT = 0.18, EACH = 0.055, LETTER_IN = 0.5;
  const letters = P.splitText('pixi-effects', titleStyle, { x: wordX, y: TOP, align: 'left' });
  const lastLand = LETTERS_AT + (letters.length - 1) * EACH + LETTER_IN;   // ≈ 1.2 s
  const CLAIM_AT = 1.3;                             // the claim has fully landed by ≈ 2.2 s
  const claimStyle = { fontSize: 72, fontFamily: F.serif, fill: C.bone, fontStyle: 'italic' };
  const HINT_AT = 2.7;
  const hintStyle = { fontSize: 36, fontFamily: F.mono, fill: C.dim, letterSpacing: 1 };
  const hints = [
    '{ "type": "shape", "shape": "rect", "rotation": 45, "fillColor": "#ff5a36" }',
    '{ "type": "text", "text": "pixi-effects", "keyframes": [ … ] }',
  ];
  return {
    duration: D,
    poster: 2.6,
    sequences: [
      P.bg(C.ink),
      ...P.tag('00', 'OPEN', '', { at: 2.4 }),
      // the mark: big and alone at frame 0, then it shrinks into its place before the word
      { type: 'shape', shape: 'rect', name: 'mark', width: SIDE, height: SIDE,
        initial: { x: diamondX, y: midY, rotation: 45, fillColor: C.red, scale: 1 },
        keyframes: [{ at: 0, from: { x: 960, y: 500, scale: 3.6 }, to: { x: diamondX, y: midY, scale: 1 }, duration: MARK_IN, ease: 'power3.out' }] },
      // the letters assemble: alternately from above and below, each a little after the one before
      ...letters.map((p, i) => ({
        type: 'text', name: 'letter-' + i, text: p.text, style: titleStyle, at: LETTERS_AT + i * EACH,
        initial: { x: p.x, y: p.y, alpha: 0 },
        keyframes: [{ at: 0, from: { y: p.y + (i % 2 ? 96 : -96), alpha: 0 }, to: { y: p.y, alpha: 1 }, duration: LETTER_IN, ease: 'power3.out' }],
      })),
      // the hairline draws on under the whole group as the last letters land
      { type: 'shape', shape: 'line', name: 'rule', from: [left, RULE_Y], to: [left + groupW, RULE_Y], trimEnd: 0, strokeCap: 'round',
        initial: { strokeColor: C.bone, strokeWidth: 3, alpha: 0.7 },
        keyframes: [{ at: 0.55, to: { trimEnd: 1 }, duration: 0.8, ease: 'power2.inOut' }] },
      // the claim, word by word; "data" is the only other red thing on screen
      ...P.animateText('a video is a file of data.', claimStyle, {
        by: 'words', name: 'claim', x: 960, y: RULE_Y + 70, align: 'center', at: CLAIM_AT, duration: D - CLAIM_AT,
        in: { from: { y: 36, alpha: 0 }, duration: 0.45, ease: 'power3.out' }, stagger: { each: 0.09 },
        styleFor: p => (p.text.startsWith('data') ? { fill: C.red } : {}),
      }),
      // a quiet hint that it is made from data: two lines of JSON typed out at the bottom, dim and small
      ...hints.map((h, i) => ({
        type: 'text', name: 'hint-' + i, text: h, style: hintStyle, at: HINT_AT + i * 0.5, duration: D - HINT_AT - i * 0.5,
        initial: { x: 96, y: 940 + i * 50, anchorX: 0, anchorY: 0.5, visibleChars: 0, alpha: 0.8 },
        keyframes: [{ at: 0, to: { visibleChars: h.length }, duration: 0.9, ease: 'none' }],
      })),
      // sound: the mark whooshes into place, the word lands, the claim's last word pops
      { type: 'audio', name: 'sfx-swoosh', sfx: 'swoosh', at: 0, volume: 0.45 },
      { type: 'audio', name: 'sfx-land', sfx: { preset: 'hit', pitch: -3 }, at: lastLand - 0.15, volume: 0.45 },
      { type: 'audio', name: 'sfx-data', sfx: { preset: 'pop', pitch: 4 }, at: CLAIM_AT + 5 * 0.09 + 0.1, volume: 0.4 },
    ],
  };
}
