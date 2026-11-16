import { describeLayer } from './lint';
import { suggestName } from './options';
import { remapOf, contentLength, clockTable, type TimeRemap } from './remap';

/**
 * Moments by name (After Effects: composition markers, seen from outside the precomp). A layer's `at` may be
 *
 *   'host@in'          marker `in` of the composition named `host` (`markers: { in: 0.6 }` on it, in its own seconds)
 *   'title@end + 0.2'  where the layer `title` ends (any layer has start, mid and end), 0.2 s later
 *   '@drop'            marker `drop` of the composition the layer is in, or of one around it (the root too); '@end' is the end of its own
 *
 * A name is looked for nearest first: beside the layer, then deeper, then around it. The moment is brought onto the clock of the composition
 * the layer is in (through `speed` and `time`). Resolved once, after components and variables, before anything is built: what is built has
 * numbers. The markers of every composition come back on the movie's clock, for `check --at host@in`.
 */

type Plain = Record<string, unknown>;
export interface MarkerTime { /** the composition's name; null for the root */ layer: string | null; name: string; /** seconds on the movie's clock */ time: number }

interface Node {
  spec: Plain;
  parent: Node | null;
  /** the layers inside it, found by name (a mask or a transition is not listed: it is resolved, not named) */
  children: Node[];
  /** what it is, for the messages */
  kind: 'layer' | 'mask' | 'transition' | 'stop';
  /** a stop's place in `stops`, for the messages */
  index?: number;
  /** a mask with no `at` of its own lives with this layer */
  owner?: Node;
  /** its own lifespan (a composition) */
  life: number;
  /** a composition's local seconds: how far its clock can go */
  span: number;
  markers: Map<string, number>;
  clock?: Clock | null;
}
interface Clock { forward(u: number): number; inverse(m: number): number | null }

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i;
const MOMENT = /^\s*([^@]*?)\s*@\s*([A-Za-z_][A-Za-z0-9_]*)\s*((?:[+-]\s*(?:\d+\.?\d*|\.\d+)\s*)*)$/;
const SHIFT = /([+-])\s*(\d+\.?\d*|\.\d+)/g;
const OWN = ['start', 'mid', 'end'];
const isPlain = (v: unknown): v is Plain => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const round = (v: number) => Number(v.toFixed(3));
/** a moment lands on a frame, not a hair beside it (a clock sampled every millisecond, sums of decimals) */
const settle = (v: number) => Math.round(v * 1e6) / 1e6;
const HELP = 'give seconds (2.5) or a moment: "host@in", "title@end + 0.2", "@drop"';

class Unresolved extends Error {}
class Cycle extends Unresolved { constructor(message: string, readonly node: Node) { super(message); } }

