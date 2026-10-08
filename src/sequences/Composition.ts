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
import { lintSequence, lintFocus } from '../space/lint';
import { layerInitialZ, blurRadius, MANY_BLURRED } from '../space/focus';
import { describeLayer, lintText, lintTiming, summarizeWarnings, lintKeys } from '../core/lint';
import { applyBlendMode } from '../core/blend';
import { cameraBasis, homeCamera, projectPoint, NEAR, type CameraBasis, type CameraState } from '../space/math';
import { timeRemapOf, remapOf, contentLength, bindClock, clockTable, type TimeRemap, type ClockTable } from '../core/remap';
import type { CompositionSequenceSpec, AudioDescriptor, CompositionShape, SequenceSpec } from '../types';

type Timeline = ReturnType<typeof gsap.timeline>;

export class CompositionSequence extends Sequence {
  declare spec: CompositionSequenceSpec;
  private _innerContainer: Container | null = null;
  private _compositionShape: CompositionShape | null = null;
  _children: Sequence[] = [];
  private _cameras: CameraSequence[] = [];
  private _layers3d: Layer3D[] = [];
  private _dofSaid = { behind: false, many: false };
  /** Drawn children in stack order (cameras and target-less sequences excluded). */
  private _visual: Array<{ seq: Sequence; layer: Layer3D | null }> = [];
  /** Layers drawn inside a null layer (`parent`): they are not in the composition's own stack. */
  private _nested: Sequence[] = [];
  /** The null layer each parented layer is drawn inside. */
  private _parentOf = new Map<Sequence, NullSequence>();
  /** Set when this composition's own time is remapped: the children live on `_inner` in LOCAL time, driven by `_clock`. */
  private _inner: Timeline | null = null;
  private _clock: { time: number } | null = null;
  private _remap: TimeRemap | null = null;
  private _childBase = 0;
  private _contentSpan = 0;

  /** Where the children's time starts: the composition's absolute start, or 0 when their time is local (remapped). */
  get childBase(): number { return this._childBase; }
  /** How long the children's time runs: the composition's duration, or its content length when its time is remapped. */
  get contentSpan(): number { return this._contentSpan; }
  /** The time the children live in at movie time `t`: the movie's own, or this composition's local clock when it is remapped. */
  childTime(t: number): number { return this._clock ? this._clock.time : t; }
  /** The clock reader for filters that want the time (grain), or null when the children run on the movie's time. */
  localClock(): (() => number) | null { return this._clock ? () => this._clock!.time : null; }
  /** How the time is remapped, for the timeline chart: `×0.5`, `×-1`, `time keyframes`, or null. */
  remapLabel(): string | null {
    const r = this._remap;
    if (!r) return null;
    return r.timeKfs.length ? 'time keyframes' : `×${r.speed ?? 1}`;
  }

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
    // A remapped composition's children live in LOCAL time, which can run past the composition's own duration (speed 2 reads twice as far).
    const base = timeRemapOf(this.spec as never);
    const span = base ? contentLength(base, this.duration) : this.duration;
    this._remap = base ? remapOf(this.spec as never, 'time', span) : null;
    this._contentSpan = span;
    this._compositionShape = { width, height, duration: span };

    const lateKeyframes: string[] = [];
    for (const s of this.spec.sequences ?? []) {
      lintSequence(s);
      lintFocus(s, this.spec.sequences ?? []);
      lintTiming(s, span, (message, kind) => (kind === 'late-keyframe' ? lateKeyframes.push(message) : console.warn(message)));
      lintText(s);
      lintKeys(s);
    }
    for (const message of summarizeWarnings(lateKeyframes)) console.warn(message);

    this._children = await buildSequenceTree(
      this.spec.sequences ?? [],
      this._compositionShape,
      this.root,
    );
    this._resolveParents();
    // A camera's `focus: "title"` becomes that layer's first z, here, where the siblings exist (a camera sees only its parent's shape)
    for (const cam of this._children) {
      if (!(cam instanceof CameraSequence)) continue;
      cam.resolveFocusNames(name => {
        const hit = this._children.find(c => c.spec.name === name && c.spec.threeD);
        return hit ? layerInitialZ(hit.spec, hit.scope() as unknown as Record<string, number>) : undefined;
      });
    }
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

