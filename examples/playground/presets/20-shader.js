// examples/playground/presets/20-shader.js
export default `// SHADER AND WARP: a shader layer is a Shadertoy mainImage (GLSL ES 3.00) drawn by a formula: iTime is its own clock, the uniforms are declared
// for you and keyframes move them ('uniforms.speed'). The title sits on top and is bent like water by the warp filter. A shader cannot read
// what is behind it (it is a layer, not a filter), and its loops need constant bounds.

const W = 1280, H = 720, FPS = 30, DURATION = 6;
const BACKGROUND = '#05060f';

const field = \`
  void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 uv = fragCoord / iResolution.xy;
    float v = sin(uv.x * 9.0 + iTime * speed) + sin(uv.y * 7.0 - iTime * speed * 1.3) + sin((uv.x + uv.y) * 5.0 + iTime);
    vec3 deep = vec3(0.02, 0.05, 0.16);
    fragColor = vec4(mix(deep, tint, 0.5 + 0.25 * v), 1.0);
  }\`;

const sequences = [
  { type: 'shader', name: 'field', fragment: field, uniforms: { tint: '#2fb5c9', speed: 0.5 },
    keyframes: [{ at: 0, to: { 'uniforms.speed': 1.8, 'uniforms.tint.0': 0.9 }, duration: DURATION, ease: 'sine.inOut' }] },
  { type: 'text', text: 'UNDER WATER', name: 'title', style: { fontSize: 130, fill: '#eaffff', fontWeight: 'bold', letterSpacing: 8 },
    initial: { x: 'GW/2', y: 'GH/2', anchorX: 0.5, anchorY: 0.5 },
    filters: [{ type: 'warp', name: 'ripple', kind: 'wave', strength: 4, scale: 70, speed: 0.8, angle: 90 }],
    keyframes: [{ at: 0, to: { 'filters.ripple.strength': 14 }, duration: DURATION, ease: 'sine.inOut' }] },
];

const POSTER = 3.4;
`;
