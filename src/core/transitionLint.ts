import { suggestName } from './options';

/**
 * What is wrong with the transitions of a composition (and of every composition inside it), as sentences. An unknown `kind` used to expand to
 * nothing with no word; a key the kind does not have was ignored. Said once, when the composition is given (not on every rebuild).
 */

type Plain = Record<string, unknown>;
const isPlain = (v: unknown): v is Plain => !!v && typeof v === 'object' && !Array.isArray(v);

const COMMON = ['from', 'to', 'at', 'duration', 'ease', 'kind'];
/** The keys of each kind, besides the common ones (src/types.ts *Transition). */
export const TRANSITION_KEYS: Record<string, readonly string[]> = {
  crossfade: [],
  wipe: ['direction', 'softness'],
  iris: ['mode', 'softness'],
  slide: ['direction'],
  dip: [],
  zoom: ['mode', 'fromScale'],
  dissolve: ['scale', 'seed', 'softness'],
  luma: ['map', 'softness', 'invert'],
};
const KINDS = Object.keys(TRANSITION_KEYS);
/** Names of 0.54 and before. */
const RENAMED: Record<string, string> = { smoothing: 'softness', flip: 'invert' };
/** The names other editors give these transitions. */
const KIND_ALIASES: Record<string, string> = {
  fade: 'crossfade', crossdissolve: 'crossfade', mix: 'crossfade', blend: 'crossfade', dissolveto: 'crossfade',
  push: 'slide', slidein: 'slide', swipe: 'slide', cover: 'slide',
  fadetoblack: 'dip', dipToBlack: 'dip', diptoblack: 'dip', fadethrough: 'dip', dipthrough: 'dip',
  circle: 'iris', irisin: 'iris', irisout: 'iris', reveal: 'wipe', linearwipe: 'wipe', clockwipe: 'wipe',
  scale: 'zoom', zoomin: 'zoom', zoomout: 'zoom', pixelate: 'dissolve', noise: 'dissolve',
  gradientwipe: 'luma', lumawipe: 'luma', lumamatte: 'luma', matte: 'luma',
};

export function lintTransitions(spec: unknown): string[] {
  const out: string[] = [];
  const walk = (comp: Plain, where: string) => {
    const list = comp.transitions;
    if (Array.isArray(list)) {
      for (const t of list) {
        if (!isPlain(t)) continue;
        const who = `${where}transition "${String(t.from)}" → "${String(t.to)}"`;
        const kind = t.kind;
        if (kind === undefined) {
          if (typeof t.type === 'string') out.push(`pixi-effects: ${who}: "type" is not a transition key — did you mean "kind"? (kind: '${t.type}')`);
          else out.push(`pixi-effects: ${who} has no kind: give one of ${KINDS.join(', ')}`);
          continue;
        }
        if (typeof kind !== 'string' || !TRANSITION_KEYS[kind]) {
          const k = String(kind);
          const guess = KIND_ALIASES[k.toLowerCase().replace(/[-_ ]/g, '')] ?? suggestName(k, KINDS);
          out.push(`pixi-effects: ${who}: kind "${k}" is not a transition${guess ? ` — did you mean "${guess}"?` : ''} (kinds: ${KINDS.join(', ')}); it is not drawn`);
          continue;
        }
        const valid = [...COMMON, ...TRANSITION_KEYS[kind]!];
        for (const key of Object.keys(t)) {
          if (valid.includes(key) || t[key] === undefined) continue;
          if (RENAMED[key]) { out.push(`pixi-effects: ${who}: "${key}" is now "${RENAMED[key]}"${key === 'smoothing' ? ' (0..1, the softness of the edge)' : ' (true: the light parts first)'}; it is ignored`); continue; }
          const owners = KINDS.filter(k => TRANSITION_KEYS[k]!.includes(key));
          const guess = owners.length ? null : suggestName(key, valid);
          const hint = guess ? ` — did you mean "${guess}"?` : owners.length ? ` (it belongs to ${owners.join(', ')})` : '';
          out.push(`pixi-effects: ${who}: "${key}" is not a key of a ${kind}${hint}; keys: ${valid.join(', ')}`);
        }
      }
    }
    for (const l of Array.isArray(comp.sequences) ? comp.sequences : []) {
      if (isPlain(l) && Array.isArray(l.sequences)) walk(l, `composition "${String(l.name ?? '?')}": `);
    }
  };
  if (isPlain(spec)) walk(spec, '');
  return out;
}
