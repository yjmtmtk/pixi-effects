import type { Sequence } from '../sequences/Base';
import { fontAvailable } from '../text/fonts';

export interface FontReport {
  /** Text layers none of whose fonts is available here: they are drawn in a fallback. */
  missing: Array<{ layer: string; family: string }>;
  /** Web fonts (`@font-face`) whose file could not be loaded and that a text layer uses. */
  failed: string[];
  /** Web fonts whose file could not be loaded but no text layer uses (an unused face: worth a look, not a fault). */
  failedUnused: string[];
}

/** Walks the layer tree (like `collectVideoSequences`): every text layer's `style.fontFamily`, and the state of the page's web fonts. */
export function inspectFonts(root: Sequence): FontReport {
  const failed = new Set<string>();
  if (typeof document !== 'undefined' && document.fonts) document.fonts.forEach((face) => { if (face.status === 'error') failed.add(face.family.replace(/^["']|["']$/g, '')); });
  const missing: FontReport['missing'] = [];
  const used = new Set<string>();
  const walk = (seq: Sequence, index: number): void => {
    const spec = seq.spec as { type?: string; name?: string; style?: { fontFamily?: unknown } };
    if (spec.type === 'text') {
      const raw = spec.style?.fontFamily;
      const family = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : '';
      const list = family.split(',').map((f) => f.trim()).filter(Boolean);
      for (const f of list) used.add(f.replace(/^["']|["']$/g, '').toLowerCase());
      // a layer whose web font failed to load is already explained by `failed`: not a second finding
      if (list.length && !list.some(fontAvailable) && !list.some((f) => failed.has(f.replace(/^["']|["']$/g, '')))) missing.push({ layer: spec.name ?? `text#${index}`, family });
    }
    if (seq.maskSequence) walk(seq.maskSequence, index);
    ((seq as Sequence & { _children?: Sequence[] })._children ?? []).forEach((child, i) => walk(child, i));
  };
  walk(root, 0);
  const all = [...failed];
  return { missing, failed: all.filter((f) => used.has(f.toLowerCase())), failedUnused: all.filter((f) => !used.has(f.toLowerCase())) };
}
