/**
 * `follow: '<layer>/<object>'` and `movie.project(target)`: where an object of a scene (scene3d, three, scene2d) or another layer is on the canvas
 * in the frame on screen, and the internal null layers ("carriers") that carry the layers that follow one there, every frame.
 *
 * A follower is drawn inside a carrier, as a layer with `parent` is drawn inside its null layer, so masks, mattes, pick, inspect and the stack work
 * unchanged; Movie places every carrier after the layers have been set for the frame (the scene layers' update(t) and followCamera) and before the
 * threeD projection. See docs/superpowers/specs/2026-11-14-follow-design.md.
 */
import type { Container } from 'pixi.js';
import type { Sequence } from '../sequences/Base';
import { describeLayer } from './lint';
import { suggestName } from './options';

/** What a scene layer answers: the canvas point of one of its objects, null while it is not seen (behind the camera), undefined for no such object. */
export interface ScreenPointer {
  screenPoint(object: string): { x: number; y: number } | null | undefined;
  /** The names `screenPoint` knows, for a message. */
  objectNames(): string[];
}

/** The bits of a composition this module reads (CompositionSequence, without importing it: it imports this file). */
export interface FollowComposition extends Sequence {
  readonly childLayers: readonly Sequence[];
  readonly follows: ReadonlyArray<{ carrier: Sequence; follower: Sequence; target: string }>;
}

export type Resolved = { seq: Sequence; object?: string; card: boolean } | { error: string };

const isComposition = (s: Sequence): s is FollowComposition => Array.isArray((s as Partial<FollowComposition>).childLayers);
const isPointer = (s: Sequence): s is Sequence & ScreenPointer => typeof (s as Partial<ScreenPointer>).screenPoint === 'function';

/** Every layer of the tree with the composition it is in and whether that composition is (inside) a threeD card. */
function* allLayers(comp: FollowComposition, card = false): Generator<{ seq: Sequence; comp: FollowComposition; card: boolean }> {
  for (const seq of comp.childLayers) {
    yield { seq, comp, card };
    if (isComposition(seq)) yield* allLayers(seq, card || !!seq.spec.threeD);
  }
}

/** `'<layer path>[/<object>]'` → the layer and the object, or a sentence that says what is wrong (with the names there are). */
export function resolveTarget(root: FollowComposition, target: string): Resolved {
  const segs = String(target).split('/').filter((s) => s.length > 0);
  if (segs.length === 0) return { error: `"${target}" names no layer` };
  const walk = (comp: FollowComposition, rest: string[], card: boolean): Resolved | null => {
    const seq = comp.childLayers.find((c) => c.spec.name === rest[0]);
    if (!seq) return null;
    if (rest.length === 1) return { seq, card };
    if (isComposition(seq)) return walk(seq, rest.slice(1), card || !!seq.spec.threeD);
    if (isPointer(seq) && rest.length === 2) {
      if (seq.screenPoint(rest[1]!) !== undefined) return { seq, object: rest[1], card };
      const known = seq.objectNames();
      const hint = suggestName(rest[1]!, known);
      return { error: `the ${seq.spec.type} layer "${seq.spec.name}" has no object "${rest[1]}"${hint ? ` (did you mean "${hint}"?)` : ''} (objects: ${known.slice(0, 12).join(', ') || 'none'})` };
    }
    return { error: `"${rest.slice(1).join('/')}" is not inside the ${seq.spec.type} layer "${seq.spec.name}": only a composition has layers, and only a scene3d, three or scene2d layer has objects` };
  };
  const fromRoot = walk(root, segs, false);
  if (fromRoot) return fromRoot;
  // a name found anywhere, when it is the only one
  const named = [...allLayers(root)].filter((l) => l.seq.spec.name === segs[0]);
  if (named.length === 1) {
    const { seq, card } = named[0]!;
    if (segs.length === 1) return { seq, card };
    const inner = isComposition(seq) ? walk(seq, segs.slice(1), card || !!seq.spec.threeD) : walk({ childLayers: [seq] } as unknown as FollowComposition, segs, card);
    if (inner) return inner;
  }
  if (named.length > 1) return { error: `${named.length} layers are named "${segs[0]}": give the path from the top (group/${segs[0]})` };
  const names = [...new Set([...allLayers(root)].map((l) => l.seq.spec.name).filter((n): n is string => !!n))];
  const hint = suggestName(segs[0]!, names);
  return { error: `no layer "${segs[0]}"${hint ? ` (did you mean "${hint}"?)` : ''} (layers: ${names.slice(0, 12).join(', ') || 'none'})` };
}

