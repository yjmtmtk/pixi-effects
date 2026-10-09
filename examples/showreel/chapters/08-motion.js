export default function chapter(P) {
  const { C, F } = P;

  // One visual system: a lane per easing, a dot per lane, all leaving the start line together and aiming at the same finish line.
  // The clock lane on top shows the composition's own time, which the chapter then freezes, rewinds and replays in slow motion.
  const X0 = 540, X1 = 1420;            // start and finish line (px)
  const LEN = 1.8;                      // seconds of content in the race (its own clock)
  const GO = 0.1, RUN = 1.4;            // the easings leave at 0.1 s of the race and take 1.4 s (springs: their own settle time)
  const laneY = (i) => 200 + i * 140;

  // the clock, in the movie's seconds: calm, play, freeze, rewind, hold, slow motion (0.6x), calm
  const T = { play: 0.8, freeze: 2.6, rewind: 3.0, hold: 3.6, slow: 3.7, end: 6.3 };
  const clockKeys = (prop, map) => [
    { at: T.play, from: { [prop]: map(0) }, to: { [prop]: map(LEN) }, duration: LEN, ease: 'none' },
    { at: T.freeze, to: { [prop]: map(LEN) }, duration: T.rewind - T.freeze },
    { at: T.rewind, to: { [prop]: map(0) }, duration: T.hold - T.rewind, ease: 'power2.inOut' },
    { at: T.hold, to: { [prop]: map(0) }, duration: T.slow - T.hold },
    { at: T.slow, to: { [prop]: map(LEN) }, duration: T.end - T.slow, ease: 'none' },
  ];

  const lanes = [
    { name: 'linear', label: 'linear', ease: 'none', dur: RUN, color: C.bone },
    { name: 'power2', label: 'power2.inOut', ease: 'power2.inOut', dur: RUN, color: C.bone },
    { name: 'bezier', label: 'cubic-bezier', ease: 'cubic-bezier(.2, .8, .2, 1)', dur: RUN, color: C.cyan },
    { name: 'bouncy', label: 'spring.bouncy', ease: 'spring.bouncy', dur: 'auto', color: C.red },
    { name: 'wobbly', label: 'spring.wobbly', ease: 'spring.wobbly', dur: 'auto', color: C.red },
  ];

  const tracks = [];
  const labels = [];
  const dots = [];
  // the clock lane (lane 0)
  labels.push({ type: 'text', name: 'label-clock', text: 'clock', style: { fontSize: 38, fill: C.dim, fontFamily: F.mono },
    initial: { x: 96, y: laneY(0), anchorX: 0, anchorY: 0.5 } });
  tracks.push({ type: 'shape', shape: 'rect', name: 'track-clock', width: X1 - X0, height: 4, anchorX: 0, anchorY: 0.5,
    initial: { x: X0, y: laneY(0), fillColor: C.dim, fillAlpha: 0.35 } });
  lanes.forEach((l, k) => {
    const y = laneY(k + 1);
    labels.push({ type: 'text', name: 'label-' + l.name, text: l.label, style: { fontSize: 38, fill: l.color === C.bone ? C.bone : l.color, fontFamily: F.mono },
      initial: { x: 96, y, anchorX: 0, anchorY: 0.5 } });
    tracks.push({ type: 'shape', shape: 'rect', name: 'track-' + l.name, width: X1 - X0, height: 4, anchorX: 0, anchorY: 0.5,
      initial: { x: X0, y, fillColor: C.dim, fillAlpha: 0.35 } });
    // the part of the track already travelled: it grows with the same ease as the dot
    dots.push({ type: 'shape', shape: 'rect', name: 'trail-' + l.name, width: X1 - X0, height: 10, anchorX: 0, anchorY: 0.5,
      initial: { x: X0, y, fillColor: l.color, fillAlpha: 0.55, scaleX: 0 },
      keyframes: [{ at: GO, to: { scaleX: 1 }, duration: l.dur, ease: l.ease }] });
    dots.push({ type: 'shape', shape: 'circle', name: 'dot-' + l.name, radius: 34,
      initial: { x: X0, y, fillColor: l.color },
      keyframes: [{ at: GO, to: { x: X1 }, duration: l.dur, ease: l.ease }] });
  });

  const line = (name, x) => ({ type: 'shape', shape: 'rect', name, width: 4, height: 800, anchorX: 0.5, anchorY: 0,
    initial: { x, y: 150, fillColor: C.dim, fillAlpha: 0.3 } });

  // the race: its own clock is driven by `time` keyframes (the dots and trails inside are written in the race's own seconds)
  const race = {
    type: 'composition', name: 'race', duration: 7, width: 1920, height: 1080,
    initial: { time: 0 },
    keyframes: clockKeys('time', (t) => t),
    sequences: dots,
  };

  // everything that moves together shakes together: the seeded handheld wiggle rides on the stage during the slow motion
  const stage = {
    type: 'composition', name: 'stage', duration: 7, width: 1920, height: 1080,
    initial: { x: 0, y: 0 },
    keyframes: P.wiggle({ at: T.slow, duration: T.end - T.slow, freq: 9, seed: 4,
      props: { x: { around: 0, amp: 8 }, y: { around: 0, amp: 5 } } }),
    sequences: [
      line('start-line', X0), line('finish-line', X1),
      ...tracks, ...labels,
      race,
      // the playhead of the race's clock: the same keyframes, drawn as a tick on the top lane
      { type: 'shape', shape: 'rect', name: 'playhead', width: 8, height: 64, anchorX: 0.5, anchorY: 0.5, cornerRadius: 3,
        initial: { x: X0, y: laneY(0), fillColor: C.bone },
        keyframes: clockKeys('x', (t) => X0 + (t / LEN) * (X1 - X0)) },
    ],
  };

  // what the clock is doing, in one or two words (top right)
  const status = (name, text, at, until, color) => ({
    type: 'text', name, text, at, duration: until - at, style: { fontSize: 64, fill: color, fontFamily: F.display },
    initial: { x: 1824, y: 84, anchorX: 1, anchorY: 0.5, alpha: 0 },
    keyframes: [{ at: 0, to: { alpha: 1 }, duration: 0.12 }, { at: -0.12, to: { alpha: 0 }, duration: 0.12 }],
  });

  return {
    duration: 7,
    poster: 1.6,
    sequences: [
      P.bg(C.ink),
      ...P.tag('08', 'MOTION', 'easing curves, a rewound clock, a seeded shake', { at: 0.7 }),
      stage,
      status('st-ease', 'EASING', 0.8, T.freeze, C.bone),
      status('st-freeze', 'FREEZE', T.freeze, T.rewind, C.cyan),
      status('st-rewind', 'REWIND', T.rewind, T.slow, C.cyan),
      status('st-slow', 'SLOW-MO + SHAKE', T.slow, T.end, C.red),
      { type: 'audio', sfx: 'swoosh', at: T.play - 0.1, volume: 0.6 },
      { type: 'audio', sfx: 'click', at: T.freeze, volume: 0.6 },
      { type: 'audio', sfx: { preset: 'swoosh', pitch: -7 }, at: T.rewind - 0.1, volume: 0.6 },
      { type: 'audio', sfx: 'pop', at: T.slow, volume: 0.6 },
    ],
  };
}
