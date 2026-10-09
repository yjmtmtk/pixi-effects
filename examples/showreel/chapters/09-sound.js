// 09 / SOUND: the music under this reel is text. The chapter reads the reel's own score (P.music, made by music.js) and draws the bars that
// play under it, as a piano roll that scrolls past a playhead: every bar carries its token ('e5:1.5', 'Am7:4'), the drum lanes are the
// pattern strings themselves ('x...x...'), and each note lights up as it sounds. The chord readout changes on the bar lines with a hit.
export default function chapter(P) {
  const { C, F } = P;
  const D = 8;
  // Where this chapter sits in the music. The music layer starts at 1.4 s (music.js: two bars before the 01-type cut) and this chapter at
  // 59.6 s in the reel (plan.chapters, 09-sound): the chapter cannot see the plan, so the two numbers are written here.
  const REEL_AT = 59.6, MUSIC_AT = 1.4;
  const M = P.music ?? { bpm: 120, tracks: [], drums: [] };
  const SPB = 60 / M.bpm;                                       // seconds per beat (0.5)
  const B0 = (REEL_AT - MUSIC_AT) / SPB;                        // the music's beat at this chapter's 0 s (116.4: bar 30 begins at -0.2 s)
  const tOf = b => (b - B0) * SPB;                              // chapter seconds of a beat
  const calm = t => t >= 0.6 && t <= D - 0.6;                   // the transitions own the edges

  // The roll: time runs right to left past the playhead at PH, PXB pixels a beat.
  const PH = 640, PXB = 150, X0 = 300, X1 = 1824;
  const X = b => PH + (b - B0) * PXB;                           // x at 0 s (the roll moves left 2 * PXB px a second)
  const LOOK = [B0 - 3, B0 + D / SPB + (X1 - PH) / PXB + 1];    // beats that are ever on screen

  // Read the score: the same strings the synthesiser plays.
  const parse = notes => {
    const ev = []; let b = 0;
    for (const raw of notes.split(/\s+/)) {
      if (!raw || raw === '|') continue;
      const tok = raw.replace(/[!,]/g, '');
      const [name, len] = tok.split(':');
      const l = len === undefined ? 1 : Number(len);
      if (name !== '_' && name !== '~') ev.push({ tok, name, beat: b, len: l });
      b += l;
    }
    return ev;
  };
  const midi = n => {
    const m = /^([a-g])(#|b)?(\d)$/i.exec(n);
    if (!m) return null;
    return 12 * (Number(m[3]) + 1) + { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  };
  const track = inst => (M.tracks.find(t => t.inst === inst) ?? { notes: '' });
  const inView = e => e.beat + e.len > LOOK[0] && e.beat < LOOK[1];
  const pad = parse(track('pad').notes).filter(inView);
  const lead = parse(track('lead').notes).filter(inView);
  const bass = parse(track('bass').notes).filter(inView);

  const mono = (size, fill, extra = {}) => ({ fontFamily: F.mono, fontSize: size, fill, ...extra });
  const TOKEN = mono(34, C.bone);
  const tokenW = s => P.measureText(s, TOKEN).width;
  const LANE = { pad: 338, lead: 488, bass: 650, kick: 758, clap: 856 };

  // a roll text whose right edge has scrolled out of the window is hidden (the window's matte already hides it; this keeps inspect's overlap list honest)
  const gone = right => (right - X0) / (2 * PXB);               // seconds until the right edge passes the window's left edge
  const hideAt = right => (gone(right) > 0 ? [{ at: gone(right), set: { alpha: 0 } }] : []);
  const until = right => k => k.at < D && (k.set?.alpha === 0 || gone(right) <= 0 || k.at < gone(right));
  const roll = [];
  // bar lines (every 4 beats) and lane hairlines
  for (let k = Math.ceil(LOOK[0] / 4); k * 4 < LOOK[1]; k++) {
    roll.push({ type: 'shape', shape: 'rect', name: `barline-${k}`, width: 2, height: 600, anchorX: 0.5, anchorY: 0,
      initial: { x: X(4 * k), y: 296, fillColor: C.bone, alpha: 0.12 } });
  }

  // a note: a bar as long as the note, its token written on it, lit while it sounds
  const note = (e, i, lane, { y, h, color, onAlpha, offAlpha, label }) => {
    const t0 = tOf(e.beat), t1 = tOf(e.beat + e.len), w = e.len * PXB - 8;
    roll.push({ type: 'shape', shape: 'rect', name: `${lane}-bar-${i}`, width: w, height: h, cornerRadius: 8, anchorX: 0, anchorY: 0.5,
      initial: { x: X(e.beat) + 4, y, fillColor: color, strokeColor: color, strokeWidth: 2,
        ...(t1 <= 0 ? { fillAlpha: offAlpha * 0.6, strokeAlpha: 0.3 } : t0 <= 0 ? { fillAlpha: onAlpha, strokeAlpha: 1 } : { fillAlpha: offAlpha, strokeAlpha: 0.55 }) },
      keyframes: [
        { at: t0, set: { fillAlpha: onAlpha, strokeAlpha: 1 } },
        { at: t1, to: { fillAlpha: offAlpha * 0.6, strokeAlpha: 0.3 }, duration: 0.35, ease: 'power2.out' },
      ].filter(k => k.at > 0 && k.at < D) });
    const right = X(e.beat) + 16 + tokenW(e.tok);
    if (label && tokenW(e.tok) + 24 <= w) {
      roll.push({ type: 'text', name: `${lane}-tok-${i}`, text: e.tok, style: label,
        initial: { x: X(e.beat) + 16, y, anchorX: 0, anchorY: 0.5, alpha: gone(right) <= 0 ? 0 : t1 <= 0 ? 0.45 : t0 <= 0 ? 1 : 0.7 },
        keyframes: [{ at: t0, set: { alpha: 1 } }, { at: t1, to: { alpha: 0.45 }, duration: 0.35 }, ...hideAt(right)]
          .filter(k => k.at > 0).filter(until(right)) });
    }
  };
  pad.forEach((e, i) => note(e, i, 'pad', { y: LANE.pad, h: 56, color: C.bone, onAlpha: 0.2, offAlpha: 0.05, label: mono(36, C.bone) }));
  const leadY = e => LANE.lead + (76.5 - midi(e.name)) * 13;
  lead.forEach((e, i) => note(e, i, 'lead', { y: leadY(e), h: 42, color: C.red, onAlpha: 0.95, offAlpha: 0.14, label: TOKEN }));
  const bassY = e => LANE.bass - (midi(e.name) - 38) * 2;
  bass.forEach((e, i) => note(e, i, 'bass', { y: bassY(e), h: 40, color: C.dim, onAlpha: 0.55, offAlpha: 0.1, label: TOKEN }));

  // the drum lanes: the pattern strings themselves, one character per 16th, each hit a cell that flashes gold
  const STEP = PXB / 4;
  const adv = tokenW('x'.repeat(16)) / 16;
  const DRUM = mono(34, C.bone, { letterSpacing: STEP - adv });
  const drumBars = name => {
    const out = [];
    for (let k = Math.floor(LOOK[0] / 4); k * 4 < LOOK[1]; k++) {
      const entry = (M.drums ?? []).find(d => d[name] && d.from <= 4 * k && 4 * k < (d.to ?? Infinity) && (d.to ?? Infinity) - d.from >= 4);
      if (entry) out.push({ k, pattern: entry[name].replace(/[\s|]/g, '').slice(0, 16) });
    }
    return out;
  };
  for (const name of ['kick', 'clap']) {
    for (const { k, pattern } of drumBars(name)) {
      [...pattern].forEach((c, s) => {
        if (c === '.') return;
        const b = 4 * k + s / 4, t = tOf(b);
        roll.push({ type: 'shape', shape: 'rect', name: `${name}-cell-${k}-${s}`, width: STEP - 6, height: 52, cornerRadius: 6,
          initial: { x: X(b) + adv / 2, y: LANE[name], fillColor: C.gold, alpha: 0.16 },
          keyframes: t < 0 || t >= D - 0.05 ? [] : [{ at: t, set: { alpha: 0.95 } }, { at: t + 0.02, to: { alpha: 0.22 }, duration: 0.4, ease: 'power2.out' }] });
      });
      roll.push({ type: 'text', name: `${name}-steps-${k}`, text: pattern, style: DRUM,
        initial: { x: X(4 * k), y: LANE[name], anchorX: 0, anchorY: 0.5, alpha: gone(X(4 * k) + 16 * STEP) > 0 ? 0.85 : 0 },
        keyframes: hideAt(X(4 * k) + 16 * STEP).filter(k => k.at < D) });
    }
  }

  // lane names: the keys of the data
  const names = Object.entries(LANE).map(([n, y]) => ({ type: 'text', name: `lane-${n}`, text: n, style: mono(34, C.dim),
    initial: { x: 96, y, anchorX: 0, anchorY: 0.5 } }));

  const changes = pad.filter(e => calm(tOf(e.beat)));          // chords that begin inside the chapter (the bar lines with a hit)
  // the playhead: a red line, and a glow that follows the beat (a bpm envelope on the same tempo as the score)
  const env = P.bpmEnvelope(M.bpm, { duration: D + 1, frameRate: 30 });
  const phase = (B0 - 4 * Math.floor(B0 / 4)) * SPB;           // where in its bar this chapter starts: the envelope's bar starts on ours
  const playhead = [
    { type: 'shape', shape: 'rect', name: 'ph-glow', width: 90, height: 620, anchorX: 0.5, anchorY: 0,
      initial: { x: PH, y: 292, fillGradient: { angle: 0, stops: [[0, 'rgba(255,90,54,0)'], [0.5, 'rgba(255,90,54,0.55)'], [1, 'rgba(255,90,54,0)']] } },
      keyframes: P.react(env, { duration: D, audioOffset: phase, props: { alpha: { base: 0.15, amount: 0.85, band: 'bass', beats: true, decay: 0.22 } } }) },
    { type: 'shape', shape: 'rect', name: 'ph-line', width: 4, height: 620, anchorX: 0.5, anchorY: 0, initial: { x: PH, y: 292, fillColor: C.red },
      keyframes: changes.flatMap(e => [                        // a flash on every bar line where the chord changes (the sfx hit lands here)
        { at: tOf(e.beat), set: { width: 14, fillColor: C.bone } },
        { at: tOf(e.beat) + 0.03, to: { width: 4, fillColor: C.red }, duration: 0.4, ease: 'power2.out' },
      ]) },
  ];
  // a ring where each melody note starts, on the playhead
  const rings = lead.filter(e => calm(tOf(e.beat))).map((e, i) => ({
    type: 'shape', shape: 'circle', name: `ring-${i}`, at: tOf(e.beat), duration: 0.5,
    initial: { x: PH, y: leadY(e), radius: 12, fillAlpha: 0, strokeColor: C.red, strokeWidth: 4, alpha: 1 },
    keyframes: [{ at: 0, to: { radius: 54, alpha: 0, strokeWidth: 1 }, duration: 0.5, ease: 'power2.out' }],
  }));

  // the headline, a text cursor that blinks on the beat, and the chord readout that changes on the bar lines (with a hit)
  const HEAD = { fontFamily: F.display, fontSize: 108, fill: C.bone };
  const headW = P.measureText('SOUND IS TEXT', HEAD);
  const HEAD_Y = 120;
  const headline = P.animateText('SOUND IS TEXT', HEAD, { x: 96, y: HEAD_Y, name: 'head', by: 'words', at: 0.6, duration: D - 0.6,
    in: { preset: 'rise', duration: 0.6, ease: 'power3.out' }, stagger: { each: 0.09 },
    styleFor: p => (p.text === 'TEXT' ? { fill: C.red } : {}) });
  const cursor = { type: 'shape', shape: 'rect', name: 'cursor', at: 1.0, width: 16, height: 88, anchorX: 0, anchorY: 0.5,
    initial: { x: 96 + headW.width + 22, y: HEAD_Y + headW.height / 2, fillColor: C.red },
    keyframes: P.react(env, { duration: D - 1.0, audioOffset: phase + 1.0, props: { alpha: { base: 0.2, amount: 0.8, beats: true, decay: 0.3 } } }) };
  const first = pad.filter(e => tOf(e.beat) <= 0.6).pop() ?? pad[0];
  const chord = { type: 'text', name: 'chord', text: first ? first.name : '', style: mono(96, C.bone, { fontWeight: 'bold' }), at: 0.9,
    initial: { x: 1824, y: HEAD_Y + headW.height / 2, anchorX: 1, anchorY: 0.5 },
    keyframes: [
      { at: 0, from: { alpha: 0, y: HEAD_Y + headW.height / 2 + 30 }, duration: 0.5, ease: 'power3.out' },
      ...changes.flatMap(e => [
        { at: tOf(e.beat) - 0.9, set: { text: e.name, fill: C.red } },
        { at: tOf(e.beat) - 0.9, from: { scale: 1.18 }, to: { scale: 1 }, duration: 0.4, ease: 'power3.out' },
        { at: tOf(e.beat) - 0.9 + 0.25, to: { fill: C.bone }, duration: 0.4 },
      ]),
    ] };
  const hits = changes.map((e, i) => ({ type: 'audio', name: `hit-${i}`, sfx: { preset: 'hit', brightness: 0.3 }, at: tOf(e.beat), volume: 0.4 }));

  // where we are in the score, beat by beat
  const pos = b => `${M.bpm} BPM · BAR ${Math.floor(b / 4) + 1} · ${(((b % 4) + 4) % 4) + 1}`;
  const beats = [];
  for (let b = Math.ceil(B0); tOf(b) < D; b++) beats.push(b);
  const readout = { type: 'text', name: 'readout', text: pos(Math.floor(B0)), style: mono(34, C.dim), at: 0.5,
    initial: { x: 1824, y: 84, anchorX: 1, anchorY: 0.5 },
    keyframes: [{ at: 0, from: { alpha: 0 }, duration: 0.5 }, ...beats.map(b => ({ at: tOf(b) - 0.5, set: { text: pos(b) } })).filter(k => k.at > 0)] };

  return {
    duration: D,
    poster: 4.4,
    sequences: [
      P.bg(C.ink),
      ...P.tag('09', 'SOUND', 'the music under this reel is text, drawn as it plays'),
      ...Object.entries(LANE).filter(([n]) => n !== 'lead').map(([n, y]) => ({ type: 'shape', shape: 'rect', name: `hair-${n}`, width: X1 - X0, height: 2,
        anchorX: 0, anchorY: 0.5, initial: { x: X0, y: y + 40, fillColor: C.bone, alpha: 0.06 } })),
      { type: 'shape', shape: 'rect', name: 'roll-window', width: X1 - X0, height: 640, anchorX: 0, anchorY: 0,
        initial: { x: X0, y: 284, fillGradient: { angle: 0, stops: [[0, 'rgba(255,255,255,0)'], [0.06, 'rgba(255,255,255,1)'], [0.94, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']] } } },
      { type: 'composition', name: 'roll', width: 6000, height: 1080, mask: { layer: 'roll-window', channel: 'alpha' },
        initial: { x: 0, y: 0 }, keyframes: [{ at: 0, to: { x: -(D / SPB) * PXB }, duration: D, ease: 'none' }], sequences: roll },
      ...names,
      ...playhead,
      ...rings,
      ...headline,
      cursor,
      chord,
      readout,
      ...hits,
    ],
  };
}
