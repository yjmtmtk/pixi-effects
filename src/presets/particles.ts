import type { SequenceSpec, Keyframe } from '../types';
import { warnUnknownOptions, suggestName } from '../core/options';
import { random, noise } from '../expr/random';

const KEYS = ['count', 'at', 'emit', 'life', 'area', 'angle', 'speed', 'gravity', 'wind', 'drag', 'sway', 'size', 'scale', 'fade', 'colors', 'shape', 'spin', 'seed', 'name', 'blendMode', 'template', 'sampleRate'] as const;
const SHAPES = ['circle', 'rect', 'star'] as const;
const MAX_KEYFRAMES = 30000;

type Range = number | [number, number];

export interface ParticlesOptions {
  /** How many particles. Required. */
  count: number;
  /** When the first one can be born, in composition seconds. Default 0. */
  at?: number;
  /** Births are spread over this many seconds (0, the default, is a burst: all at once). */
  emit?: number;
  /** How long each lives, in seconds: a number or `[min, max]`. Required. */
  life: Range;
  /** Where they start: the centre `x`, `y`, and optionally a `width` / `height` to spread over (snow: `{ x: 640, y: -20, width: 1280 }`). Required. */
  area: { x: number; y: number; width?: number; height?: number };
  /** Direction of the launch, degrees: 0 is right, 90 down, −90 up. A number or `[min, max]`. Default `[0, 360]`. */
  angle?: Range;
  /** Launch speed in px per second. Default `[100, 300]`. */
  speed?: Range;
  /** Acceleration down, px/s² (negative floats up). Default 0. */
  gravity?: number;
  /** Acceleration sideways, px/s². Default 0. */
  wind?: number;
  /** Air drag per second: they slow toward a terminal speed. Default 0. */
  drag?: number;
  /** A smooth side-to-side wobble: up to about ±`amp` px, `freq` wobbles per second (default 1). Snow, leaves, embers. */
  sway?: { amp: number; freq?: number };
  /** Radius in px (a square's half-side): a number or `[min, max]`. Default `[3, 6]`. */
  size?: Range;
  /** Scale over the life, `[start, end]` (`[1, 0]` shrinks away). Default none. */
  scale?: [number, number];
  /** Alpha ramps in seconds: `in` from transparent at birth, `out` back to transparent at the end of the life. */
  fade?: { in?: number; out?: number };
  /** Fill colours, picked at random for each particle. Default white. */
  colors?: string[];
  /** `'circle'` (default), `'rect'` (a square) or `'star'`. */
  shape?: 'circle' | 'rect' | 'star';
  /** Turning speed in degrees per second (a number or `[min, max]`; they also start at a random angle). Default none. */
  spin?: Range;
  /** Another seed is another burst. Default 0. */
  seed?: number;
  /** Layers are named `<name>-0`, `<name>-1`, … (default `'particle'`). */
  name?: string;
  /** `'add'` makes overlapping particles glow. */
  blendMode?: string;
  /** Use this layer (any type: an image, a text) for every particle instead of a shape; its keyframes are kept. */
  template?: SequenceSpec;
  /** Samples per second of a curved path (gravity, wind, drag, sway): straight steps between them. Default 20. */
  sampleRate?: number;
}

/**
 * Particles as plain layers: a burst, a fountain, snow, confetti, sparks. Each one is a layer with its own seeded start,
 * velocity, size, colour and life, and a path baked into keyframes (so playback, seeking and export agree), living only
 * while it is alive. Spread the result into `sequences`.
 *
 * ```js
 * ...particles({ count: 80, at: 2, life: [0.8, 1.6], area: { x: 640, y: 400 }, speed: [150, 450], gravity: 500,
 *                size: [3, 7], colors: ['#ffd166', '#ff6b9d', '#4cc9f0'], fade: { out: 0.4 }, blendMode: 'add' })
 * ```
 *
 * A particle with no gravity, wind, drag or sway is one straight tween; a curved path is sampled `sampleRate` times a second.
 */