export function resolveMoments<T>(spec: T, opts: { duration: number; frameRate: number }): { spec: T; warnings: string[]; markers: MarkerTime[] } {
  if (!isPlain(spec) || !needsWork(spec)) return { spec, warnings: [], markers: [] };
  const said = new Set<string>();
  const say = (m: string) => { said.add(`pixi-effects: ${m}`); };

  // a copy of the layers (the author's object is kept as it was: it is built again on every rebuild)
  const rootSpec: Plain = { ...spec };
  const life = num(rootSpec.duration) ?? opts.duration;
  const all: Node[] = [];
  const root = makeNode(rootSpec, null, life, 'layer', say, all);

  const memo = new Map<Node, number>();
  const visiting: Node[] = [];
  const kfDone = new Set<Node>(), kfDoing = new Set<Node>();

  const who = (n: Node): string => n.kind === 'stop' ? `stops[${n.index}]` : n.kind === 'transition' ? `transition "${String(n.spec.from)}" → "${String(n.spec.to)}"`
    : n.kind === 'mask' ? `the mask of ${describeLayer(n.owner!.spec as never)}` : describeLayer(n.spec as never);
  const tell = (e: Unresolved) => (e.message.startsWith('is ') ? ' ' : ': ') + e.message;

  /** a node's `at`, a number on its parent's clock */
  function atOf(n: Node): number {
    const hit = memo.get(n);
    if (hit !== undefined) return hit;
    const raw = n.spec.at;
    let v: number;
    if ((raw === undefined || raw === null) && n.owner) return atOf(n.owner);       // a mask with no `at` lives with its layer
    if (raw === undefined || raw === null) v = 0;
    else if (typeof raw === 'number') v = raw;
    else if (typeof raw === 'string' && NUMBER.test(raw)) v = Number(raw);
    else if (typeof raw === 'string') {
      if (visiting.includes(n)) {
        const loop = [...visiting.slice(visiting.indexOf(n)), n].map(x => String(x.spec.name ?? '?')).join(' → ');
        throw new Cycle(`the moments name each other (${loop})`, n);
      }
      visiting.push(n);
      try { v = moment(n, raw, `${who(n)}: at: "${raw}"`); }
      catch (e) {
        if (e instanceof Cycle && e.node !== n) throw e;          // said once, by the layer the circle came back to
        if (!(e instanceof Unresolved)) throw e;
        say(`${who(n)}: at: "${raw}"${tell(e)}; at 0 instead`);
        v = 0;
      } finally { visiting.pop(); }
    } else { say(`${who(n)}: at must be a number of seconds or a moment ("host@in"); at 0 instead`); v = 0; }
    memo.set(n, v);
    n.spec.at = v;
    return v;
  }

  /** a string `at` → seconds on the clock of the composition the layer is in; `context` starts a warning said on the way */
  function moment(n: Node, raw: string, context: string): number {
    const m = raw.match(MOMENT);
    if (!m) throw new Unresolved(`is not a time: ${HELP}`);
    const [, name, word, shifts] = m;
    let offset = 0;
    for (const [, sign, amount] of (shifts ?? '').matchAll(SHIFT)) offset += (sign === '-' ? -1 : 1) * Number(amount);
    const here = n.parent!;
    let where: Node, t: number;
    if (!name) {
      if (OWN.includes(word!)) { where = here; t = word === 'start' ? 0 : word === 'mid' ? here.span / 2 : here.span; }
      else {
        let a: Node | null = here;
        while (a && !a.markers.has(word!)) a = a.parent;
        if (!a) throw new Unresolved(`no marker "${word}" on the composition it is in or on one around it (add markers: { ${word}: 2 } to one)`);
        where = a; t = a.markers.get(word!)!;
      }
    } else {
      const target = find(n, name, context);
      where = target.parent!;
      const start = atOf(target);
      if (OWN.includes(word!)) {
        if (word === 'start') t = start;
        else { const end = endOf(target, start); t = word === 'end' ? end : (start + end) / 2; }
      } else {
        if (target.spec.type !== 'composition') throw new Unresolved(`"${name}" is ${describeType(target)}: it has start, mid and end; markers are on a composition (markers: { ${word}: 0.5 })`);
        if (!target.markers.has(word!)) {
          const names = [...target.markers.keys()];
          const guess = suggestName(word!, [...names, ...OWN]);
          throw new Unresolved(`composition "${name}" has no marker "${word}"${guess ? ` — did you mean "${guess}"?` : ''} (${names.length ? `its markers: ${names.join(', ')}` : 'it has no markers'}; any layer also has start, mid, end)`);
        }
        const local = target.markers.get(word!)!;
        const u = clockOf(target).inverse(local);
        if (u === null) throw new Unresolved(`the clock of composition "${name}" never reaches its marker "${word}" (${round(local)} s)`);
        t = start + u;
      }
    }
    return settle(carry(where, t, here) + offset);
  }

  /** the layer a name means, seen from `n`: beside it first, then deeper, then around it; a path `scene/host` goes down by names */
  function find(n: Node, name: string, context: string): Node {
    const parts = name.split('/').map(s => s.trim());
    const first = parts.length > 1 && !nearest(n, name) ? parts[0]! : name;
    const hit = nearest(n, first);
    if (!hit) {
      const names = [...new Set(all.map(x => x.spec.name).filter((v): v is string => typeof v === 'string'))];
      const guess = suggestName(name, names);
      throw new Unresolved(`no layer named "${name}"${guess ? ` — did you mean "${guess}"?` : ''}`);
    }
    if (hit.length > 1) {
      const together = hit.every(h => h.parent === hit[0]!.parent);
      say(`${context}: ${hit.length} layers are named "${first}" ${together ? 'beside each other' : 'as near as each other'}; the first is used (give them different names)`);
    }
    let node = hit[0]!;
    if (first !== name) {
      for (const part of parts.slice(1)) {
        const below = deeper(node, part);
        if (!below) throw new Unresolved(`no layer named "${part}" inside "${String(node.spec.name)}"`);
        node = below[0]!;
      }
    }
    return node;
  }
  function nearest(n: Node, name: string): Node[] | null {
    for (let a = n.parent; a; a = a.parent) { const d = deeper(a, name); if (d) return d; }
    return null;
  }
  function deeper(a: Node, name: string): Node[] | null {
    let level = a.children;
    while (level.length) {
      const hits = level.filter(c => c.spec.name === name);
      if (hits.length) return hits;
      level = level.flatMap(c => c.children);
    }
    return null;
  }

  /** where a layer ends, on its parent's clock */
  function endOf(x: Node, start: number): number {
    const p = x.parent!;
    const d = num(x.spec.duration);
    if (d !== undefined) return Math.min(start + d, p.span);
    if (x.spec.type === 'composition') return Math.min(start + x.life, p.span);
    if (x.spec.type === 'video' || x.spec.type === 'audio') {
      const of = x.spec.type === 'audio' && (x.spec.sfx !== undefined || x.spec.music !== undefined) ? 'its sound' : 'its file';
      throw new Unresolved(`${String(x.spec.type)} layer "${String(x.spec.name)}" has no duration (it lasts as long as ${of}), so its end is not known here; give it a duration`);
    }
    return p.span;
  }

  /** a time on `from`'s clock → the same moment on `to`'s clock (up to the composition around both, then down) */
  function carry(from: Node, t: number, to: Node): number {
    const up = new Set<Node>();
    for (let a: Node | null = to; a; a = a.parent) up.add(a);
    let a = from;
    while (!up.has(a)) {
      const u = clockOf(a).inverse(t);
      if (u === null) throw new Unresolved(`the clock of composition "${String(a.spec.name)}" never reaches ${round(t)} s`);
      t = atOf(a) + u;
      a = a.parent!;
    }
    const path: Node[] = [];
    for (let b: Node = to; b !== a; b = b.parent!) path.unshift(b);
    for (const c of path) t = clockOf(c).forward(t - atOf(c));
    return t;
  }

  /** a composition's clock, built from its keyframes once their moments are seconds */
  function clockOf(c: Node): Clock {
    if (c.clock === undefined) {
      if (kfDoing.has(c)) throw new Unresolved(`a keyframe of composition "${String(c.spec.name)}" names a moment measured by the clock that keyframe sets; give seconds`);
      keyframesOf(c);
      c.clock = makeClock(c);
    }
    if (c.clock === null) throw new Unresolved(`the clock of composition "${String(c.spec.name)}" cannot be followed here (its time keyframes use expressions); give seconds`);
    return c.clock;
  }

  /** a node's keyframes whose `at` names a moment → seconds from the start of the node */
  function keyframesOf(n: Node): void {
    if (kfDone.has(n) || n === root || !Array.isArray(n.spec.keyframes) || !n.spec.keyframes.some(isNamedKf)) return;
    kfDoing.add(n);
    try {
      const start = atOf(n);
      n.spec.keyframes = n.spec.keyframes.map((kf: unknown) => {
        if (!isNamedKf(kf)) return kf;
        const raw = kf.at as string;
        let rel = 0;
        try {
          rel = settle(moment(n, raw, `${who(n)}: keyframe at: "${raw}"`) - start);
          if (rel < -1e-9) { say(`${who(n)}: keyframe at: "${raw}" is ${round(-rel)} s before the layer starts (at ${round(start)}); at 0 instead`); rel = 0; }
        } catch (e) {
          if (!(e instanceof Unresolved)) throw e;
          say(`${who(n)}: keyframe at: "${raw}"${tell(e)}; at 0 instead`);
        }
        return { ...kf, at: Math.max(0, rel) };
      });
    } finally { kfDoing.delete(n); kfDone.add(n); }
  }

  // every `at` (layers, masks, transitions), then the keyframes' moments, then the markers on the movie's clock
  for (const n of all) if (n !== root) atOf(n);
  for (const n of all) keyframesOf(n);
  const markers: MarkerTime[] = [];
  for (const n of all) {
    for (const [name, local] of n.markers) {
      try {
        let time = local;
        if (n !== root) { const u = clockOf(n).inverse(local); if (u === null) continue; time = settle(carry(n.parent!, atOf(n) + u, root)); }
        markers.push({ layer: n === root ? null : (typeof n.spec.name === 'string' ? n.spec.name : null), name, time });
      } catch (e) { if (!(e instanceof Unresolved)) throw e; }
    }
  }
  return { spec: rootSpec as T, warnings: [...said], markers };
}

