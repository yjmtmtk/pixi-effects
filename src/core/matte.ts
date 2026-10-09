import { suggestName } from './options';
import type { SequenceSpec } from '../types';

export const MATTE_CHANNELS = ['alpha', 'luma'] as const;

/** One matte a layer is cut by: another layer of the same composition, read by its alpha or its brightness, optionally inverted (1 − matte). */
export interface MatteRef { layer: string; channel: 'alpha' | 'luma'; invert: boolean }

export type MaskSource =
  | { kind: 'none' }
  | { kind: 'inline'; spec: Record<string, unknown> }
  | { kind: 'refs'; refs: MatteRef[]; problems: string[] };

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** What a layer's `mask` value is: nothing, a layer spec written in place (it has a `type`), or references to other layers by name. */
export function maskSourceOf(mask: unknown): MaskSource {
  if (isObject(mask) && typeof mask.type === 'string') return { kind: 'inline', spec: mask };
  const problems: string[] = [];
  const refs: MatteRef[] = [];
  const one = (r: unknown, inList: boolean): void => {
    if (typeof r === 'string') { refs.push({ layer: r, channel: 'alpha', invert: false }); return; }
    if (isObject(r) && typeof r.type === 'string') {
      if (inList) problems.push('a layer written inside a list of masks is ignored: give that layer a name and write the name');
      return;
    }
    if (isObject(r) && typeof r.layer === 'string') {
      let channel: 'alpha' | 'luma' = 'alpha';
      if (r.channel !== undefined) {
        if (r.channel === 'alpha' || r.channel === 'luma') channel = r.channel;
        else {
          const guess = typeof r.channel === 'string' ? suggestName(r.channel, MATTE_CHANNELS) : null;
          const alias = typeof r.channel === 'string' && ['luminance', 'brightness', 'grayscale', 'greyscale', 'gray', 'grey', 'value'].includes(r.channel.toLowerCase()) ? 'luma' : null;
          const meant = guess ?? alias;
          problems.push(`mask "${r.layer}": channel ${JSON.stringify(r.channel)} is not a matte channel${meant ? `; did you mean "${meant}"?` : ''} (use alpha or luma); alpha is used`);
        }
      }
      let invert = false;
      if (r.invert !== undefined) {
        if (typeof r.invert === 'boolean') invert = r.invert;
        else problems.push(`mask "${r.layer}": invert must be true or false (got ${JSON.stringify(r.invert)}); false is used`);
      }
      refs.push({ layer: r.layer, channel, invert });
    }
  };
  if (Array.isArray(mask)) for (const r of mask) one(r, true);
  else one(mask, false);
  return refs.length || problems.length ? { kind: 'refs', refs, problems } : { kind: 'none' };
}

/** The names of the layers a `mask` value points at, each once, in order. */
export function refNames(mask: unknown): string[] {
  const s = maskSourceOf(mask);
  return s.kind === 'refs' ? [...new Set(s.refs.map(r => r.layer))] : [];
}

/**
 * Does the layer's inline `mask` go through the matte filter? An inverted mask, and a text, image or video mask, are read by their alpha
 * (a stencil would be the bounding box); they used to be Pixi alpha masks, inside which a blend mode applied to nothing. A plain shape mask
 * stays the cheap stencil.
 */
export function usesMatteRoute(spec: { mask?: unknown; maskInverted?: boolean }): boolean {
  const s = maskSourceOf(spec.mask);
  if (s.kind !== 'inline') return false;
  const t = s.spec.type;
  return spec.maskInverted === true || t === 'text' || t === 'image' || t === 'video';
}

/** More mattes than this in one composition warns (each is a full-composition texture). */
export const MANY_MATTES = 8;

type Timed = { at?: number; duration?: number };
const startOf = (s: Timed): number => Math.max(0, s.at ?? 0);
const endOf = (s: Timed, span: number): number => (s.duration === undefined ? span : (s.at ?? 0) + s.duration);
const num = (n: number): string => String(Number(n.toFixed(3)));

/**
 * What is wrong with a layer's `mask` references, as sentences (the caller puts `pixi-effects: layer "x": ` in front). `siblings` are the layers
 * of the same composition (the layer itself among them); `span` is the composition's length in seconds.
 */
export function matteProblems(layer: SequenceSpec, siblings: readonly SequenceSpec[], span: number): string[] {
  const src = maskSourceOf((layer as { mask?: unknown }).mask);
  if (src.kind !== 'refs') return [];
  const out: string[] = [...src.problems];
  const names = siblings.filter(s => s.name && s.type !== 'camera').map(s => s.name!);
  if ((layer as { maskInverted?: boolean }).maskInverted && src.refs.length) {
    out.push('maskInverted is for a mask written in place: with a reference write { layer: "name", invert: true } (and use a list to subtract one matte from another)');
  }
  if (layer.parent && src.refs.length) {
    out.push(`it has a parent, so it is drawn in the null layer's space and the matte is in the composition's: mask the null layer ("${layer.parent}") instead`);
  }
  for (const ref of src.refs) {
    if (ref.layer === layer.name) { out.push(`mask "${ref.layer}": the layer masks itself; use another layer`); continue; }
    const same = siblings.filter(s => s.name === ref.layer && s.type !== 'camera');
    if (same.length === 0) {
      const guess = suggestName(ref.layer, names.filter(n => n !== layer.name));
      out.push(`mask "${ref.layer}": no layer with that name${guess ? `; did you mean "${guess}"?` : ''} (a matte is another layer of the same composition; the layer is drawn without it)`);
      continue;
    }
    if (same.length > 1) out.push(`mask "${ref.layer}": ${same.length} layers are named "${ref.layer}"; the first is used`);
    const matte = same[0]!;
    if (matte.threeD) { out.push(`mask "${ref.layer}": "${ref.layer}" is a threeD layer and cannot be a matte (the layer is drawn without it)`); continue; }
    if (maskSourceOf((matte as { mask?: unknown }).mask).kind !== 'none') out.push(`mask "${ref.layer}": "${ref.layer}" has a mask of its own, which is ignored when it is used as a matte`);
    // the matte is on screen from its own at / duration; where it is not, the layer is cut by nothing and so invisible
    const ms = startOf(matte), me = endOf(matte, span), ls = startOf(layer), le = endOf(layer, span);
    if (ms > ls + 1e-6 || me < le - 1e-6) {
      out.push(`mask "${ref.layer}": "${ref.layer}" is on screen from ${num(ms)}s to ${num(me)}s but the layer from ${num(ls)}s to ${num(le)}s: where the matte is missing the layer is invisible (give the matte the layer's at and duration, or a longer one)`);
    }
  }
  return out;
}
