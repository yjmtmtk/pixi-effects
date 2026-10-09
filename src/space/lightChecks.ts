/**
 * What is wrong with the way a composition writes its lights and fog, as sentences (the caller puts `pixi-effects: <where>: ` in front).
 * Pure: no Pixi. Every sentence says what to write instead; nothing here throws.
 */
import { suggestName } from '../core/options';
import { collectPropKeys } from './specKeys';
import { FALLOFFS, LIGHT_KINDS, LIGHT_PROPS, MAX_CASTERS, MAX_LIGHTS } from './lighting';
import type { SequenceSpec } from '../types';

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
  const lightsCast = lights.some(l => (l as { castsShadows?: boolean }).castsShadows);
  const casters = layers.filter(l => l.type !== 'light' && (l as { castsShadows?: boolean }).castsShadows && (l as { threeD?: boolean }).threeD);
  if (casters.length > 0 && !lightsCast) out.push(`${casters.length} layer${casters.length > 1 ? 's have' : ' has'} castsShadows but no light has castsShadows: add castsShadows: true to the light that should make the shadows`);
  if (lightsCast && casters.length === 0) out.push('a light has castsShadows but no layer has castsShadows: add castsShadows: true to the threeD layers that should cast a shadow');
  if (lightsCast && casters.length > MAX_CASTERS) {
    const dropped = casters.slice(MAX_CASTERS).map(c => nameOf(c, layers.indexOf(c)));
    out.push(`${casters.length} layers cast shadows, but a layer receives shadows from at most ${MAX_CASTERS} (the first ${MAX_CASTERS}, in layer order); ${dropped.join(', ')} and later cast none`);
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
