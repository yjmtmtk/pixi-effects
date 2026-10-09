export default function chapter(P) {
  const { C, F } = P;
  const FLOOR = 780;             // the floor line (y) where the word stands
  const LAMP = '#ffc98a';        // the one warm guest colour: the lamp
  const HAZE = '#1a1f2c';        // the fog colour, and the horizon of the 2D background behind it
  const style = { fontSize: 330, fontFamily: F.display, fill: C.bone, letterSpacing: 60 };
  const m = P.measureText('LIGHT', style);
  const ON = 0.7, SWEEP = 1.2, SETTLE = 5.5;   // the beats (seconds)
  return {
    duration: 8,
    poster: 7.4,
    sequences: [
      P.bg(C.ink),
      { type: 'shape', shape: 'rect', name: 'sky', width: 1920, height: 1080, anchorX: 0, anchorY: 0,
        fillGradient: { type: 'linear', angle: 90, stops: [[0, C.ink], [0.24, HAZE], [1, HAZE]] }, initial: { x: 0, y: 0 } },
      { type: 'light', name: 'ambient', kind: 'ambient', initial: { intensity: 0.15, color: '#8a9ac0' } },
      { type: 'light', name: 'lamp', kind: 'spot', castsShadows: true,
        initial: { x: 260, y: FLOOR - 400, z: 560, lookAtX: 820, lookAtY: FLOOR, lookAtZ: -700, coneAngle: 60, coneFeather: 0.6, intensity: 0, color: LAMP, shadowDarkness: 0.9, shadowDiffusion: 16 },
        keyframes: [
          // the lamp clicks on (a short stutter), sweeps left to right, then settles over the middle and opens up
          { at: ON, to: { intensity: 1.2 }, duration: 0.05 }, { at: ON + 0.08, to: { intensity: 0.25 }, duration: 0.06 },
          { at: ON + 0.2, to: { intensity: 1.6 }, duration: 0.15, ease: 'power2.out' },
          { at: SWEEP, to: { x: 1660, lookAtX: 1160 }, duration: 4.1, ease: 'sine.inOut' },
          { at: SETTLE, to: { x: 960, lookAtX: 960, y: FLOOR - 470, coneAngle: 80 }, duration: 1.7, ease: 'power2.inOut' },
        ] },
      { type: 'camera', name: 'cam', initial: { y: 270, lookAtY: 610, fogNear: 1500, fogFar: 6500, fogColor: HAZE, fogAmount: 1 },
        keyframes: [{ at: 0, to: { offsetZ: -200 }, duration: 8, ease: 'sine.inOut' }] },
      { type: 'shape', shape: 'rect', name: 'floor', width: 16000, height: 9800, anchorX: 0.5, anchorY: 0, threeD: true,
        initial: { x: 960, y: FLOOR, z: -9000, rotationX: 90, fillColor: '#bdb3a1' } },
      { type: 'text', name: 'word', text: 'LIGHT', style, threeD: true, castsShadows: true,
        initial: { x: 960, y: FLOOR - m.height * 0.86, z: 0, anchorX: 0.5, anchorY: 0 } },
      { type: 'text', name: 'spec', text: "kind: 'spot'  castsShadows: true", style: { fontSize: 34, fontFamily: F.mono, fill: LAMP },
        initial: { x: 1824, y: 84, anchorX: 1, anchorY: 0.5, alpha: 0 },
        keyframes: [{ at: ON + 0.3, to: { alpha: 0.8 }, duration: 0.5, ease: 'power3.out' }] },
      { type: 'audio', name: 'sfx-on', sfx: 'click', at: ON, volume: 0.5 },
      { type: 'audio', name: 'sfx-sweep', sfx: { preset: 'swoosh', brightness: -0.6, pitch: -5 }, at: SWEEP + 0.6, duration: 1.4, volume: 0.55 },
      { type: 'audio', name: 'sfx-settle', sfx: { preset: 'swoosh', brightness: -0.6, pitch: -8, seed: 2 }, at: SETTLE + 0.1, duration: 1.2, volume: 0.45 },
      ...P.tag('04', 'LIGHT', 'one spot light: the word casts soft shadows into fog'),
    ],
  };
}