/** A keyframe whose `at` names a moment (a string with an @; other strings are left to the keyframe's own checks). */
const isNamedKf = (kf: unknown): kf is Plain => isPlain(kf) && typeof kf.at === 'string' && kf.at.includes('@');

/** The inline layer of a `mask` (`mask: { type, … }` or `mask: { layer: { type, … }, invert }`), or null for a mask by name. */
function maskLayerOf(mask: unknown): Plain | null {
  if (!isPlain(mask)) return null;
  if (typeof mask.type === 'string') return mask;
  return isPlain(mask.layer) && typeof mask.layer.type === 'string' ? mask.layer : null;
}

/** Anything to do: a string `at` (of a layer, a mask, a transition, or a keyframe's with an @) or markers somewhere. */
function needsWork(spec: Plain): boolean {
  const layer = (l: unknown): boolean => isPlain(l) && (typeof l.at === 'string' || l.markers !== undefined || (Array.isArray(l.keyframes) && l.keyframes.some(isNamedKf))
    || look(l.layers) || layer(maskLayerOf(l.mask)) || (Array.isArray(l.transitions) && l.transitions.some(t => isPlain(t) && typeof t.at === 'string')));
  const look = (list: unknown): boolean => Array.isArray(list) && list.some(layer);
  return spec.markers !== undefined || layer(spec) || (Array.isArray(spec.stops) && spec.stops.some(st => typeof st === 'string' || (isPlain(st) && typeof st.at === 'string')));
}

