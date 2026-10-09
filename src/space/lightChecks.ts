/**
 * What is wrong with the way a composition writes its lights and fog, as sentences (the caller puts `pixi-effects: <where>: ` in front).
 * Pure: no Pixi. Every sentence says what to write instead; nothing here throws.
 */
import { suggestName } from '../core/options';
import { collectPropKeys } from './specKeys';
import { FALLOFFS, LIGHT_KINDS, LIGHT_PROPS, MAX_CASTERS, MAX_LIGHTS } from './lighting';
import type { SequenceSpec } from '../types';

/** This many lights with soft shadows warn (measured: 3 soft lights over 20 layers cost about 20 ms a frame at 1080p). */
const SOFT_LIGHTS = 3;

type Bag = Record<string, unknown>;
const bagsOf = (spec: SequenceSpec): Bag[] => {
  const s = spec as unknown as { initial?: Bag; keyframes?: Array<{ set?: Bag; to?: Bag; from?: Bag }> };
  const out: Bag[] = [];
  if (s.initial) out.push(s.initial);
  for (const k of s.keyframes ?? []) for (const b of [k.set, k.to, k.from]) if (b) out.push(b);
  return out;
};
const numbersOf = (spec: SequenceSpec, key: string): number[] => bagsOf(spec).map(b => b[key]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
const nameOf = (s: SequenceSpec, i: number) => ((s as { name?: string }).name ? `"${(s as { name?: string }).name}"` : `#${i + 1}`);

const KIND_ALIASES: Record<string, string> = {
  directional: 'parallel', sun: 'parallel', sunlight: 'parallel', distant: 'parallel',
  omni: 'point', lamp: 'point', bulb: 'point', pointlight: 'point',
  spotlight: 'spot', cone: 'spot',
  ambience: 'ambient', global: 'ambient', fill: 'ambient',
};

/** Why `kind` is not a light kind, with the likely name and the choices; null when it is one (or left out: the default is `point`). */
export function lightKindProblem(kind: unknown): string | null {
  if (kind === undefined || (typeof kind === 'string' && (LIGHT_KINDS as readonly string[]).includes(kind))) return null;
  const guess = typeof kind === 'string' ? (KIND_ALIASES[kind.toLowerCase()] ?? suggestName(kind, LIGHT_KINDS)) : null;
  const shown = typeof kind === 'string' ? `"${kind}"` : String(kind);
  return `kind ${shown} is not a light kind${guess ? `; did you mean "${guess}"?` : ''} (use ${LIGHT_KINDS.join(', ')}); point is used`;
}

const LIGHT_ALIASES: Record<string, string> = {
  pointOfInterest: 'did you mean "lookAtX / lookAtY / lookAtZ"?', target: 'did you mean "lookAtX / lookAtY / lookAtZ"?', lookAt: 'did you mean "lookAtX / lookAtY / lookAtZ"?',
  angle: 'did you mean "coneAngle"?', cone: 'did you mean "coneAngle"?', spread: 'did you mean "coneAngle"?',
  feather: 'did you mean "coneFeather"?', penumbra: 'did you mean "coneFeather" (the cone edge) or "shadowDiffusion" (the shadow edge)?',
  castShadows: 'did you mean "castsShadows"?', castShadow: 'did you mean "castsShadows"?', shadows: 'did you mean "castsShadows"?', shadow: 'did you mean "castsShadows"?',
  brightness: 'did you mean "intensity"?', strength: 'did you mean "intensity"?',
  distance: 'did you mean "radius" (where the falloff starts) or "falloffDistance"?', range: 'did you mean "radius" or "falloffDistance"?',
};

/** What is wrong with one `light` layer written on its own (misplaced keys, aliases, ranges, a threeD light). */
export function lightLayerProblems(spec: SequenceSpec): string[] {
  const out: string[] = [];
  const raw = spec as unknown as Bag;
  const kind = lightKindProblem(raw.kind);
  if (kind) out.push(kind);
  if (raw.falloff !== undefined && !(FALLOFFS as readonly string[]).includes(raw.falloff as string)) {
    const guess = typeof raw.falloff === 'string' ? suggestName(raw.falloff, FALLOFFS) : null;
    out.push(`falloff ${JSON.stringify(raw.falloff)} is not supported${guess ? `; did you mean "${guess}"?` : ''} (use ${FALLOFFS.join(', ')}); none is used`);
  }
  for (const k of Object.keys(raw)) {
    if ((LIGHT_PROPS as readonly string[]).includes(k) || k === 'intensity' || k === 'shadowDarkness' || k === 'shadowDiffusion') {
      out.push(`"${k}" must go inside initial / keyframes, not on the light itself`);
    } else if (LIGHT_ALIASES[k]) out.push(`"${k}" is not a property — ${LIGHT_ALIASES[k]}`);
  }
  const explained = new Set(Object.keys(LIGHT_ALIASES));
  for (const k of collectPropKeys(spec as never)) {
    if (LIGHT_ALIASES[k]) out.push(`"${k}" is not a property — ${LIGHT_ALIASES[k]}`);
    else if (!explained.has(k) && !(LIGHT_PROPS as readonly string[]).includes(k)) out.push(`"${k}" has no effect on a light (use ${LIGHT_PROPS.join(', ')})`);
  }
  if (numbersOf(spec, 'coneFeather').some(v => v > 1 || v < 0)) out.push('coneFeather is 0..1 (the soft part of the cone edge, as a fraction of the half angle); it is clamped');
  const big = numbersOf(spec, 'intensity').find(v => v > 10);
  if (big !== undefined) out.push(`intensity ${big} looks like a percentage: it is a multiplier (1 = full, 0.25 = a quarter); did you mean ${big / 100}?`);
  const kindNow = typeof raw.kind === 'string' && (LIGHT_KINDS as readonly string[]).includes(raw.kind) ? raw.kind : 'point';
  const has = (...keys: string[]) => keys.filter(k => bagsOf(spec).some(b => b[k] !== undefined));
  const falloffOn = raw.falloff === 'smooth' || raw.falloff === 'inverseSquare';
  if (kindNow === 'ambient' && raw.castsShadows) out.push('an ambient light has no direction, so it makes no shadow: castsShadows is ignored (put it on a point, spot or parallel light)');
  const dist = has('radius', 'falloffDistance');
  if (dist.length && !falloffOn && kindNow !== 'ambient' && kindNow !== 'parallel') out.push(`${dist.join(' / ')} only matter with falloff: 'smooth' or 'inverseSquare' (the default 'none' does not fade with distance): write falloff on the layer`);
  const shadowNums = has('shadowDarkness', 'shadowDiffusion');
  if (shadowNums.length && !raw.castsShadows) out.push(`${shadowNums.join(' / ')} only matter with castsShadows: true on the light (and on the layers that cast)`);
  const cone = has('coneAngle', 'coneFeather');
  if (cone.length && kindNow !== 'spot') out.push(`${cone.join(' / ')} only matter for kind: 'spot' (this light is ${kindNow})`);
  if (kindNow === 'parallel' && raw.falloff !== undefined && raw.falloff !== 'none') out.push('a parallel light has no distance, so falloff has no effect on it');
  const init = (spec as { initial?: Bag }).initial ?? {};
  const pos = ['x', 'y', 'z'].map(k => init[k]), look = ['lookAtX', 'lookAtY', 'lookAtZ'].map(k => init[k]);
  if ((kindNow === 'spot' || kindNow === 'parallel') && pos.every(v => typeof v === 'number') && pos.every((v, i) => v === look[i])) {
    out.push('lookAt equals the position, so the light has no direction and lights nothing: move lookAtX / lookAtY / lookAtZ to where it should point');
  }
  if ((spec as { threeD?: boolean }).threeD) out.push('a light has no picture, so threeD has no effect on it (write it without threeD)');
  return out;
}

/** What is wrong with the lights of a composition taken together; empty when there is no light (a composition without light is not touched). */
export function lightSetProblems(layers: readonly SequenceSpec[]): string[] {
  const lights = layers.filter(l => l.type === 'light');
  if (lights.length === 0) return [];
  const out: string[] = [];
  const kindOf = (l: SequenceSpec) => ((l as { kind?: string }).kind ?? 'point');
  if (!lights.some(l => kindOf(l) === 'ambient')) {
    out.push('there is no ambient light, so what no light reaches is black; add { type: \'light\', kind: \'ambient\', initial: { intensity: 0.25 } }');
  }
  const direct = lights.filter(l => kindOf(l) !== 'ambient');
  if (direct.length > MAX_LIGHTS) {
    const dropped = direct.slice(MAX_LIGHTS).map(l => nameOf(l, layers.indexOf(l)));
    out.push(`${direct.length} lights, but at most ${MAX_LIGHTS} are used (the first ${MAX_LIGHTS}, in layer order); ${dropped.join(', ')} and later are dropped. Use fewer lights`);
  }
  const lightsCast = lights.some(l => kindOf(l) !== 'ambient' && (l as { castsShadows?: boolean }).castsShadows);
  const casters = layers.filter(l => l.type !== 'light' && (l as { castsShadows?: boolean }).castsShadows && (l as { threeD?: boolean }).threeD);
  if (casters.length > 0 && !lightsCast) out.push(`${casters.length} layer${casters.length > 1 ? 's have' : ' has'} castsShadows but no light has castsShadows: add castsShadows: true to the light that should make the shadows`);
  if (lightsCast && casters.length === 0) out.push('a light has castsShadows but no layer has castsShadows: add castsShadows: true to the threeD layers that should cast a shadow');
  if (lightsCast && casters.length > MAX_CASTERS) {
    const dropped = casters.slice(MAX_CASTERS).map(c => nameOf(c, layers.indexOf(c)));
    out.push(`${casters.length} layers cast shadows, but a layer receives shadows from at most ${MAX_CASTERS} (the first ${MAX_CASTERS}, in layer order); ${dropped.join(', ')} and later cast none`);
  }
  const softLights = lights.filter(l => (l as { castsShadows?: boolean }).castsShadows && numbersOf(l, 'shadowDiffusion').some(v => v > 0));
  if (softLights.length >= SOFT_LIGHTS) {
    out.push(`${softLights.length} lights make soft shadows (shadowDiffusion above 0): each is a 16-sample search per pixel and per caster, costly (about 20 ms more a frame at 1080p with 20 lit layers in our measurement). Give shadowDiffusion to one or two lights; the others keep hard shadows`);
  }
  layers.forEach((l, i) => {
    if (l.type === 'light' || (l as { threeD?: boolean }).threeD) return;
    const bad = (['castsShadows', 'lit'] as const).filter(k => (l as unknown as Bag)[k] !== undefined);
    if (bad.length) out.push(`layer ${nameOf(l, i)}: ${bad.map(k => `"${k}"`).join(' and ')} only work${bad.length > 1 ? '' : 's'} on threeD layers (add threeD: true; a 2D layer is not lit and casts no shadow)`);
  });
  return out;
}

/** What is wrong with the fog a camera writes (`fogFar` not beyond `fogNear`, an amount outside 0..1). */
export function fogProblems(camera: SequenceSpec): string[] {
  const out: string[] = [];
  const near = numbersOf(camera, 'fogNear')[0], far = numbersOf(camera, 'fogFar')[0];
  if (near !== undefined && far !== undefined && far <= near) out.push(`fogFar (${far}) is not beyond fogNear (${near}): the fog is a hard step at fogNear. Make fogFar larger (the distance where the fog is complete)`);
  if (numbersOf(camera, 'fogAmount').some(v => v < 0 || v > 1)) out.push('fogAmount is 0..1 (how much of the fog colour the farthest things get); it is clamped');
  return out;
}
