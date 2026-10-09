// The reel's music: ONE bed under the whole reel, written as text (the library's `music` layer). 120 BPM, so a bar is 2 s and a beat 0.5 s.
// The bar lines are placed so that each new section begins on a chapter cut (a section starts on the bar nearest the middle of that
// chapter's transition). 40 bars: a pad alone, a soft bass pulse, the kick, an arpeggio, a hook that builds, the peak under the sound
// chapter (09-sound draws bars 29-32 of this very score) and the data chapter, then a held C major 9 that the reel ends on.
export default function music(P, plan) {
  const BPM = 120, BEAT = 60 / BPM, BAR = 4 * BEAT;
  const ch = id => plan.chapters.find(c => c.id === id);
  const AT = ch('01-type').at - 2 * BAR;                                   // 1.4 s: two bars of pad, then the pulse lands on the first cut
  const barOf = id => Math.round((ch(id).at + plan.overlap / 2 - AT) / BAR);
  const BARS = Math.floor((plan.total - AT) / BAR + 1e-6);                 // 40: the last bar ends with the reel
  const S = {                                                              // where each section starts (bar numbers)
    pulse: barOf('01-type'), groove: barOf('02-shapes'), motion: barOf('04-light'), build: barOf('07-filters-particles'),
    peak: barOf('09-sound'), lift: barOf('10-data-talks'), outro: barOf('11-source'), end: BARS - 2,
  };
  const order = ['intro', 'pulse', 'groove', 'motion', 'build', 'peak', 'lift', 'outro', 'end'];
  const startOf = name => (name === 'intro' ? 0 : S[name]);
  const section = b => order.filter(n => startOf(n) <= b).pop();

  // Harmony: a four-bar loop in A minor / C major that restarts with every section; a bar before the peak leans on G, the outro walks home.
  const LOOP = ['Am7', 'Fmaj7', 'Cadd9', 'G6'];
  const chords = b => {                                                    // [[name, beats], ...] for bar b
    if (b >= S.end) return b === S.end ? [['Cmaj9', 8]] : [];              // the held ending (one token over the last two bars)
    if (b === S.end - 1) return [['Gsus4', 2], ['G', 2]];
    if (b === S.end - 2) return [['Fmaj7', 4]];
    if (b === S.peak - 1) return [['G6', 4]];
    return [[LOOP[(b - startOf(section(b))) % 4], 4]];
  };
  const ROOT = { Am7: 'a', Fmaj7: 'f', Cadd9: 'c', G6: 'g', Gsus4: 'g', G: 'g', Cmaj9: 'c' };
  const low = c => ({ a: 'a1', f: 'f1', c: 'c2', g: 'g1' })[ROOT[c]];
  const high = c => ({ a: 'a2', f: 'f2', c: 'c3', g: 'g2' })[ROOT[c]];
  const ARP = { Am7: ['a4', 'c5', 'e5', 'g5'], Fmaj7: ['f4', 'a4', 'c5', 'e5'], Cadd9: ['c5', 'd5', 'e5', 'g5'], G6: ['g4', 'b4', 'd5', 'e5'],
    Gsus4: ['g4', 'c5', 'd5', 'g5'], G: ['g4', 'b4', 'd5', 'g5'], Cmaj9: ['c5', 'e5', 'g5', 'b5'] };
  const ARP_ORDER = [0, 1, 2, 3, 1, 2, 3, 2];

  // The hook: dotted (3 + 3 + 2) like the bass under it. Every note is at least a beat long, so the sound chapter can print each one on its bar.
  const HOOK = {
    build: ['e5:1.5 d5:1.5 c5:1', 'a4:1.5 c5:1.5 e5:1', 'd5:1.5 e5:1.5 g5:1', 'e5:3 d5:1', 'c5:3 a4:1', 'b4:1.5 d5:1.5 e5:1'],
    peak: ['e5:1.5 g5:1.5 e5:1', 'a5:1.5 g5:1.5 e5:1', 'd5:1.5 e5:1.5 g5:1', 'e5:3 d5:1'],
    lift: ['e5:1.5 g5:1.5 e5:1', 'a5:1.5 c6:1.5 a5:1', 'g5:1.5 e5:1.5 d5:1'],
    outro: ['c5:3 a4:1', 'd5:2 b4:2'],
    end: ['c5:8'],
  };
  const up = s => s.replace(/([a-g]#?)(\d)/g, (m, n, o) => n + (Number(o) + 1));   // the same line an octave higher (for the bell)

  // One function per track: the tokens of bar b. Every bar adds up to 4 beats (checked below); the last token spans the last two bars.
  const T = {
    pad: b => chords(b).map(([c, l]) => `${c}:${l}`),
    keys: b => {
      const s = section(b);
      if (['intro', 'pulse'].includes(s)) return ['_:4'];
      if (s === 'end') return b === S.end ? ['Cmaj9@4:4', '_:4'] : [];
      return chords(b).flatMap(([c, l]) => (l === 4 ? [`${c}@4:1.5`, `${c}@4:1`, '_:1.5'] : [`${c}@4:1.5`, '_:0.5']));
    },
    bass: b => {
      const s = section(b);
      if (s === 'intro') return ['_:4'];
      if (s === 'end') return b === S.end ? ['c2:6', '_:2'] : [];
      return chords(b).flatMap(([c, l]) => {
        if (s === 'pulse') return Array(l).fill(`${low(c)}:1`);                              // the soft pulse: quarter notes
        if (s === 'motion' || s === 'build') return Array(l * 2).fill(0).map((_, i) => `${i === 6 ? high(c) : low(c)}:0.5`);
        if (l === 2) return [`${low(c)}:1.5`, `${low(c)}:0.5`];
        return s === 'peak' || s === 'lift' ? [`${low(c)}:1.5`, `${low(c)}:1.5`, `${high(c)}:1`] : [`${low(c)}:1.5`, `${low(c)}:1.5`, `${low(c)}:1`];
      });
    },
    pluck: b => {
      const s = section(b);
      if (['intro', 'pulse', 'groove'].includes(s)) return ['_:4'];
      if (s === 'end') return b === S.end ? ['_:8'] : [];
      return chords(b).flatMap(([c, l]) => Array(l * 2).fill(0).map((_, i) => `${ARP[c][ARP_ORDER[i % 8]]}:0.5`));
    },
    lead: b => {
      const s = section(b);
      if (!HOOK[s]) return ['_:4'];
      if (s === 'end') return b === S.end ? [HOOK.end[0]] : [];
      return (HOOK[s][b - S[s]] ?? '_:4').split(' ');
    },
    bell: b => {
      const s = section(b);
      if (s === 'end') return b === S.end ? ['[g5 c6 e6]:8'] : [];
      if (s !== 'peak' && s !== 'lift') return ['_:4'];
      return up(HOOK[s][b - S[s]] ?? '_:4').split(' ');
    },
  };
  const beatsOf = tokens => tokens.reduce((n, t) => n + Number(t.split(':')[1] ?? 1), 0);
  const line = name => {
    const bars = [];
    for (let b = 0; b < BARS; b++) {
      const tokens = T[name](b);
      const want = b === S.end ? 8 : b > S.end ? 0 : 4;
      if (beatsOf(tokens) !== want) console.warn(`music: track ${name}, bar ${b} has ${beatsOf(tokens)} beats, not ${want}`);
      if (tokens.length) bars.push(tokens.join(' '));
    }
    return bars.join(' | ');
  };

  // Drums: 16 steps a bar. Each section is one entry from its first beat to the next section's.
  const beat = bar => bar * 4;
  const drums = [
    { from: beat(S.groove), to: beat(S.motion), kick: 'o.......o.......', shaker: '..o...o...o...o.' },
    { from: beat(S.motion), to: beat(S.build), kick: 'x.......x.o.....', hat: '..o...o...o...o.', rim: '....o.......o...' },
    { from: beat(S.build), to: beat(S.peak - 1), kick: 'x...x...x...x...', clap: '....o.......o...', hat: '..o...o...o...o.' },
    { from: beat(S.peak - 1), to: beat(S.peak), kick: 'x...x...x...x...', snare: '....o...o.o.xxxx' },               // the fill into the peak
    { from: beat(S.peak), to: beat(S.outro), kick: 'x...x...x...x...', clap: '....x.......x...', hat: 'o.o.o.o.o.o.o.o.', openhat: '..x...x...x...x.' },
    { from: beat(S.peak), to: beat(S.peak) + 1, crash: 'o...' },
    { from: beat(S.lift), to: beat(S.lift) + 1, crash: 'o...' },
    { from: beat(S.outro), to: beat(S.end), kick: 'x.......x.......', hat: '..o...o...o...o.' },
    { from: beat(S.end), to: beat(S.end) + 1, kick: 'x...', crash: 'o...' },
  ];

  const music = {
    bpm: BPM, reverb: 0.3, humanize: 0.006, drumVol: 0.6, seed: 9,
    tracks: [
      { inst: 'pad', vol: [[0, 0.45], [beat(S.groove), 0.36], [beat(S.build), 0.4], [beat(S.peak), 0.46], [beat(S.outro), 0.52]], attack: 0.9, release: 2.2, tone: 0.45, reverb: 0.5, notes: line('pad') },
      { inst: 'keys', vol: [[beat(S.groove), 0.26], [beat(S.build), 0.34], [beat(S.peak), 0.48], [beat(S.outro), 0.4]], pan: -0.2, strum: 0.012, tone: 0.55, reverb: 0.3, notes: line('keys') },
      { inst: 'bass', vol: [[beat(S.pulse), 0.38], [beat(S.groove), 0.6], [beat(S.peak), 0.72], [beat(S.outro), 0.6]], tone: 0.45, reverb: 0.05, notes: line('bass') },
      { inst: 'pluck', vol: [[beat(S.motion), 0], [beat(S.motion) + 8, 0.26], [beat(S.build), 0.32], [beat(S.peak), 0.5], [beat(S.outro), 0.32]], pan: 0.25, tone: 0.6, reverb: 0.4, notes: line('pluck') },
      { inst: 'lead', vol: [[beat(S.build), 0.24], [beat(S.peak) - 4, 0.44], [beat(S.peak), 0.66], [beat(S.outro), 0.5]], tone: 0.5, reverb: 0.35, notes: line('lead') },
      { inst: 'bell', vol: 0.28, pan: 0.2, ring: 0.7, reverb: 0.6, notes: line('bell') },
    ],
    drums,
  };
  return [
    { type: 'audio', name: 'music', at: AT, duration: plan.total - AT, volume: 1.22, music,
      keyframes: [{ at: -1.6, to: { volume: 0 }, duration: 1.6, ease: 'sine.in' }] },        // the held chord fades with the last picture
  ];
}
