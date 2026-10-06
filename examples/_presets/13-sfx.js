// examples/_presets/13-sfx.js
export default `// Injected: movie (Movie instance), Controller (class), canvas (HTMLCanvasElement).
// Sound effects with no audio files: an audio layer with sfx plays a synthesised preset at its at.
new Controller(movie, { canvas });

const PRESETS = ['click', 'pop', 'swoosh', 'swipe', 'hit', 'riser', 'chime', 'beep', 'coin', 'glitch', 'typewriter'];
const sequences = [];
PRESETS.forEach((preset, i) => {
  const at = 0.5 + i;
  sequences.push(
    { type: 'text', text: preset, at, duration: 0.9,
      style: { fontSize: 72, fontWeight: 'bold', fill: '#ffd166' },
      initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 } },
    { type: 'audio', sfx: preset, at },
  );
});
// a riser into a hit: a riser is loudest at its END, so at = hit - duration
sequences.push(
  { type: 'audio', sfx: 'riser', at: 11.5, duration: 1, volume: 0.7 },
  { type: 'audio', sfx: 'hit', at: 12.5 },
  { type: 'audio', sfx: { preset: 'pop', pitch: 5 }, at: 13.1 },
);

await movie.init({
  canvas,
  width: 1280, height: 720, duration: 14, frameRate: 30,
  background: '#0a0e1a',
  composition: { sequences },
});
console.log(movie.inspectAudio().issues);
`;
