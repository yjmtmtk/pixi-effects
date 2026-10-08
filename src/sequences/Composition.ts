import { AlphaMask, Container, Rectangle } from 'pixi.js';
import { gsap } from 'gsap';
import { Sequence } from './Base';
import { NullSequence } from './Null';
import { suggestName } from '../core/options';
import { buildSequenceTree } from '../core/Composition';
import { CameraSequence } from '../space/CameraSequence';
import { findOverlap, pickActiveCamera } from '../space/camera';
import { assignDepthOrder } from '../space/depth';
import { Layer3D, type SpaceHost } from '../space/Layer3D';
import { lintSequence } from '../space/lint';
import { describeLayer, lintText, lintTiming, summarizeWarnings } from '../core/lint';
import { applyBlendMode } from '../core/blend';
import { cameraBasis, homeCamera } from '../space/math';
import type { CompositionSequenceSpec, AudioDescriptor, CompositionShape, SequenceSpec } from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

export class CompositionSequence extends Sequence {
  declare spec: CompositionSequenceSpec;
  private _innerContainer: Container | null = null;
  private _compositionShape: CompositionShape | null = null;
  _children: Sequence[] = [];
  private _cameras: CameraSequence[] = [];
  private _layers3d: Layer3D[] = [];
  /** Drawn children in stack order (cameras and target-less sequences excluded). */
  private _visual: Array<{ seq: Sequence; layer: Layer3D | null }> = [];
  /** Layers drawn inside a null layer (`parent`): they are not in the composition's own stack. */
  private _nested: Sequence[] = [];
  /** The null layer each parented layer is drawn inside. */
  private _parentOf = new Map<Sequence, NullSequence>();

