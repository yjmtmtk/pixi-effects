export default function chapter(P) {
  const { C, F } = P;
  // One word, three compositing tools in one gesture:
  //   1. a hard band (ONE named matte, not drawn itself) sweeps across and cuts three layers at once: a panel, a hatch and the vermilion word;
  //   2. right behind it, a wide gradient used as a LUMA matte fills the word in for good with a soft edge;
  //   3. a light leak (color-dodge) and a streak (screen) burn over the finished word; a multiply vignette frames it.
  const CX = 960, CY = 500;                                      // the word's centre
  const BAND_W = 380, BAND_TOP = 190, BAND_H = 620;              // the band: a window as tall as the word and its label
  const word = { fontSize: 400, fontFamily: F.display, fontWeight: '900' };
  const wordAt = { x: CX, y: CY, anchorX: 0.5, anchorY: 0.5 };

  // a hatch of 45-degree lines across the band's height: ONE path of many sub-paths
  let hatch = '';
  for (let x = -BAND_H; x <= 1920; x += 34) hatch += `M ${x} ${BAND_TOP} L ${x + BAND_H} ${BAND_TOP + BAND_H} `;

  // a code label under the word that names what is on screen in each beat
  const LABEL_Y = 860;
  const label = (name, text, at, until) => ({
    type: 'text', name, text, at, ...(until ? { duration: until - at } : {}),
    style: { fontSize: 44, fill: C.gold, fontFamily: F.mono },
    initial: { x: CX, y: LABEL_Y, anchorX: 0.5, anchorY: 0.5 },
    keyframes: [
      { at: 0, from: { alpha: 0, y: LABEL_Y + 16 }, to: { alpha: 1, y: LABEL_Y }, duration: 0.4, ease: 'power3.out' },
      ...(until ? [{ at: -0.3, to: { alpha: 0 }, duration: 0.3, ease: 'power2.in' }] : []),
    ],
  });

  return {
    duration: 7,
    poster: 5.6,
    sequences: [
      P.bg(C.ink),

      // the word as a ghost outline: what is there before any matte lets the filled word through
      { type: 'text', name: 'ghost', text: 'MATTE', style: { ...word, fill: C.ink, stroke: { color: C.bone, width: 4, join: 'round' } },
        initial: { ...wordAt, alpha: 0.45 },
        keyframes: [{ at: 3.0, to: { alpha: 0 }, duration: 0.6, ease: 'power2.inOut' }] },  // gone once the word is filled: no rim around it

      // (1) THE MATTE: a null carries the band and its two visible edge lines together; the band itself is never drawn
      { type: 'null', name: 'rig', initial: { x: 330, y: 0 },
        keyframes: [{ at: 0.7, to: { x: 2250 }, duration: 2.1, ease: 'power2.inOut' }] },
      { type: 'shape', shape: 'rect', name: 'band', parent: 'rig', width: BAND_W, height: BAND_H, anchorX: 0.5, anchorY: 0,
        initial: { x: 0, y: BAND_TOP, fillColor: '#ffffff' } },
      // three layers cut by that one band
      { type: 'shape', shape: 'rect', name: 'panel', mask: 'band', width: 1920, height: 1080, anchorX: 0, anchorY: 0,
        initial: { x: 0, y: 0, fillColor: C.ink2 } },
      { type: 'shape', shape: 'path', name: 'hatch', mask: 'band', d: hatch, strokeCap: 'butt',
        initial: { strokeColor: C.bone, strokeWidth: 3, strokeAlpha: 0.16 } },
      { type: 'text', name: 'word-band', mask: 'band', text: 'MATTE', style: { ...word, fill: C.red }, initial: wordAt },
      // the window's edges, drawn by two thin lines that ride the same null (so the eye sees where the matte is)
      ...[-BAND_W / 2, BAND_W / 2].map((dx, i) => ({
        type: 'shape', shape: 'rect', name: 'edge-' + i, parent: 'rig', width: 4, height: BAND_H, anchorX: 0.5, anchorY: 0,
        initial: { x: dx, y: BAND_TOP, fillColor: C.bone, alpha: 0.9 },
      })),

      // (2) A LUMA MATTE: a wide gradient, white behind and black ahead, slides in right after the band: the word fills in for good, softly
      { type: 'shape', shape: 'rect', name: 'fade', width: 3800, height: 700, anchorX: 1, anchorY: 0.5,
        fillGradient: { angle: 0, stops: [[0, '#ffffff'], [0.8, '#ffffff'], [1, '#000000']] },
        initial: { x: 300, y: CY },
        keyframes: [{ at: 1.4, to: { x: 2500 }, duration: 1.8, ease: 'power1.inOut' }] },
      { type: 'text', name: 'word-luma', mask: { layer: 'fade', channel: 'luma' }, text: 'MATTE', style: { ...word, fill: C.red }, initial: wordAt },

      // (3) BLEND MODES over the finished word: a warm haze (screen) lifts the dark room, a light leak burns the letters out (color-dodge,
      //     cut to the letters by a second matte: over near-black a dodge only makes a muddy red disc), a streak of light (screen)
      { type: 'shape', shape: 'circle', name: 'haze', radius: 760, blendMode: 'screen',
        fillGradient: { type: 'radial', stops: [[0, 'rgba(255,150,70,0.30)'], [1, 'rgba(255,120,40,0)']] },
        initial: { x: 1900, y: 60, alpha: 0 },
        keyframes: [
          { at: 3.4, to: { alpha: 1 }, duration: 0.6, ease: 'power2.out' },
          { at: 3.4, to: { x: 1180, y: 380 }, duration: 2.4, ease: 'power2.inOut' },
        ] },
      { type: 'text', name: 'letters', text: 'MATTE', style: { ...word, fill: '#ffffff' }, initial: wordAt },
      { type: 'shape', shape: 'circle', name: 'leak', radius: 720, blendMode: 'color-dodge', mask: 'letters',
        fillGradient: { type: 'radial', stops: [[0, 'rgba(255,170,70,0.92)'], [0.45, 'rgba(255,120,40,0.55)'], [1, 'rgba(255,90,30,0)']] },
        initial: { x: 1900, y: 60, alpha: 0 },
        keyframes: [
          { at: 3.4, to: { alpha: 1 }, duration: 0.6, ease: 'power2.out' },
          { at: 3.4, to: { x: 1180, y: 380 }, duration: 2.4, ease: 'power2.inOut' },
        ] },
      { type: 'shape', shape: 'rect', name: 'streak', width: 4600, height: 300, blendMode: 'screen',
        fillGradient: { angle: 90, stops: [[0, 'rgba(255,209,102,0)'], [0.5, 'rgba(255,209,102,0.38)'], [1, 'rgba(255,209,102,0)']] },
        initial: { x: 1500, y: -40, rotation: -24, alpha: 0 },
        keyframes: [
          { at: 3.6, to: { alpha: 1 }, duration: 0.5, ease: 'power2.out' },
          { at: 3.6, to: { x: 980, y: 240 }, duration: 2.2, ease: 'power2.inOut' },
        ] },
      // a vignette: clear in the middle, darker at the corners
      { type: 'shape', shape: 'rect', name: 'vignette', width: 1920, height: 1080, anchorX: 0, anchorY: 0, blendMode: 'multiply',
        fillGradient: { type: 'radial', radius: 0.75, stops: [[0.45, '#ffffff'], [1, '#4a4f60']] },
        initial: { x: 0, y: 0 } },

      // what each beat is, as the data that makes it
      label('code-band', "mask: 'band'", 0.9, 2.2),
      label('code-luma', "mask: { layer: 'fade', channel: 'luma' }", 2.2, 3.6),
      label('code-blend', "blendMode: 'color-dodge'", 3.6),

      { type: 'audio', name: 'sfx-band', sfx: 'swoosh', at: 0.75, volume: 0.55 },
      { type: 'audio', name: 'sfx-leak', sfx: { preset: 'chime', pitch: -5, brightness: -0.2 }, at: 3.45, volume: 0.5 },

      ...P.tag('05', 'BLEND AND MATTE', 'one matte cuts three layers, light blends in'),
    ],
  };
}
