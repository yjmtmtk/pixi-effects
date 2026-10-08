import { suggestName } from '../core/options';
import { evaluateExpr } from '../expr/Parser';
import type { Keyframe, SequenceSpec } from '../types';

/** `aperture` when the camera writes `focus` or `aperture` but no value of its own. The lens diameter, in comp pixels. */
export const DEFAULT_APERTURE = 30;
/** Below this blur radius (px) a layer gets no filter at all: a sharp layer costs nothing. */
export const MIN_BLUR = 0.05;
/** The largest blur radius (px). A bigger one would grow every blurred layer's padding and sampling without bound. */
export const MAX_BLUR = 32;
/** More blurred layers than this at once cost a filter pass each (WebGPU more): said once. */
export const MANY_BLURRED = 20;

/**
 * Depth-of-field blur RADIUS in comp pixels for a layer at camera depth `depth` when the focal plane is at `focusDepth`:
 * the circle of confusion of a lens of diameter `aperture` (px) and focal length `focal` (px), halved. 0 on the focal plane,
 * and for anything at or behind the camera (those layers are hidden anyway).
 */
export function blurRadius(aperture: number, focal: number, depth: number, focusDepth: number): number {
  if (!(aperture > 0) || !(focal > 0) || !(depth > 0) || !(focusDepth > 0)) return 0;
  const r = (aperture * focal * Math.abs(1 / depth - 1 / focusDepth)) / 2;
  return Math.min(r, MAX_BLUR);
}

/** The variables an expression may use (`src/expr/Scope.ts`): a bare one of these is a number, not a layer name. */
const SCOPE_NAMES = new Set(['w', 'h', 'W', 'H', 'GW', 'GH', 'contain', 'cover', 't', 'd', 'T']);

/** A `focus` string that is a layer name (`title`, `bg-photo`) rather than an expression (`GW/2`, `-120`, `H`). */
export function looksLikeLayerName(s: string): boolean {
  return /^[A-Za-z_][\w-]*$/.test(s) && !SCOPE_NAMES.has(s);
}

type Bag = Record<string, unknown>;
type Props = { initial?: Bag; keyframes?: Keyframe[] };

/** Every `focus` string in `initial` and in the keyframes' `set` / `to` / `from`. */
function focusNames(props: Props): string[] {
  const out: string[] = [];
  const read = (bag: Bag | undefined) => { const v = bag?.focus; if (typeof v === 'string' && looksLikeLayerName(v)) out.push(v); };
  read(props.initial);
  for (const kf of props.keyframes ?? []) for (const bag of [kf.set, kf.to, kf.from]) read(bag as Bag | undefined);
  return out;
}

/** A copy of `props` with every layer-name `focus` replaced by the z `zOf` gives (0, the z = 0 plane, if it gives none). The input is not changed. */
export function withFocusResolved<T extends Props>(props: T, zOf: (name: string) => number | undefined): T {
  if (focusNames(props).length === 0) return props;
  const fix = (bag: Bag | undefined): Bag | undefined => {
    const v = bag?.focus;
    if (!bag || typeof v !== 'string' || !looksLikeLayerName(v)) return bag;
    return { ...bag, focus: zOf(v) ?? 0 };
  };
  return {
    ...props,
    initial: fix(props.initial),
    keyframes: props.keyframes?.map(kf => ({ ...kf, set: fix(kf.set as Bag | undefined), to: fix(kf.to as Bag | undefined), from: fix(kf.from as Bag | undefined) })),
  } as T;
}

/** A layer's first z: its `initial.z` (a number or an expression), else 0 (what `Layer3D` seeds). */
export function layerInitialZ(spec: { initial?: Bag }, scope: Record<string, number>): number {
  const z = spec.initial?.z;
  if (typeof z === 'number') return z;
  if (typeof z === 'string') return evaluateExpr(z, scope);
  return 0;
}

export type FocusProblem =
  | { kind: 'missing'; name: string; hint: string | null }
  | { kind: 'not-threeD'; name: string }
  | { kind: 'moving'; name: string };

const movesZ = (spec: SequenceSpec): boolean =>
  (spec.keyframes ?? []).some(kf => [kf.set, kf.to, kf.from].some(bag => bag && 'z' in (bag as Bag)));

/** What is wrong with the layer names a camera's `focus` points at, one entry per (name, problem). */
export function focusProblems(camera: Props, siblings: readonly SequenceSpec[]): FocusProblem[] {
  const out: FocusProblem[] = [];
  const said = new Set<string>();
  const threeD = siblings.filter(s => s.threeD && s.name).map(s => s.name!);
  for (const name of focusNames(camera)) {
    if (said.has(name)) continue;
    said.add(name);
    const hit = siblings.find(s => s.name === name);
    if (!hit) out.push({ kind: 'missing', name, hint: suggestName(name, threeD) });
    else if (!hit.threeD) out.push({ kind: 'not-threeD', name });
    else if (movesZ(hit)) out.push({ kind: 'moving', name });
  }
  return out;
}
