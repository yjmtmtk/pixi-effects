import { suggestName } from './options';

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