  protected override displayProps(): { initial: CompositionSequenceSpec['initial']; keyframes: CompositionSequenceSpec['keyframes'] } {
    const r = this._remap;
    return r ? { initial: r.restInitial as CompositionSequenceSpec['initial'], keyframes: r.restKfs } : super.displayProps();
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    super.bindTimeline(timeline, offset);
    const remap = this._remap;
    // Children's `at` is relative to this composition's start, so push them forward by our absolute start time on the global
    // timeline. A remapped composition builds them in LOCAL time (offset 0) on a timeline of its own, which the clock drives.
    const childOffset = remap ? 0 : offset + this.at;
    this._childBase = childOffset;
    const target = remap ? gsap.timeline({ paused: true, defaults: { ease: 'none' } }) : timeline;
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
      target.add(own, 0);
    }
    if (remap) this._bindClock(timeline, target, remap, offset);
    const overlap = findOverlap(this._cameras.map(c => c.window()));
    if (overlap) {
      console.warn(`pixi-effects: cameras #${overlap[0] + 1} and #${overlap[1] + 1} overlap in time; the top-most one wins`);
    }
  }

  /** Drive the local timeline `inner` from the clock, and put the clock's tweens on the outer `timeline`. */
  private _bindClock(timeline: Timeline, inner: Timeline, remap: TimeRemap, offset: number): void {
    let last = NaN;
    let cur = 0;
    const clock = {
      get time(): number { return cur; },
      set time(v: number) {
        cur = v;
        if (v === last) return;                          // a freeze renders nothing
        last = v;
        inner.time(v);
      },
    };
    this._inner = inner;
    this._clock = clock;
    const scope = this.scope() as unknown as Record<string, number>;
    if (remap.start !== undefined && remap.timeKfs.length === 0) clock.time = remap.start;
    bindClock(timeline, clock, 'time', remap, this.duration!, offset + this.at, scope);
    // Initialise every tween of the local timeline in order (end, then start), as Movie does for the main one: GSAP captures a `to`
    // tween's start value the first time it renders, and a remap can reach a stretch of local time for the first time going BACKWARD.
    inner.time(inner.duration()); inner.time(0);
    last = NaN;                                          // the inner timeline now sits at 0, whatever the clock last said
    this._warnUnreachable(clockTable(remap, 'time', this.duration!, offset + this.at, scope, offset + this.at + this.duration!), offset + this.at, offset + this.at + this.duration!);
  }

  /**
   * A child the clock never dwells in is never visible: say so. Its `at` is in THIS composition's local time, so the usual mistake is
   * writing it in the outer time (or forgetting that speed 0.5 reaches only half as far). Decided by dwell, not by the clock's end
   * points: a clock that arrives at the child's `at` and HOLDS there shows it for the whole hold; one that only touches it in a single
   * instant (speed 0.5, a child at exactly the farthest local time) does not.
   */
  private _warnUnreachable(table: ClockTable, from: number, to: number): void {
    const remap = this._remap!;
    const how = remap.timeKfs.length ? 'time keyframes' : `speed ${remap.speed ?? 1}`;
    const span = this._contentSpan;
    const EPS = 1e-9;
    for (const child of this._children) {
      const at = child.at;
      if (at >= span) continue;                                    // already said by lintTiming ("starts after its composition ends")
      const end = Math.min(at + (child.duration ?? span), span);
      let dwell = 0;                                               // 1 ms samples of the clock inside [at, end)
      for (let t = from; t <= to && dwell < 2; t += 0.001) { const v = table.at(t); if (v >= at - EPS && v < end + EPS) dwell++; }
      if (dwell >= 2) continue;
      console.warn(
        `pixi-effects: ${describeLayer(child.spec)} starts at ${at}s of ${describeLayer(this.spec)}'s own time, but its clock only reaches ` +
        `${Number(table.min.toFixed(3))}–${Number(table.max.toFixed(3))}s (${how}), so it is never visible. ` +
        `Layers inside a remapped composition are placed in that composition's local time.`,
      );
    }
  }

  /**
   * Drawn children in stack order, with the display object that stands in for each (the mesh for a threeD layer).
   * Null layers draw nothing and are left out; the layers inside them follow, with the null layers that carry them.
   */
  layers(): Array<{ seq: Sequence; display: Container; threeD: boolean; carriers: NullSequence[]; depthBlur: number }> {
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
          depthBlur: layer?.blur ?? 0,
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
    const childT = this.childTime(t);
    for (const child of this._children) child.updateSpace(childT, host);
    if (this._layers3d.length === 0 || !this._compositionShape) return;

    const { width, height } = this._compositionShape;
    const compEnd = this._childBase + (this.duration ?? 0);
    const active = pickActiveCamera(
      this._cameras.map(cam => ({ cam, ...cam.window() })),
      childT,
      compEnd,
    );
    const cam = active ? active.cam.state() : homeCamera(width, height);
    const basis = cameraBasis(cam, width, height);

    for (const layer of this._layers3d) layer.update(host, basis);
    this._applyDepthOfField(cam, basis);

    const order = assignDepthOrder(
      this._visual.map((v, i) => ({ stackIndex: i, threeD: v.layer !== null, depth: v.layer?.depth ?? 0 })),
    );
    this._visual.forEach((v, i) => {
      if (v.layer) v.layer.display.zIndex = order[i]!;
    });
  }

  /** Depth of field: each threeD layer is blurred by how far its depth is from the focal plane (a pure function of the camera and the layers). */
  private _applyDepthOfField(cam: CameraState, basis: CameraBasis): void {
    const aperture = cam.aperture ?? 0;
    if (!(aperture > 0)) { for (const l of this._layers3d) l.setBlur(0); return; }
    const focusDepth = projectPoint(basis, { x: cam.lookAtX, y: cam.lookAtY, z: cam.focus ?? 0 }).depth;
    if (!(focusDepth > NEAR)) {
      if (!this._dofSaid.behind) {
        this._dofSaid.behind = true;
        console.warn(`pixi-effects: ${describeLayer(this.spec)}: the camera's focus (z = ${(cam.focus ?? 0).toFixed(0)}) is at or behind the camera, so nothing is blurred. Put focus in front of the camera (a z below the camera's z)`);
      }
      for (const l of this._layers3d) l.setBlur(0);
      return;
    }
    let blurred = 0;
    for (const l of this._layers3d) {
      l.setBlur(blurRadius(aperture, basis.focal, l.depth, focusDepth));
      if (l.blur > 0) blurred++;
    }
    if (blurred >= MANY_BLURRED && !this._dofSaid.many) {
      this._dofSaid.many = true;
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: ${blurred} layers are blurred by depth of field at once; each costs a filter pass per frame (WebGPU more). Merge the far layers or lower aperture`);
    }
  }

  override collectAudio(out: AudioDescriptor[], baseTime: number): void {
    super.collectAudio(out, baseTime);
    const remap = this._remap;
    if (!remap) {
      const childBase = baseTime + this.at;
      for (const child of this._children) child.collectAudio(out, childBase);
      return;
    }
    // The children's sounds are described in local time; each one is given a warp from the movie's time to it.
    const inner: AudioDescriptor[] = [];
    for (const child of this._children) child.collectAudio(inner, 0);
    const lo = baseTime + this.at, hi = lo + this.duration!;
    const table = clockTable(remap, 'time', this.duration!, lo, this.scope() as unknown as Record<string, number>, hi);
    for (const d of inner) {
      const prev = d.warp;
      out.push({ ...d, warp: (t: number) => (t < lo || t > hi ? NaN : prev ? prev(table.at(t)) : table.at(t)) });
    }
  }

  override destroy(): void {
    this._inner?.kill();
    this._inner = null;
    this._clock = null;
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