function makeNode(spec: Plain, parent: Node | null, life: number, kind: Node['kind'], say: (m: string) => void, all: Node[], owner?: Node): Node {
  const isComp = spec.type === 'composition' || !parent;
  const remap = isComp ? remapOf(spec as never, 'time', null) : null;
  const span = remap ? contentLength(remap, life) : life;
  const node: Node = { spec, parent, children: [], kind, life, span, markers: new Map(), ...(owner ? { owner } : {}) };
  all.push(node);
  if (spec.markers !== undefined) {
    const who = parent ? `composition "${String(spec.name ?? '?')}"` : 'the root composition';
    if (!isPlain(spec.markers)) say(`${who}: markers must be an object of names and seconds (markers: { in: 0.6, out: 2.4 }); ignored`);
    else for (const [name, raw] of Object.entries(spec.markers)) {
      const v = num(raw);
      if (OWN.includes(name)) { say(`${who}: marker "${name}" is a word every layer already has (start, mid, end); give it another name`); continue; }
      if (!NAME.test(name)) { say(`${who}: marker "${name}" must be a word (letters, digits, _), to be written as "name@${name.replace(/\W+/g, '_')}"; ignored`); continue; }
      if (v === undefined) { say(`${who}: marker "${name}" must be a number of seconds of the composition (markers: { ${name}: 0.6 }); ignored`); continue; }
      const t = v < 0 ? span + v : v;
      if (t < 0 || t > span + 1e-9) { say(`${who}: marker "${name}" at ${round(v)} s is past its ${t < 0 ? 'start' : 'end'} (${round(span)} s); ignored`); continue; }
      node.markers.set(name, t);
    }
  }
  // a layer with no duration lives on the clock of its composition (a composition: the whole of it, as the runtime gives `duration: span`)
  const childLife = (l: Plain) => num(l.duration) ?? span;
  if (Array.isArray(spec.layers)) {
    spec.layers = spec.layers.map(l => (isPlain(l) ? { ...l } : l));
    for (const l of spec.layers as unknown[]) {
      if (!isPlain(l)) continue;
      const child = makeNode(l, node, childLife(l), 'layer', say, all);
      node.children.push(child);
      // an inline mask: its explicit `at` is composition time, like a layer's; with none it lives with the layer it cuts
      const inline = maskLayerOf(l.mask);
      if (inline) {
        const copy = { ...inline };
        l.mask = typeof (l.mask as Plain).type === 'string' ? copy : { ...(l.mask as Plain), layer: copy };
        makeNode(copy, node, num(copy.duration) ?? num(l.duration) ?? span, 'mask', say, all, child);
      }
    }
  }
  // the root's stops: a moment alone ('host@in') or as a stop's at; on the movie's clock
  if (!parent && Array.isArray(spec.stops)) {
    spec.stops = spec.stops.map(st => (typeof st === 'string' ? { at: st } : isPlain(st) ? { ...st } : st));
    (spec.stops as unknown[]).forEach((st, i) => { if (isPlain(st) && typeof st.at === 'string') { const n = makeNode(st, node, span, 'stop', say, all); n.index = i; } });
  }
  if (Array.isArray(spec.transitions)) {
    spec.transitions = spec.transitions.map(t => (isPlain(t) ? { ...t } : t));
    for (const t of spec.transitions as unknown[]) if (isPlain(t) && typeof t.at === 'string') makeNode(t, node, span, 'transition', say, all);
  }
  return node;
}

