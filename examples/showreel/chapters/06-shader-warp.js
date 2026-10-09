export default function chapter(P) {
  const { C, F } = P;
  // The disc that holds formula A, and the iris that opens formula B out of it (canvas px).
  const CX = 1400, CY = 540, R = 330, R_FULL = 1560;      // R_FULL: the disc covers the frame (corner distance from CX, CY + a margin)
  const SIDE = 720;                                       // formula A is drawn into a 720 x 720 layer around the disc only

  // Formula A: a polar checkerboard (rings x rays) whose rays wind into a spiral as `twist` grows. Integer ray count: no seam at atan's cut.
  const SPIRAL = `
    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      vec2 p = (fragCoord - iResolution.xy * 0.5) / (iResolution.y * 0.46);
      float r = length(p);
      float a = atan(p.y, p.x);
      float rings = sin(r * 18.0 - iTime * pace);
      float rays = sin(a * 12.0 + r * twist - iTime * 0.5);
      float v = rings * rays;
      float w = fwidth(v) * 1.2 + 0.001;
      float tone = smoothstep(-w, w, v);
      vec3 ink = vec3(0.043, 0.051, 0.071);
      vec3 lite = mix(signal, bone, smoothstep(0.30, 0.42, r));
      vec3 col = mix(ink, lite, tone);
      col *= 0.55 + 0.45 * smoothstep(1.05, 0.55, r);
      fragColor = vec4(col, 1.0);
    }`;

  // Formula B: a liquid field, the plane folded by a sum of sines (7 constant steps), then banded into veins.
  const LIQUID = `
    void mainImage(out vec4 fragColor, in vec2 fragCoord) {
      vec2 q = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
      vec2 uv = q * 1.3;
      float t = iTime * speed;
      for (int i = 1; i < 8; i++) {
        float fi = float(i);
        uv.x += 0.55 / fi * sin(fi * 1.6 * uv.y + t + 0.4 * fi);
        uv.y += 0.55 / fi * cos(fi * 1.4 * uv.x - t * 0.8 + 0.7 * fi);
      }
      float v = 0.5 + 0.5 * sin(uv.x + uv.y);
      vec3 deep = vec3(0.020, 0.035, 0.075);
      vec3 sea = vec3(0.030, 0.230, 0.330);
      vec3 col = mix(deep, sea, smoothstep(0.15, 0.95, v));
      float bands = abs(fract(v * 6.0) - 0.5);
      float aa = fwidth(v * 6.0) * 1.5 + 0.01;
      float vein = smoothstep(0.43 - aa, 0.43 + aa, bands);
      col = mix(col, signal, vein * 0.9);
      col += vec3(0.95, 0.92, 0.86) * pow(v, 14.0) * 0.35;
      float band = smoothstep(0.85, 0.05, abs(q.y + 0.08));
      col *= 1.0 - calm * 0.8 * band;
      col *= 1.0 - calm * 0.55 * smoothstep(0.66, 0.92, abs(q.y));
      col *= 1.0 - 0.35 * dot(q * 0.5, q * 0.5);
      fragColor = vec4(col, 1.0);
    }`;

  const enter = (at, x) => ({ at, from: { alpha: 0, x: x - 36 }, to: { alpha: 1, x }, duration: 0.6, ease: 'power3.out' });

  return {
    duration: 7,
    poster: 5.0,
    sequences: [
      P.bg(C.ink),

      // ── beat 1 (0 – 3.0): formula A in a disc; the spiral winds up ──
      { type: 'shader', name: 'spiral', fragment: SPIRAL, width: SIDE, height: SIDE, duration: 3.8,
        uniforms: { twist: 1.5, pace: 0.8, signal: C.red, bone: C.bone },
        initial: { x: CX - SIDE / 2, y: CY - SIDE / 2 },
        mask: { type: 'shape', shape: 'circle', radius: R, initial: { x: CX, y: CY, fillColor: '#ffffff' } },
        keyframes: [
          { at: 0.9, to: { 'uniforms.twist': 22, 'uniforms.pace': 3.2 }, duration: 1.6, ease: 'power2.inOut' },
        ] },

      { type: 'text', name: 'drawn', text: 'DRAWN', duration: 2.95,
        style: { fontSize: 200, fill: C.bone, fontFamily: F.display, letterSpacing: 2 },
        initial: { x: 96, y: 470, anchorX: 0, anchorY: 0.5 },
        keyframes: [enter(0.7, 96), { at: 2.5, to: { alpha: 0, x: 66 }, duration: 0.4, ease: 'power2.in' }] },
      { type: 'text', name: 'formula-a', text: 'sin(18r) · sin(12θ + twist·r)', duration: 2.95,
        style: { fontSize: 44, fill: C.red, fontFamily: F.mono },
        initial: { x: 100, y: 640, anchorX: 0, anchorY: 0.5 },
        keyframes: [enter(1.0, 100), { at: 2.5, to: { alpha: 0, x: 70 }, duration: 0.4, ease: 'power2.in' }] },

      // ── beat 2 (2.6 – 3.8): formula B opens inside the disc, then floods the frame ──
      { type: 'shader', name: 'liquid', fragment: LIQUID, at: 2.6, duration: 4.4, resolution: 0.5,
        uniforms: { speed: 0.9, calm: 0, signal: C.red },
        mask: { type: 'shape', shape: 'circle', radius: 1, initial: { x: CX, y: CY, fillColor: '#ffffff' },
          keyframes: [
            { at: 0, to: { radius: R }, duration: 0.45, ease: 'power3.out' },
            { at: 0.55, to: { radius: R_FULL }, duration: 0.7, ease: 'power2.inOut' },
          ] },
        keyframes: [
          { at: 0.9, to: { 'uniforms.calm': 1 }, duration: 0.8, ease: 'power2.out' },
          { at: 2.6, to: { 'uniforms.speed': 0.35 }, duration: 1.4, ease: 'power2.out' },
        ] },
      { type: 'shape', shape: 'circle', name: 'rim', radius: R + 6, duration: 3.9,
        initial: { x: CX, y: CY, fillAlpha: 0, strokeColor: C.bone, strokeWidth: 3, strokeAlpha: 0.9 },
        keyframes: [{ at: 3.15, to: { radius: R_FULL }, duration: 0.7, ease: 'power2.inOut' }] },

      // ── beat 3 (3.6 – 7.0): the title bent like water, settling for the end ──
      { type: 'text', name: 'bent', text: 'BENT', at: 3.6, duration: 3.4,
        style: { fontSize: 380, fill: C.bone, fontFamily: F.display, letterSpacing: 6 },
        initial: { x: 960, y: 470, anchorX: 0.5, anchorY: 0.5 },
        filters: [
          { type: 'warp', name: 'water', kind: 'wave', strength: 34, scale: 150, speed: 1.1, angle: 90 },
          { type: 'warp', name: 'heat', kind: 'haze', strength: 4, scale: 40, speed: 0.6, seed: 6 },
        ],
        keyframes: [
          { at: 0, from: { alpha: 0, scale: 0.94 }, to: { alpha: 1, scale: 1 }, duration: 0.6, ease: 'power3.out' },
          { at: 0.9, to: { 'filters.water.strength': 4, 'filters.heat.strength': 1.5 }, duration: 1.9, ease: 'power2.inOut' },
        ] },
      { type: 'shape', shape: 'rect', name: 'warp-chip', at: 4.0, duration: 3.0, width: 1200, height: 84, cornerRadius: 10,
        initial: { x: 960, y: 760, fillColor: C.ink, fillAlpha: 0.88 },
        keyframes: [{ at: 0, from: { alpha: 0, y: 784 }, to: { alpha: 1, y: 760 }, duration: 0.6, ease: 'power3.out' }] },
      { type: 'text', name: 'warp-line', text: "filters: [{ type: 'warp', kind: 'wave' }]", at: 4.0, duration: 3.0,
        style: { fontSize: 44, fill: C.red, fontFamily: F.mono },
        initial: { x: 960, y: 760, anchorX: 0.5, anchorY: 0.5 },
        keyframes: [{ at: 0, from: { alpha: 0, y: 784 }, to: { alpha: 1, y: 760 }, duration: 0.6, ease: 'power3.out' }] },

      { type: 'audio', name: 'sfx-open', sfx: 'pop', at: 2.6, volume: 0.35 },
      { type: 'audio', name: 'sfx-flood', sfx: 'swoosh', at: 3.0, volume: 0.45 },

      ...P.tag('06', 'SHADER AND WARP', 'two formulas draw the picture; a warp bends the type', { at: 0.6 }),
    ],
  };
}