/** Is a display drawn now: it and every container above it visible and renderable, up to a container with no parent (the stage). */
export function drawnNow(d: Container | null | undefined): boolean {
  for (let c: Container | null | undefined = d; c; c = c.parent) if (!c.visible || !c.renderable) return false;
  return !!d;
}

/** The canvas point of a resolved target in the frame on screen, or null while it is not seen. */
export function pointOf(r: { seq: Sequence; object?: string; card: boolean }): { x: number; y: number } | null {
  if (r.card || r.seq.spec.threeD) return null;
  const d = r.seq.target as Container | null;
  if (!drawnNow(d)) return null;
  if (r.object !== undefined) return isPointer(r.seq) ? (r.seq.screenPoint(r.object) ?? null) : null;
  const p = d!.parent ? d!.parent.toGlobal(d!.position) : { x: d!.x, y: d!.y };
  return { x: p.x, y: p.y };
}

/** Why a resolved target cannot be followed at all (said once, at build), or null. */
export function cannotFollow(r: { seq: Sequence; card: boolean }): string | null {
  if (r.card) return `it is inside a threeD card, which is projected by the camera after the layers are placed (a card's own layers cannot be followed yet)`;
  if (r.seq.spec.threeD) return `it is a threeD layer, projected by the camera after the layers are placed (it cannot be followed yet)`;
  return null;
}

/** Every follower of the tree, with its carrier, its target and whether it is itself inside a threeD card. */
export function collectFollows(root: FollowComposition): Array<{ carrier: Sequence; follower: Sequence; target: string; inCard: boolean }> {
  const out: Array<{ carrier: Sequence; follower: Sequence; target: string; inCard: boolean }> = [];
  const visit = (comp: FollowComposition, card: boolean): void => {
    for (const f of comp.follows) out.push({ ...f, inCard: card });
    for (const c of comp.childLayers) if (isComposition(c)) visit(c, card || !!c.spec.threeD);
  };
  visit(root, false);
  return out;
}

/** Places the carriers of a tree for the frame on screen. `resolved` keeps what each follower's target is (per build); a mistake is said once. */
export function placeFollows(root: FollowComposition, resolved: WeakMap<Sequence, Resolved>): void {
  for (const f of collectFollows(root)) {
    const carrier = f.carrier.target as Container | null;
    if (!carrier) continue;
    let r = resolved.get(f.carrier);
    if (r === undefined) {
      r = f.inCard ? { error: 'a layer inside a threeD card cannot follow yet (the card is drawn into a texture: its layers are not where the screen is)' } : resolveTarget(root, f.target);
      if (!('error' in r)) { const why = cannotFollow(r); if (why) r = { error: why }; }
      if ('error' in r) console.warn(`pixi-effects: ${describeLayer(f.follower.spec)}: follow "${f.target}": ${r.error}; the layer is drawn where its own x / y put it`);
      resolved.set(f.carrier, r);
    }
    if ('error' in r) { carrier.position.set(0, 0); carrier.renderable = true; continue; }
    const p = pointOf(r);
    carrier.renderable = p !== null;
    if (p && carrier.parent) { const local = carrier.parent.toLocal(p); carrier.position.set(local.x, local.y); }
  }
}