/** u = seconds since the composition started (outer clock) ↔ its local clock */
function makeClock(c: Node): Clock | null {
  const spec = c.spec;
  const remap: TimeRemap | null = remapOf(spec as never, 'time', c.span);
  const life = c.life;
  if (!remap) return { forward: u => u, inverse: m => (m >= -1e-9 && m <= life + 1e-9 ? m : null) };
  if (!remap.timeKfs.length) {
    const s = remap.speed ?? 1;
    const from = remap.start ?? (s < 0 ? -s * life : 0);
    return { forward: u => from + s * u, inverse: m => { const u = (m - from) / s; return u >= -1e-9 && u <= life + 1e-9 ? Math.max(0, u) : null; } };
  }
  let table: ReturnType<typeof clockTable>;
  try { table = clockTable(remap, 'time', life, 0, {}, life); } catch { return null; }
  const h = 1 / 1000, n = Math.ceil(life / h);
  return {
    forward: u => table.at(u),
    inverse: m => {
      let prev = table.at(0);
      if (Math.abs(prev - m) < 1e-9) return 0;
      for (let k = 1; k <= n; k++) {
        const u = Math.min(k * h, life), v = table.at(u);
        if ((prev - m) * (v - m) <= 0 && v !== prev) return u - h + h * ((m - prev) / (v - prev));
        prev = v;
      }
      return null;
    },
  };
}

function describeType(n: Node): string {
  const t = String(n.spec.type ?? 'layer');
  return `${/^[aeiou]/.test(t) ? 'an' : 'a'} ${t} layer`;
}