  async build(): Promise<void> {
    const width = this.spec.width ?? this.parent?.width ?? this.root.width;
    const height = this.spec.height ?? this.parent?.height ?? this.root.height;
    if (this.duration === undefined) {
      this.duration = this.spec.duration ?? this.parent?.duration ?? this.root.duration;
    }
    const wrapper = new Container();
    wrapper.cullable = true;
    wrapper.cullableChildren = true;
    wrapper.cullArea = new Rectangle(0, 0, width, height);

    const inner = new Container();
    inner.cullable = true;
    inner.cullableChildren = true;
    wrapper.addChild(inner);

    this.target = wrapper;
    this.intrinsicWidth = width;
    this.intrinsicHeight = height;
    this._innerContainer = inner;
    this._compositionShape = { width, height, duration: this.duration };

    const lateKeyframes: string[] = [];
    for (const s of this.spec.sequences ?? []) {
      lintSequence(s);
      lintTiming(s, this.duration, (message, kind) => (kind === 'late-keyframe' ? lateKeyframes.push(message) : console.warn(message)));
      lintText(s);
    }
    for (const message of summarizeWarnings(lateKeyframes)) console.warn(message);

    this._children = await buildSequenceTree(
      this.spec.sequences ?? [],
      this._compositionShape,
      this.root,
    );
    this._resolveParents();
    for (const child of this._children) {
      // Cameras are display-less: they only feed the projection pass.
      if (child instanceof CameraSequence) {
        this._cameras.push(child);
        continue;
      }
      if (!child.target) continue;
      const holder = this._parentOf.get(child);
      const into = holder?.target ?? inner;       // a layer with `parent` is drawn inside its null layer

      const maskSpec = (child.spec as { mask?: SequenceSpec }).mask;

      // threeD layers never enter the scene graph themselves: their display
      // object is rendered into a texture and a perspective mesh stands in.
      if (child.spec.threeD) {
        const layer = new Layer3D(child, frameOf(child));
        inner.addChild(layer.display);
        this._layers3d.push(layer);
        this._visual.push({ seq: child, layer });
        applyBlendMode(child.spec, layer.display);
        if (maskSpec) {
          console.warn(`pixi-effects: ${describeLayer(child.spec)}: mask is not supported on threeD layers yet; ignored`);
        }
        continue;
      }

      into.addChild(child.target);
      if (holder) this._nested.push(child);
      else this._visual.push({ seq: child, layer: null });
      applyBlendMode(child.spec, child.target);
      // If this child has a `mask` spec, build the mask sequence in the same
      // composition shape, add its target to the same parent (so its
      // transforms resolve in the same coord space), and wire PIXI's
      // mask channel. PIXI v8 renders mask containers into the stencil /
      // alpha buffer; they don't render as normal children.
      if (maskSpec) {
        // The mask lives and animates with the layer it masks: with no `at` of its own its `at` and
        // `duration` are the layer's, so its keyframes are measured from the layer's start too. An
        // explicit `at` is composition time, exactly like a layer's.
        const lifetime = maskSpec.at === undefined
          ? { at: child.at, duration: maskSpec.duration ?? child.duration }
          : {};
        const built = await buildSequenceTree([{ ...maskSpec, ...lifetime } as SequenceSpec], this._compositionShape, this.root);
        const maskSeq = built[0];
        if (maskSeq?.target) {
          into.addChild(maskSeq.target);          // the mask shares the layer's space
          // PIXI v8 `setMask` accepts an `inverse` flag — that's how we
          // expose `maskInverted` from the spec. Falls back to plain
          // `target.mask = …` for runtimes that don't have setMask
          // (older PIXI builds).
          const inverse = (child.spec as { maskInverted?: boolean }).maskInverted ?? false;
          const t = child.target as Container & {
            setMask?: (opts: { mask: Container | null; inverse?: boolean }) => void;
            addEffect: (effect: AlphaMask) => void;
            mask: Container | null;
          };
          if (inverse || maskSpec.type === 'text') {
            // A stencil mask is the mask's geometry: a text layer's is its whole bounding box (the letters' alpha is ignored), and
            // PIXI's inverted stencil tests against the empty level, so inside a masked parent it shows what the parent hides.
            // An alpha mask draws the mask into a texture and uses its alpha: letters stay letters, an inverse is 1 − alpha.
            const effect = new AlphaMask({ mask: maskSeq.target });
            effect.inverse = inverse;
            t.setMask?.({ mask: undefined as never, inverse });     // the alpha pipe reads `inverse` from the maskee's mask options, not from the effect
            t.addEffect(effect);
          } else if (typeof t.setMask === 'function') {
            t.setMask({ mask: maskSeq.target, inverse });
          } else {
            t.mask = maskSeq.target;
          }
          child.maskSequence = maskSeq;
          maskSeq.keepHidden = maskSpec.type === 'image' || maskSpec.type === 'video';   // PIXI: a Sprite mask is hidden by renderable = false
        }
      }
    }

    if (this._layers3d.length > 0) {
      // Stack order becomes explicit zIndex so threeD layers can be re-sorted
      // by depth each frame without reparenting.
      inner.sortableChildren = true;
      this._visual.forEach((v, i) => {
        (v.layer?.display ?? v.seq.target!).zIndex = i;
      });
    } else if (this._cameras.length > 0) {
      console.warn('pixi-effects: camera has no effect: this composition has no threeD layers');
    }

    this.buildFilters();
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    super.bindTimeline(timeline, offset);
    // Children's `at` is relative to this composition's start, so push them
    // forward by our absolute start time on the global timeline.
    const childOffset = offset + this.at;
    for (const child of this._children) {
      // Each layer builds its tweens in a small timeline of its own, which is added to the parent once, finished. Adding
      // thousands of tweens one by one to a single timeline makes GSAP re-measure the whole timeline at every add (the cost
      // grows with the square of the count: ~3 s for a piece with 700 particle layers); this way the parent only ever holds
      // one child per layer. Positions stay absolute, so the picture at any time is the same.
      const own = gsap.timeline({ defaults: { ease: 'none' } });
      child.bindTimeline(own, childOffset);
      // The mask shares the maskee's offset — its `at` is interpreted
      // relative to the composition's start, just like the child itself,
      // so a reveal-from-zero animation lines up naturally.
      child.maskSequence?.bindTimeline(own, childOffset);
      timeline.add(own, 0);
    }
    const overlap = findOverlap(this._cameras.map(c => c.window()));
    if (overlap) {
      console.warn(`pixi-effects: cameras #${overlap[0] + 1} and #${overlap[1] + 1} overlap in time; the top-most one wins`);
    }
  }

  /**
   * Drawn children in stack order, with the display object that stands in for each (the mesh for a threeD layer).
   * Null layers draw nothing and are left out; the layers inside them follow, with the null layers that carry them.
   */
  layers(): Array<{ seq: Sequence; display: Container; threeD: boolean; carriers: NullSequence[] }> {
    const carriersOf = (seq: Sequence): NullSequence[] => {
      const out: NullSequence[] = [];
      for (let p = this._parentOf.get(seq); p; p = this._parentOf.get(p)) out.push(p);
      return out;
    };
    return [...this._visual.map(v => v.seq), ...this._nested]
      .filter(seq => !(seq instanceof NullSequence))
      .map(seq => {
        const layer = this._visual.find(v => v.seq === seq)?.layer ?? null;
        return {
          seq,
          display: (layer?.display ?? seq.target!) as unknown as Container,
          threeD: layer !== null,
          carriers: carriersOf(seq),
        };
      });
  }

