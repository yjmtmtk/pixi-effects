// 01 / TYPE — kinetic typography. Four beats, each a different way type can move: a word that rises letter by letter (animateText),
// a sentence whose words land on a beat (splitText + stagger), a counter ({value}), and one line in Japanese. Ink and bone, vermilion as the signal.
export default function chapter(P) {
  const { C, F, animateText, splitText, measureText, stagger } = P;
  const CX = 960, END = 8;
  const display = fontSize => ({ fontFamily: F.display, fontSize, fill: C.bone, letterSpacing: 2 });
  const japanese = fontSize => ({ fontFamily: F.jp, fontSize, fill: C.bone, fontWeight: '800' });
  const mono = { fontFamily: F.mono, fontSize: 44, fill: C.dim, letterSpacing: 2 };
  // The largest size (at most `max`) whose measured width still fits `maxW` (the margins are 96 px each side: 1728 px of room).
  const fit = (text, mk, max, maxW) => { let s = max; while (s > 120 && measureText(text, mk(s)).width > maxW) s -= 10; return mk(s); };
  // A small mono line under a beat: fades in, fades out with the beat.
  const label = (name, text, y, at, end) => ({
    type: 'text', name, text, style: mono, at, duration: end - at,
    initial: { x: CX, y, anchorX: 0.5, anchorY: 0.5, alpha: 0 },
    keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.3 }, { at: -0.2, to: { alpha: 0 }, duration: 0.2 }],
  });
  const sfx = (name, preset, at, volume = 0.4) => ({ type: 'audio', name, sfx: preset, at, volume });

  const seq = [P.bg(C.ink), ...P.tag('01', 'TYPE', 'letters, words and a counter: every piece is one layer of data')];

  // Beat 1 — a word rises letter by letter, a vermilion rule draws under it.
  const T1 = 0.7, T1_END = 2.5;
  const w1 = 'MOTION';
  const s1 = fit(w1, display, 340, 1500);
  const m1 = measureText(w1, s1);
  const y1 = 480 - m1.height / 2;                       // animateText's y is the TOP of the line box
  seq.push(...animateText(w1, s1, {
    x: CX, y: y1, align: 'center', name: 'motion', at: T1, duration: T1_END - T1,
    in: { from: { y: 70, alpha: 0 }, duration: 0.5, ease: 'power3.out' }, out: { preset: 'fade', duration: 0.25 }, stagger: { each: 0.07 },
  }));
  seq.push({
    type: 'shape', shape: 'rect', name: 'rule', height: 14, anchorX: 0, anchorY: 0, at: T1 + 0.55, duration: T1_END - T1 - 0.55,
    initial: { x: CX - m1.width / 2, y: y1 + m1.height + 14, width: 0, fillColor: C.red },
    keyframes: [{ at: 0, to: { width: m1.width }, duration: 0.45, ease: 'power3.out' }, { at: -0.25, to: { alpha: 0 }, duration: 0.25 }],
  });
  seq.push(label('l1', 'one layer per letter', y1 + m1.height + 90, T1 + 0.8, T1_END));
  seq.push(sfx('s1', 'swoosh', T1));

  // Beat 2 — two lines, one word per beat, the last word in vermilion. splitText measures each word's place; stagger spaces the arrivals.
  const T2 = 2.7, T2_END = 4.8, BEAT = 0.3;
  const s2 = fit('ON THE BEAT', display, 210, 1500);
  const h2 = measureText('EVERY WORD', s2).height, gap = 20;
  const top2 = 490 - (2 * h2 + gap) / 2;
  const words = [];
  [['EVERY WORD', top2], ['ON THE BEAT', top2 + h2 + gap]].forEach(([line, y], li) =>
    splitText(line, s2, { by: 'words', x: CX, y, align: 'center' }).forEach(p => words.push({
      type: 'text', name: `w${li}-${p.index}`, text: p.text, style: { ...s2, fill: p.text === 'BEAT' ? C.red : C.bone }, at: T2,
      initial: { x: p.x + p.width / 2, y: p.y + h2 / 2, anchorX: 0.5, anchorY: 0.5 },
      keyframes: [{ at: 0, from: { scale: 1.35, alpha: 0 }, to: { scale: 1, alpha: 1 }, duration: 0.22, ease: 'power3.out' }, { at: -0.2, to: { alpha: 0 }, duration: 0.2 }],
    })));
  const landed = stagger(words, { each: BEAT }).map(l => ({ ...l, duration: T2_END - l.at }));   // all leave together at T2_END
  seq.push(...landed);
  landed.forEach((l, i) => seq.push(sfx('s2-' + i, 'pop', l.at, 0.45)));
  seq.push(label('l2', `one layer per word, ${BEAT} s apart`, top2 + 2 * h2 + gap + 70, T2 + 1.3, T2_END));

  // Beat 4 — one line in Japanese: 動きは、データ。 ("motion is data"); the punctuation carries the signal colour. It settles before the transition.
  const T4 = 6.3;
  const jp = '動きは、データ。';
  const s4 = fit(jp, japanese, 220, 1500);
  const m4 = measureText(jp, s4);
  seq.push(...animateText(jp, s4, {
    x: CX, y: 480 - m4.height / 2, align: 'center', name: 'jp', at: T4, duration: END - T4,
    in: { from: { y: 50, alpha: 0 }, duration: 0.5, ease: 'power3.out' }, stagger: { each: 0.07 },
    styleFor: p => (/[、。]/.test(p.text) ? { fill: C.red } : {}),
  }));
  seq.push({ ...label('l4', 'motion is data', 480 + m4.height / 2 + 80, 7.0, END), keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.3 }] });
  seq.push(sfx('s4', 'swipe', T4));

  // Beat 3 — a counter: the pixels of one frame of this video (1920 × 1080 = 2,073,600), counted by one `value` keyframe; `format.grouping` writes the commas.
  const T3 = 4.9, T3_END = 6.3, PIXELS = 1920 * 1080;
  const s3 = fit(PIXELS.toLocaleString('en-US'), display, 320, 1500);   // sized on the final string, so the full number fits the margins
  seq.push({
    type: 'text', name: 'count', text: '{value}', format: { grouping: true }, style: s3, at: T3, duration: T3_END - T3,
    initial: { x: CX, y: 470, anchorX: 0.5, anchorY: 0.5, value: 0 },
    keyframes: [
      { at: 0, from: { alpha: 0, scale: 0.9 }, to: { alpha: 1, scale: 1 }, duration: 0.3, ease: 'power3.out' },
      { at: 0, to: { value: PIXELS }, duration: 1.1, ease: 'power2.out' },
      { at: -0.2, to: { alpha: 0 }, duration: 0.2 },
    ],
  });
  seq.push(label('l3', 'pixels in every frame, counted by one keyframe', 470 + measureText('0', s3).height / 2 + 70, T3 + 0.3, T3_END));
  seq.push(sfx('s3', 'chime', T3 + 0.9, 0.35));

  return { duration: END, poster: 3.95, sequences: seq };
}