export function particles(opts: ParticlesOptions): SequenceSpec[] {
  warnUnknownOptions('particles()', opts, KEYS);
  const { count, at = 0, emit = 0, gravity = 0, wind = 0, drag = 0, sway, fade, colors = ['#ffffff'], shape = 'circle', seed = 0, name = 'particle', template, sampleRate = 20 } = opts;
  if (!(Number.isInteger(count) && count > 0)) throw new Error(`particles(): count must be a whole number of particles (at least 1), got ${count}`);
  const life = range('life', opts.life, 1e-6);
  if (!opts.area || !Number.isFinite(opts.area.x) || !Number.isFinite(opts.area.y)) throw new Error('particles(): area is required: { x, y } (the centre) and optionally width / height to spread over');
  if (!(Number.isFinite(emit) && emit >= 0)) throw new Error(`particles(): emit must be a number of seconds >= 0, got ${emit}`);
  if (!(Number.isFinite(sampleRate) && sampleRate > 0)) throw new Error(`particles(): sampleRate must be a positive number (samples per second), got ${sampleRate}`);
  if (!(SHAPES as readonly string[]).includes(shape)) {
    const g = suggestName(String(shape), SHAPES);
    throw new Error(`particles(): shape "${shape}" is not one of ${SHAPES.map(s => `"${s}"`).join(', ')}${g ? `; did you mean "${g}"?` : ''}`);
  }
  const angle = range('angle', opts.angle ?? [0, 360], -Infinity);
  const speed = range('speed', opts.speed ?? [100, 300], 0);
  const size = range('size', opts.size ?? [3, 6], 0);
  const spin = opts.spin === undefined ? null : range('spin', opts.spin, -Infinity);
  const curved = gravity !== 0 || wind !== 0 || drag !== 0 || !!sway;
  const worst = curved ? Math.max(1, Math.ceil(life[1] * sampleRate)) : 1;
  if (count * worst > MAX_KEYFRAMES) {
    throw new Error(`particles(): too many keyframes (${count} particles × up to ${worst} samples each): lower count or life, or lower sampleRate (now ${sampleRate})`);
  }

  const round = (v: number) => Math.round(v * 1e6) / 1e6;
  const out: SequenceSpec[] = [];
  for (let i = 0; i < count; i++) {
    const r = random(seed * 1000003 + i * 7919 + 17);
    const pick = ([a, b]: [number, number]) => a + r() * (b - a);
    const born = at + r() * emit;
    const lifetime = pick(life);
    const ax = (r() - 0.5) * (opts.area.width ?? 0), ay = (r() - 0.5) * (opts.area.height ?? 0);
    const x0 = opts.area.x + ax, y0 = opts.area.y + ay;
    const a = pick(angle) * Math.PI / 180, v = pick(speed);
    const vx = v * Math.cos(a), vy = v * Math.sin(a);
    const s = pick(size);
    const color = colors[Math.min(colors.length - 1, Math.floor(r() * colors.length))]!;
    const turn = spin ? pick(spin) : 0;
    const startAngle = spin ? r() * 360 : 0;
    const swayAmp = sway?.amp ?? 0, swayFreq = sway?.freq ?? 1;
    const n0 = sway ? noise(0, seed * 1000003 + i) : 0;

    const at_ = (t: number) => {                                   // position t seconds after birth
      const axis = (p0: number, v0: number, acc: number) => {
        if (drag > 0) { const vInf = acc / drag; return p0 + vInf * t + (v0 - vInf) * (1 - Math.exp(-drag * t)) / drag; }
        return p0 + v0 * t + 0.5 * acc * t * t;
      };
      const sw = sway ? swayAmp * (noise(t * swayFreq, seed * 1000003 + i) - n0) : 0;
      return { x: axis(x0, vx, wind) + sw, y: axis(y0, vy, gravity) };
    };

    const kfs: Keyframe[] = [];
    const steps = curved ? Math.max(1, Math.ceil(lifetime * sampleRate)) : 1;
    const step = lifetime / steps;
    for (let k = 1; k <= steps; k++) {
      const p = at_(k * step);
      kfs.push({ at: round((k - 1) * step), to: { x: round(p.x), y: round(p.y) }, duration: round(step), ease: 'none' });
    }
    if (opts.scale) kfs.push({ at: 0, to: { scale: opts.scale[1] }, duration: round(lifetime), ease: 'none' });
    if (turn !== 0) kfs.push({ at: 0, to: { rotation: round(startAngle + turn * lifetime) }, duration: round(lifetime), ease: 'none' });
    if (fade?.in) kfs.push({ at: 0, to: { alpha: 1 }, duration: fade.in, ease: 'none' });
    if (fade?.out) kfs.push({ at: -fade.out, from: { alpha: 1 }, to: { alpha: 0 }, duration: fade.out, ease: 'none' });

    const initial: Record<string, number | string> = { x: round(x0), y: round(y0) };
    if (opts.scale) initial.scale = opts.scale[0];
    if (fade?.in) initial.alpha = 0;
    if (spin) initial.rotation = round(startAngle);

    const common = { name: `${name}-${i}`, at: round(born), duration: round(lifetime), ...(opts.blendMode ? { blendMode: opts.blendMode } : {}) };
    if (template) {
      const t = template as unknown as Record<string, unknown> & { initial?: Record<string, unknown>; keyframes?: Keyframe[] };
      out.push({ ...t, ...common, initial: { ...t.initial, ...initial }, keyframes: [...(t.keyframes ?? []), ...kfs] } as unknown as SequenceSpec);
      continue;
    }
    const style = { ...initial, fillColor: color };
    if (shape === 'circle') out.push({ type: 'shape', shape: 'circle', radius: round(s), ...common, initial: style, keyframes: kfs } as SequenceSpec);
    else if (shape === 'rect') out.push({ type: 'shape', shape: 'rect', width: round(s * 2), height: round(s * 2), ...common, initial: style, keyframes: kfs } as SequenceSpec);
    else {
      const points: Array<[number, number]> = [];
      for (let p = 0; p < 10; p++) {
        const rad = (p % 2 === 0 ? s : s * 0.45), ang = -Math.PI / 2 + (p * Math.PI) / 5;
        points.push([round(rad * Math.cos(ang)), round(rad * Math.sin(ang))]);
      }
      out.push({ type: 'shape', shape: 'polygon', points, ...common, initial: style, keyframes: kfs } as SequenceSpec);
    }
  }
  return out;
}

function range(name: string, v: Range, min: number): [number, number] {
  const [a, b] = typeof v === 'number' ? [v, v] : v;
  if (!(Number.isFinite(a) && Number.isFinite(b)) || a > b || a < min || (min > 0 && a <= 0)) {
    throw new Error(`particles(): ${name} must be a number or [min, max] with min <= max${min > -Infinity ? ` and min >= ${min}` : ''}, got ${JSON.stringify(v)}`);
  }
  return [a, b];
}