  /** Match every `parent: 'name'` to a null layer; anything that cannot work is said out loud and drawn unparented. */
  private _resolveParents(): void {
    const nulls = this._children.filter((c): c is NullSequence => c instanceof NullSequence);
    const nullNames = nulls.map(n => n.spec.name).filter((n): n is string => !!n);
    const warned = new Set<string>();
    for (const child of this._children) {
      const want = child.spec.parent;
      if (want === undefined) continue;
      const who = describeLayer(child.spec);
      if (child instanceof CameraSequence) { console.warn(`pixi-effects: ${who}: a camera cannot have a parent; ignored`); continue; }
      if (child.spec.threeD) { console.warn(`pixi-effects: ${who}: a threeD layer cannot have a parent (parent "${want}" ignored)`); continue; }
      const same = this._children.filter(c => c.spec.name === want);
      if (same.length === 0) {
        const hint = suggestName(want, nullNames);
        console.warn(`pixi-effects: ${who}: parent "${want}": no layer with that name${hint ? `; did you mean "${hint}"?` : ''} (the layer is drawn without a parent)`);
        continue;
      }
      const holder = same.find((c): c is NullSequence => c instanceof NullSequence);
      if (!holder) {
        console.warn(`pixi-effects: ${who}: parent "${want}" is a ${same[0]!.spec.type} layer; only { type: 'null' } layers can be parents (the layer is drawn without a parent)`);
        continue;
      }
      if (same.length > 1 && !warned.has(want)) {
        warned.add(want);
        console.warn(`pixi-effects: ${same.length} layers are named "${want}"; parent "${want}" uses the first null layer with that name`);
      }
      if (holder === child) { console.warn(`pixi-effects: ${who} is its own parent; ignored`); continue; }
      this._parentOf.set(child, holder);
    }
    // a chain that leads back to itself: break it where we find it
    for (const start of this._children) {
      const seen = new Set<Sequence>([start]);
      for (let p = this._parentOf.get(start); p; p = this._parentOf.get(p)) {
        if (p === start) {
          const names = [...seen].map(s => s.spec.name ?? s.spec.type).join(' → ');
          console.warn(`pixi-effects: parent cycle: ${names} → ${start.spec.name ?? start.spec.type}; the parent of "${start.spec.name ?? start.spec.type}" is ignored`);
          this._parentOf.delete(start);
          break;
        }
        if (seen.has(p)) break;
        seen.add(p);
      }
    }
  }

  override syncFrame(): void {
    super.syncFrame();
    for (const child of this._children) child.syncFrame();
  }

  override updateSpace(t: number, host: SpaceHost): void {
    // Inner compositions first: a threeD composition is rendered into its own
    // texture by this level, so its content must already be projected.
    for (const child of this._children) child.updateSpace(t, host);
    if (this._layers3d.length === 0 || !this._compositionShape) return;

    const { width, height } = this._compositionShape;
    const compEnd = (this.absoluteStart ?? 0) + (this.duration ?? 0);
    const active = pickActiveCamera(
      this._cameras.map(cam => ({ cam, ...cam.window() })),
      t,
      compEnd,
    );
    const basis = cameraBasis(active ? active.cam.state() : homeCamera(width, height), width, height);

    for (const layer of this._layers3d) layer.update(host, basis);

    const order = assignDepthOrder(
      this._visual.map((v, i) => ({ stackIndex: i, threeD: v.layer !== null, depth: v.layer?.depth ?? 0 })),
    );
    this._visual.forEach((v, i) => {
      if (v.layer) v.layer.display.zIndex = order[i]!;
    });
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    super.collectAudio(out, baseTime);
    const childBase = baseTime + this.at;
    for (const child of this._children) child.collectAudio(out, childBase);
  }

  override destroy(): void {
    for (const l of this._layers3d) l.destroy();
    this._layers3d = [];
    for (const c of this._children) c.destroy();
    super.destroy();
  }
}

/** Layer-space rectangle a threeD child projects: a composition's frame, otherwise its content bounds. */
function frameOf(child: Sequence): () => { x: number; y: number; width: number; height: number } {
  if (child instanceof CompositionSequence) {
    return () => ({ x: 0, y: 0, width: child.intrinsicWidth, height: child.intrinsicHeight });
  }
  return () => child.target!.getLocalBounds();
}
