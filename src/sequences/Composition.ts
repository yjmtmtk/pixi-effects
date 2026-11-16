import { AlphaFilter, Container, Graphics, Rectangle } from 'pixi.js';
import { createTimeline, type Timeline } from '../core/timelineEngine';
import { Sequence } from './Base';
import { NullSequence } from './Null';
import { suggestName } from '../core/options';
import { buildSequenceTree } from '../core/Composition';
import { CameraSequence } from '../space/CameraSequence';
import { LightSequence } from '../space/LightSequence';
import { lightSetProblems } from '../space/lightChecks';
import { MAX_CASTERS, lightLevel, packLights, type LightState } from '../space/lighting';
import type { CasterInput } from '../space/LitMaterial';
import { findOverlap, pickActiveCamera } from '../space/camera';
import { assignDepthOrder } from '../space/depth';
import { Layer3D, type SpaceHost } from '../space/Layer3D';
import { lintSequence, lintFocus } from '../space/lint';
import { layerInitialZ, blurRadius, MANY_BLURRED } from '../space/focus';
import { matteProblems, maskSourceOf, refNames, usesMatteRoute, canBeMatte, MANY_MATTES } from '../core/matte';
import { MatteSet } from '../core/MatteSet';
import { describeLayer, lintText, lintTiming, summarizeWarnings, lintKeys } from '../core/lint';
import { applyBlendMode, maxConcurrentAdvanced, MANY_ADVANCED, usesBackdropFilter, type BlendReport } from '../core/blend';
import { cameraBasis, homeCamera, projectPoint, NEAR, type CameraBasis, type CameraState } from '../space/math';
import { timeRemapOf, remapOf, contentLength, bindClock, clockTable, type TimeRemap, type ClockTable } from '../core/remap';
import { kfDuration } from '../core/spring';
import type { CompositionLayerSpec, AudioDescriptor, CompositionShape, LayerSpec, SpaceNow } from '../types';
import { layerAt } from '../core/layerAt';



export class CompositionSequence extends Sequence {
  declare spec: CompositionLayerSpec;
  private _innerContainer: Container | null = null;
  private _compositionShape: CompositionShape | null = null;
  _children: Sequence[] = [];
  private _cameras: CameraSequence[] = [];
  private _lights: LightSequence[] = [];
  /** The lights alive and the camera position of the last lit frame (what `inspect` reads: a layer's light level is computed from them on demand). */
  private _lighting: { states: LightState[]; cam: { x: number; y: number; z: number } } | null = null;
  private _layers3d: Layer3D[] = [];
  private _dofSaid = { behind: false, many: false };
  /** What this composition made for blend modes (filters added to layers' chains, groups and their carrier filters): destroyed with it. */
  private _blendOwned: Array<{ destroy(): void }> = [];
  /** The mattes (layers drawn into textures that cut other layers), when any layer of this composition names or has one. */
  private _mattes: MatteSet | null = null;
  private _inlineMattes = 0;
  /** Drawn children in stack order (cameras and target-less sequences excluded). */
  private _visual: Array<{ seq: Sequence; layer: Layer3D | null }> = [];
  /** Layers drawn inside a null layer (`parent`): they are not in the composition's own stack. */
  private _nested: Sequence[] = [];
  /** The null layer each parented layer is drawn inside. */
  private _parentOf = new Map<Sequence, NullSequence>();
  /** The layers with `follow`: each is drawn inside an internal null layer (its carrier), which Movie places every frame (core/follow.ts). */
  readonly follows: Array<{ carrier: NullSequence; follower: Sequence; target: string }> = [];
  /** Every layer of this composition as built (cameras, lights, nulls and the follow carriers included). */
  get childLayers(): readonly Sequence[] { return this._children; }
  /** Set when this composition's own time is remapped: the children live on `_inner` in LOCAL time, driven by `_clock`. */
  private _inner: Timeline | null = null;
  private _clock: { time: number } | null = null;
  private _remap: TimeRemap | null = null;
  private _childBase = 0;
  private _contentSpan = 0;
  /** `frameRate`: the content steps at this many pictures a second, or null. */
  private _fps: number | null = null;
  /** `loop`: the content repeats its first this-many seconds, or null. */
  private _loop: number | null = null;
  /** The pass that draws the composition as one picture (its alpha, and its blend mode): on only while it changes the picture. */
  private _group: AlphaFilter | null = null;

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
    const parts = r.timeKfs.length ? ['time keyframes'] : r.speed !== undefined || r.start !== undefined ? [`×${r.speed ?? 1}`] : [];
    if (this._fps !== null) parts.push(`${this._fps} fps`);
    if (this._loop !== null) parts.push(`loop ${Number(this._loop.toFixed(3))}s`);
    return parts.join(', ');
  }

  async build(): Promise<void> {
    const width = this.spec.width ?? this.parent?.width ?? this.root.width;
    const height = this.spec.height ?? this.parent?.height ?? this.root.height;
    if (this.duration === undefined) {
      this.duration = this.spec.duration ?? this.parent?.duration ?? this.root.duration;
    }
    const wrapper = new Container();
    const clip = this.spec.clip === true;
    // Culled by its rectangle only when it is clipped to it: an unclipped composition draws its children wherever they are, so each child is culled on its own
    wrapper.cullable = clip;
    wrapper.cullableChildren = true;
    if (clip) wrapper.cullArea = new Rectangle(0, 0, width, height);

    const inner = new Container();
    inner.cullable = true;
    inner.cullableChildren = true;
    wrapper.addChild(inner);
    if (clip) {
      // `clip: true` (CSS overflow: hidden): a stencil of the rectangle on the content; the layer's own `mask` stays free for the wrapper
      const frame = new Graphics().rect(0, 0, width, height).fill(0xffffff);
      wrapper.addChild(frame);
      inner.mask = frame;
    }
    const blended = isBlended(this.spec.blendMode);
    // A composition whose layers blend with what is behind it (a screen glow over the scene, a backdropBlur) is not isolated: drawn as one picture,
    // they would blend with nothing, and the look would jump when a fade starts. Its alpha goes to each layer (After Effects' collapse, CSS without isolation).
    const through = !blended && reachesBackdrop(this.spec.layers);
    this._group = through ? null : groupPicture(wrapper, blended, () => this.filters.length);

    this.target = wrapper;
    this.intrinsicWidth = width;
    this.intrinsicHeight = height;
    this._innerContainer = inner;
    // A remapped composition's children live in LOCAL time, which can run past the composition's own duration (speed 2 reads twice as far).
    const base = timeRemapOf(this.spec as never);
    const span = base ? contentLength(base, this.duration) : this.duration;
    this._contentSpan = span;
    // `frameRate` (the content steps) and `loop` (the content repeats) run the children on a clock of their own, as `speed` / `time` do
    this._fps = this._frameRateOf();
    this._loop = this._loopOf(span);
    const own = base ? remapOf(this.spec as never, 'time', span) : null;
    this._remap = own ?? (this._fps !== null || this._loop !== null
      ? { timeKfs: [], restKfs: this.spec.keyframes, restInitial: this.spec.initial as Record<string, unknown> | undefined, start: undefined, speed: undefined }
      : null);
    // the number params of a component (and those of the components around it) are words in the expressions of everything inside
    const params = (this.spec as { params?: Record<string, unknown> }).params;
    const inherited = (this.parent ?? this.root).vars;
    const numbers = numberParams(params);
    const vars = Object.keys(numbers).length ? { ...(inherited ?? {}), ...numbers } : inherited;
    this._compositionShape = { width, height, duration: span, ...(vars ? { vars } : {}), spaceAt: (t) => this._spaceAt(t), findLayer: (name) => this._children.find(c => c.spec.name === name) ?? null, layerNames: () => this._children.map(c => c.spec.name).filter((n): n is string => !!n) };

    const lateKeyframes: string[] = [];
    for (const s of this.spec.layers ?? []) {
      lintSequence(s);
      lintFocus(s, this.spec.layers ?? []);
      for (const message of matteProblems(s, this.spec.layers ?? [], span)) console.warn(`pixi-effects: ${describeLayer(s)}: ${message}`);
      lintTiming(s, span, (message, kind) => (kind === 'late-keyframe' ? lateKeyframes.push(message) : console.warn(message)));
      lintText(s);
      lintKeys(s);
    }
    for (const message of summarizeWarnings(lateKeyframes)) console.warn(message);
    const crowd = maxConcurrentAdvanced((this.spec.layers ?? []) as Array<{ at?: number; duration?: number; blendMode?: unknown; type?: string; layers?: unknown }>, span);
    if (crowd >= MANY_ADVANCED) {
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: ${crowd} layers with an advanced blendMode are on screen at once (counted through the compositions in it; a composition with a mode is one pass, as it blends as one picture); each is a full-frame pass (about 2 ms on WebGL). Put fewer layers in the blend (or draw the glow as one layer), or use add / screen / multiply`);
    }

    this._children = [];
    await buildSequenceTree(
      this.spec.layers ?? [],
      this._compositionShape,
      this.root,
      this._children,
    );
    this._resolveParents();
    await this._resolveFollows(width, height);
    // Named mattes: a layer that another layer names in `mask` is drawn into a texture (once per frame), not on screen
    const matteNames = new Set<string>();
    for (const c of this._children) for (const n of refNames((c.spec as { mask?: unknown }).mask)) matteNames.add(n);
    if (matteNames.size > 0) {
      this._mattes = new MatteSet(inner, width, height);
      for (const name of matteNames) {
        // the first layer of that name, as matteProblems says: if it cannot be a matte (threeD, audio, null) the layer is drawn without one
        const source = this._children.find(c => c.spec.name === name && !(c instanceof CameraSequence));
        if (!source || !source.target || !canBeMatte(source.spec)) continue;       // matteProblems has said why
        const chain: Sequence[] = [];
        for (let p = this._parentOf.get(source); p; p = this._parentOf.get(p)) chain.push(p);
        this._mattes.add(name, source, chain);
      }
    }
    // Lights taken together (no ambient light, shadows half set, too many lights or casters): said once per composition, only when it has a light
    if (this._children.some(c => c instanceof LightSequence)) {
      for (const message of lightSetProblems((this.spec.layers ?? []) as LayerSpec[])) console.warn(`pixi-effects: ${describeLayer(this.spec)}: ${message}`);
    }
    // A camera's `focus: "title"` becomes that layer's first z, here, where the siblings exist (a camera sees only its parent's shape)
    const layerNames = new Set(this._children.map(c => c.spec.name).filter((n): n is string => !!n));
    for (const cam of this._children) {
      if (!(cam instanceof CameraSequence)) continue;
      cam.resolveFocusNames(name => {
        const hit = this._children.find(c => c.spec.name === name && c.spec.threeD);
        return hit ? layerInitialZ(hit.spec, hit.scope() as unknown as Record<string, number>) : undefined;
      }, layerNames);
    }
    // What is said about blend modes is collected per build: the same mistake in 300 particle layers is one warning ("and 299 more")
    const blendSaid = new Map<string, { spec: { name?: string; type: string }; n: number }>();
    const report: BlendReport = (message, spec) => {
      const seen = blendSaid.get(message);
      if (seen) seen.n++; else blendSaid.set(message, { spec, n: 1 });
    };
    for (const child of this._children) {
      // Cameras are display-less: they only feed the projection pass.
      if (child instanceof CameraSequence) {
        this._cameras.push(child);
        continue;
      }
      if (child instanceof LightSequence) { this._lights.push(child); continue; }     // a light has no picture: it feeds the lit layers' shading
      if (!child.target) continue;
      if (this._mattes?.isSource(child)) continue;                   // a matte is drawn into its texture, not on screen
      const holder = this._parentOf.get(child);
      const into = holder?.target ?? inner;       // a layer with `parent` is drawn inside its null layer

      const maskSrc = maskSourceOf((child.spec as { mask?: unknown }).mask);

      // threeD layers never enter the scene graph themselves: their display
      // object is rendered into a texture and a perspective mesh stands in.
      if (child.spec.threeD) {
        const layer = new Layer3D(child, frameOf(child));
        inner.addChild(layer.display);
        this._layers3d.push(layer);
        this._visual.push({ seq: child, layer });
        const added3d = applyBlendMode(child.spec, layer.display, report);
        if (added3d) this._blendOwned.push(added3d);
        if (maskSrc.kind !== 'none') {
          console.warn(`pixi-effects: ${describeLayer(child.spec)}: mask is not supported on threeD layers yet; ignored`);
        }
        continue;
      }

      into.addChild(child.target);
      if (holder) this._nested.push(child);
      else this._visual.push({ seq: child, layer: null });

      // The matte filters of this layer: one for each reference, or one for an inline mask that is read by its alpha (an inverted mask, a text,
      // image or video mask: a stencil would be the bounding box). They end the layer's filter chain, after its own filters and before the blend.
      const matteFilters: Array<{ destroy(): void }> = [];
      if (maskSrc.kind === 'refs' && this._mattes) {
        for (const ref of maskSrc.refs) {
          const f = this._mattes.filterFor(ref.layer, { channel: ref.channel, invert: ref.invert });
          if (f) matteFilters.push(f);
        }
      }
      if (maskSrc.kind === 'inline') {
        const maskSpec = maskSrc.spec as unknown as LayerSpec;
        // The mask lives and animates with the layer it masks: with no `at` of its own its `at` and `duration` are the layer's, so its keyframes
        // are measured from the layer's start too. An explicit `at` is composition time, exactly like a layer's.
        const lifetime = maskSpec.at === undefined ? { at: child.at, duration: maskSpec.duration ?? child.duration } : {};
        const built = await buildSequenceTree([{ ...maskSpec, ...lifetime } as LayerSpec], this._compositionShape, this.root);
        const maskSeq = built[0];
        if (maskSeq?.target) {
          child.maskSequence = maskSeq;                       // bound to the timeline, synced and destroyed with the layer
          if (usesMatteRoute(child.spec)) {
            if (!this._mattes) this._mattes = new MatteSet(inner, width, height);
            const key = `\u0000inline-${this._inlineMattes++}`;
            const chain: Sequence[] = [];                      // the mask is in the layer's space: the null layers it sits in move it too
            for (let p = this._parentOf.get(child); p; p = this._parentOf.get(p)) chain.push(p);
            this._mattes.add(key, maskSeq, chain);            // drawn into a texture of its own each frame, not on screen
            const f = this._mattes.filterFor(key, { channel: maskSrc.channel, invert: maskSrc.invert });
            if (f) matteFilters.push(f);
          } else {
            // a plain shape mask is a stencil: the mask's geometry (cheap, and the canvas anti-aliasing makes its edge). A composition as a stencil
            // mask has no group pass: a filter inside a stencil mask writes its whole box into the stencil
            if (maskSeq instanceof CompositionSequence) maskSeq.releaseGroup();
            into.addChild(maskSeq.target);
            const t = child.target as Container & { setMask?: (opts: { mask: Container | null; inverse?: boolean }) => void; mask: Container | null };
            if (typeof t.setMask === 'function') t.setMask({ mask: maskSeq.target, inverse: false });
            else t.mask = maskSeq.target;
          }
        }
      }
      if (matteFilters.length > 0) {
        const t = child.target as unknown as { filters: unknown };
        t.filters = [...(Array.isArray(t.filters) ? t.filters : []), ...matteFilters];
        this._blendOwned.push(...matteFilters);
      }
      const added = applyBlendMode(child.spec, child.target, report);
      if (added) this._blendOwned.push(added);
    }

    if (this._mattes && this._mattes.size > MANY_MATTES) {
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: ${this._mattes.size} mattes: each is a ${width}×${height} texture (about ${Math.round(width * height * 4 / 1048576)} MiB, more with anti-aliasing). Share one matte between layers, or use fewer`);
    }

    for (const [message, seen] of blendSaid) {
      console.warn(`pixi-effects: ${describeLayer(seen.spec)}: ${message}${seen.n > 1 ? ` (and ${seen.n - 1} more layers have the same mistake)` : ''}`);
    }

    if (this._layers3d.length > 0) {
      // Stack order becomes explicit zIndex so threeD layers can be re-sorted
      // by depth each frame without reparenting.
      inner.sortableChildren = true;
      this._visual.forEach((v, i) => {
        (v.layer?.display ?? v.seq.target!).zIndex = i;
      });
    } else if (this._cameras.length > 0 && !this._children.some(c => (c.spec as { followCamera?: boolean }).followCamera)) {
      console.warn('pixi-effects: camera has no effect: this composition has no threeD layers (a scene3d layer with followCamera: true follows it)');
    }
    if (this._layers3d.length === 0 && this._lights.length > 0 && !this._children.some(c => (c.spec as { followLights?: boolean }).followLights)) {
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: a light has no effect: this composition has no threeD layers (a light lights only the threeD layers of its own composition, not those of the compositions nested in it: put the light inside the composition that holds them)`);
    }

    this.buildFilters();
    // the group pass ends the composition's own filters (CSS: opacity after filter); the parent adds a matte and a blend after it. A blended
    // composition always has it; any other gets it only while its alpha is between 0 and 1 (no texture, no batch break at alpha 1)
    if (this._group && blended) wrapper.filters = [...this.filters, this._group];
  }

  protected override displayProps(): { initial: CompositionLayerSpec['initial']; keyframes: CompositionLayerSpec['keyframes'] } {
    const r = this._remap;
    return r ? { initial: r.restInitial as CompositionLayerSpec['initial'], keyframes: r.restKfs } : super.displayProps();
  }

  override bindTimeline(timeline: Timeline, offset = 0): void {
    super.bindTimeline(timeline, offset);
    const remap = this._remap;
    // Children's `at` is relative to this composition's start, so push them forward by our absolute start time on the global
    // timeline. A remapped composition builds them in LOCAL time (offset 0) on a timeline of its own, which the clock drives.
    const childOffset = remap ? 0 : offset + this.at;
    this._childBase = childOffset;
    const target = remap ? createTimeline({ paused: true, defaults: { ease: 'none' } }) : timeline;
    for (const child of this._children) {
      // Each layer builds its tweens in a small timeline of its own, which is added to the parent once, finished: the parent holds
      // one child per layer, and a layer nobody else writes is not visited again while its local time stands still. Positions stay
      // absolute, so the picture at any time is the same.
      const own = createTimeline({ defaults: { ease: 'none' } });
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
    const L = this._loop;
    const clock = {
      get time(): number { return cur; },
      set time(raw: number) {
        const v = L !== null ? loopTime(raw, L) : raw;      // a looping composition reads its first L seconds again and again
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
    const start = offset + this.at, end = start + this.duration!;
    const fps = this._fps;
    const plain = remap.timeKfs.length === 0 && remap.speed === undefined && remap.start === undefined;
    // the clock as a function of the movie's time (sampled every millisecond): built only where it is read
    const table = !plain ? clockTable(remap, 'time', this.duration!, start, scope, end) : null;
    if (fps === null) bindClock(timeline, clock, 'time', remap, this.duration!, start, scope);
    else {
      // `frameRate`: the screen's time inside the composition is held on steps of 1 / fps, then read through the clock (speed, time keyframes)
      let elapsed = 0;
      const steps = {
        get elapsed(): number { return elapsed; },
        set elapsed(e: number) { elapsed = e; const q = Math.floor(e * fps + 1e-6) / fps; clock.time = table ? table.at(start + q) : q; },
      };
      steps.elapsed = 0;
      timeline.fromTo(steps, { elapsed: 0 }, { elapsed: this.duration!, duration: this.duration!, ease: 'none' }, start);
    }
    if (table && (remap.timeKfs.length || remap.speed !== undefined)) this._warnUnreachable(table, start, end);
    if (L !== null) {
      for (const child of this._children) {
        if (child.at >= L && child.at < this._contentSpan) console.warn(`pixi-effects: ${describeLayer(child.spec)} starts at ${child.at}s of ${describeLayer(this.spec)}'s own time, but it loops its first ${Number(L.toFixed(3))}s, so it is never visible`);
      }
    }
  }

  /** `frameRate` of this composition, checked: a number of frames a second above 0 and below the movie's, or null. */
  private _frameRateOf(): number | null {
    const v = (this.spec as { frameRate?: unknown }).frameRate;
    if (v === undefined) return null;
    const who = describeLayer(this.spec);
    if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) { console.warn(`pixi-effects: ${who}: frameRate must be a number of frames a second above 0, got ${JSON.stringify(v)}; ignored`); return null; }
    const movie = this.root.frameRate;
    if (movie !== undefined && v >= movie) { console.warn(`pixi-effects: ${who}: frameRate ${v} is not below the movie's ${movie} frames a second: it changes nothing; ignored`); return null; }
    return v;
  }

  /** `loop` of this composition as a length in seconds of its own time, checked, or null. */
  private _loopOf(span: number): number | null {
    const v = (this.spec as { loop?: unknown }).loop;
    if (v === undefined || v === false) return null;
    const who = describeLayer(this.spec);
    if (typeof v === 'number') { console.warn(`pixi-effects: ${who}: loop: ${v} is now loop: { duration: ${v} } (to repeat the first ${v} s; a number alone reads as a count); ignored`); return null; }
    const d = v && typeof v === 'object' ? (v as { duration?: unknown }).duration : undefined;
    if (v !== true && !(typeof d === 'number' && Number.isFinite(d) && d > 0)) { console.warn(`pixi-effects: ${who}: loop must be true or { duration: seconds } (seconds above 0), got ${JSON.stringify(v)}; ignored`); return null; }
    if (typeof d === 'number') {
      if (d >= span) { console.warn(`pixi-effects: ${who}: loop: { duration: ${d} } is not shorter than the composition (${Number(span.toFixed(3))}s), so nothing repeats; ignored`); return null; }
      return d;
    }
    const L = contentEnd(this.spec.layers ?? [], span);
    if (L !== null && L <= 1e-9) { console.warn(`pixi-effects: ${who}: loop: nothing inside has a length (no duration, no keyframes), so it cannot tell what to repeat; give the length: loop: { duration: 2 }`); return null; }
    if (L === null || L >= span - 1e-9) { console.warn(`pixi-effects: ${who}: loop: what happens inside lasts the whole composition (${Number(span.toFixed(3))}s), so nothing repeats; give the length to repeat: loop: { duration: 2 }`); return null; }
    return L;
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
  layers(): Array<{ seq: Sequence; display: Container; threeD: boolean; carriers: NullSequence[]; depthBlur: number; light?: number; quad: number[] | null }> {
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
          quad: layer && layer.display.visible ? layer.corners : null,
          // how lit it is (threeD layers that receive the lights of the last frame only); computed here, not per frame
          light: layer && this._lighting && layer.world && layer.spec.lit !== false ? lightLevel(layer.world, this._lighting.cam, this._lighting.states) : undefined,
        };
      });
  }

  /**
   * `follow`: each follower gets a carrier, an internal null layer put in the follower's place in the stack (inside the follower's own `parent`, if any), and is drawn
   * inside it as a parented layer is; Movie moves the carrier every frame. What cannot follow is said and drawn where its own x / y put it.
   */
  private async _resolveFollows(width: number, height: number): Promise<void> {
    for (const child of [...this._children]) {
      const want = (child.spec as { follow?: unknown }).follow;
      if (want === undefined) continue;
      const who = describeLayer(child.spec);
      if (typeof want !== 'string' || want.trim() === '') { console.warn(`pixi-effects: ${who}: follow must be a layer name or "layer/object" (a string), got ${JSON.stringify(want)}; ignored`); continue; }
      if (child instanceof CameraSequence || child instanceof LightSequence || !child.target) { console.warn(`pixi-effects: ${who}: a ${child.spec.type} layer cannot follow (it has no picture to carry); follow "${want}" ignored`); continue; }
      if (child.spec.threeD) { console.warn(`pixi-effects: ${who}: follow "${want}": a threeD layer cannot follow (the camera projects it after the layers are placed); put a flat layer next to the object instead`); continue; }
      const init = (child.spec.initial ?? {}) as { x?: unknown; y?: unknown };
      const far = (typeof init.x === 'number' && Math.abs(init.x) > width) || (typeof init.y === 'number' && Math.abs(init.y) > height);
      if (far) console.warn(`pixi-effects: ${who}: follow "${want}": x / y are measured from the followed point, so x ${init.x ?? 0}, y ${init.y ?? 0} puts the layer that far away from it; leave x / y out (or small: 20, -14) to sit next to it`);
      const carrier = new NullSequence({ type: 'null', at: 0, duration: this._contentSpan } as LayerSpec, this._compositionShape, this.root);
      await carrier.build();
      this._children.splice(this._children.indexOf(child), 0, carrier);
      const holder = this._parentOf.get(child);
      if (holder) this._parentOf.set(carrier, holder);
      this._parentOf.set(child, carrier);
      this.follows.push({ carrier, follower: child, target: want });
    }
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
      if (child instanceof LightSequence) { console.warn(`pixi-effects: ${who}: a light cannot have a parent (parent "${want}" ignored: move the light with its own x / y / z keyframes)`); continue; }
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

  /** A component's number params are words in its own expressions too (its `initial`, its keyframes), not only in its layers'. */
  override scope(): ReturnType<Sequence['scope']> {
    const base = super.scope();
    const numbers = numberParams((this.spec as { params?: Record<string, unknown> }).params);
    return Object.keys(numbers).length ? { ...numbers, ...base } : base;
  }

  /** Draw this composition as its layers, not as one picture (it is a stencil mask): its alpha goes back to the container. */
  releaseGroup(): void {
    const group = this._group, display = this.target;
    if (!group || !display) return;
    const alpha = display.alpha;
    delete (display as unknown as { alpha?: number }).alpha;          // the accessor of its own: PixiJS's own alpha again
    display.alpha = alpha;
    const list = (display.filters ?? []) as unknown[];
    if (list.includes(group)) { const rest = list.filter(f => f !== group); display.filters = (rest.length ? rest : null) as never; }
    group.destroy();
    this._group = null;
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
    this._mattes?.render(host);                                      // every matte, from the state the timeline just set
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
    this._applyLighting(childT, compEnd, basis, active?.cam ?? null);
    this._applyDepthOfField(cam, basis);

    const order = assignDepthOrder(
      this._visual.map((v, i) => ({ stackIndex: i, threeD: v.layer !== null, depth: v.layer?.depth ?? 0 })),
    );
    this._visual.forEach((v, i) => {
      if (v.layer) v.layer.display.zIndex = order[i]!;
    });
  }

  /** The light layers alive at `t` (their own `at` and `duration`; one that runs to the end of the composition is alive at the last instant too). */
  private _liveLights(t: number, compEnd: number): LightSequence[] {
    return this._lights.filter(l => { const w = l.window(); return t >= w.start && (t < w.end || (w.end >= compEnd && t <= w.end)); });
  }

  /** What a `scene3d` layer that follows the composition asks for: the camera and the lights alive at `t` on this composition's clock (the same pick `updateSpace` makes). */
  private _spaceAt(t: number): SpaceNow {
    const { width, height } = this._compositionShape!;
    const compEnd = this._childBase + (this.duration ?? 0);
    const active = pickActiveCamera(this._cameras.map(cam => ({ cam, ...cam.window() })), t, compEnd);
    return { camera: active ? active.cam.state() : homeCamera(width, height), lights: this._liveLights(t, compEnd).map(l => l.state()), fog: active?.cam.fogState() ?? null };
  }

  /**
   * Lights and fog: when the composition has a light layer or the camera writes fog, every threeD layer draws with the lit shader, fed with
   * the lights alive NOW (a pure function of the lights, the camera and the layers; nothing is remembered between frames). With neither,
   * nothing is made and nothing is drawn differently. With no light alive at this moment (all outside their `at` / `duration`) a layer is
   * drawn unlit, as it is in a composition with no light.
   */
  private _applyLighting(t: number, compEnd: number, basis: CameraBasis, cam: CameraSequence | null): void {
    const fog = cam?.fogState() ?? null;
    // decided on what the composition HAS, not on this frame's camera: once a layer has the lit shader, every later frame must write its uniforms
    // (a fog camera that is over, or a cut to a camera without fog, would leave the last frame's fog on the layers)
    if (this._lights.length === 0 && !this._cameras.some(c => c.fog)) return;
    const states = this._liveLights(t, compEnd).map(l => l.state());
    const packed = states.length > 0 ? packLights(states) : null;
    this._lighting = states.length > 0 ? { states, cam: { x: basis.cx, y: basis.cy, z: basis.cz } } : null;
    // A shadow needs a light that makes shadows AND layers that cast them: the casters are the visible layers with `castsShadows`, drawn this frame
    // (a layer that is hidden, outside its life or behind the camera has no up-to-date picture and casts nothing)
    const shadowing = states.some(s => s.castsShadows);
    const casters = shadowing ? this._layers3d.filter(l => l.spec.castsShadows && l.display.visible && l.world && l.source) : [];
    const camInfo = { x: basis.cx, y: basis.cy, z: basis.cz, fx: basis.fx, fy: basis.fy, fz: basis.fz };
    for (const l of this._layers3d) {
      const mat = l.setLit(true);
      if (!mat || !l.world) continue;
      const lit = l.spec.lit !== false;
      // a layer never shadows itself; each receiver reads at most MAX_CASTERS casters (the first ones, in layer order: said at build)
      const mine: CasterInput[] = lit ? casters.filter(c => c !== l).slice(0, MAX_CASTERS).map(c => ({ frame: c.world!, source: c.source! })) : [];
      mat.update(l.world, camInfo, lit ? packed : null, fog, mine);
    }
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
      // a hidden layer (lifespan over, alpha 0, behind the camera) keeps the depth of the last frame it was drawn: it is not blurred or counted
      l.setBlur(l.display.visible ? blurRadius(aperture, basis.focal, l.depth, focusDepth) : 0);
      if (l.blur > 0) blurred++;
    }
    if (blurred >= MANY_BLURRED && !this._dofSaid.many) {
      this._dofSaid.many = true;
      console.warn(`pixi-effects: ${describeLayer(this.spec)}: ${blurred} layers are blurred by depth of field at once (it warns from ${MANY_BLURRED}); each costs a filter pass per frame (WebGPU more). Merge the far layers or lower aperture`);
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
    if (inner.length === 0) return;                                       // no sound inside: no clock table to build
    const lo = baseTime + this.at, hi = lo + this.duration!;
    const table = clockTable(remap, 'time', this.duration!, lo, this.scope() as unknown as Record<string, number>, hi);
    const L = this._loop;
    const local = (t: number) => (L !== null ? loopTime(table.at(t), L) : table.at(t));   // a looping composition plays its sounds again each time round; frameRate does not step sound
    for (const d of inner) {
      const prev = d.warp;
      out.push({ ...d, warp: (t: number) => (t < lo || t > hi ? NaN : prev ? prev(local(t)) : local(t)) });
    }
  }

  override destroy(): void {
    this._inner?.kill();
    this._inner = null;
    this._clock = null;
    // every shader goes first: a caster's texture is bound in the shaders of the layers that read its shadow, and destroying it while they still hold it warns
    for (const l of this._layers3d) l.setLit(false);
    for (const l of this._layers3d) l.destroy();
    this._layers3d = [];
    this._mattes?.destroy();
    this._mattes = null;
    for (const c of this._children) c.destroy();
    for (const o of this._blendOwned) o.destroy();
    this._blendOwned = [];
    this._group?.destroy();
    this._group = null;
    super.destroy();
  }
}

/** A mode that is not the plain one: the composition then blends as one picture, so its group pass stays on. */
function isBlended(mode: unknown): boolean {
  return typeof mode === 'string' && mode !== 'normal' && mode !== 'inherit';
}

/** The display object's own `alpha` setter (PixiJS's Container accessor), found up its prototype chain; null when `alpha` is a plain field. */
function alphaSetter(display: object): ((v: number) => void) | null {
  for (let p = Object.getPrototypeOf(display); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, 'alpha');
    if (d?.set) return (v) => d.set!.call(display, v);
  }
  return null;
}

/** Does any layer here (at any depth of nested compositions) blend with what is behind it: a `blendMode`, or a filter that reads the backdrop? */
function reachesBackdrop(layers: unknown): boolean {
  if (!Array.isArray(layers)) return false;
  return layers.some((q) => {
    const o = q as { blendMode?: unknown; type?: string; layers?: unknown } | null;
    if (!o || typeof o !== 'object') return false;
    return isBlended(o.blendMode) || usesBackdropFilter({ layers: [{ ...o, layers: undefined }] }) || (o.type === 'composition' && reachesBackdrop(o.layers));
  });
}

/**
 * A composition is ONE picture, as a CSS element or an After Effects precomp: its alpha fades what its layers drew together (an overlap shows the
 * top layer alone, never the one below through it), and its blend mode mixes that picture with the backdrop. PixiJS multiplies a container's alpha
 * into each child, so the alpha the timeline writes is kept here and handed to a pass that draws the content first: the container's own alpha
 * stays 1 while it is between 0 and 1. A blended composition always has the pass; any other has it in its filter list only while its alpha is
 * between 0 and 1 (after its own `ownCount()` filters, before what its parent added: a matte), so at alpha 1 it costs nothing.
 * `display.alpha` still reads the value written, so inspect, hover and the checks see the composition's alpha.
 */
function groupPicture(display: Container, blended: boolean, ownCount: () => number): AlphaFilter {
  // the content's resolution and anti-aliasing: a fading composition draws its edges exactly as a solid one does
  const pass = new AlphaFilter({ alpha: 1, resolution: 'inherit', antialias: 'inherit' });
  const own = alphaSetter(display);
  let alpha = display.alpha;
  Object.defineProperty(display, 'alpha', {
    configurable: true,
    get: () => alpha,
    set: (v: number) => {
      alpha = v;
      const between = v > 0 && v < 1;
      own?.(between ? 1 : v);
      pass.alpha = between ? v : 1;
      if (blended) return;
      const list = (display.filters ?? []) as unknown[];
      const has = list.includes(pass);
      if (between && !has) { const next = [...list]; next.splice(Math.min(ownCount(), next.length), 0, pass); display.filters = next as never; }
      else if (!between && has) { const rest = list.filter(f => f !== pass); display.filters = (rest.length ? rest : null) as never; }
    },
  });
  return pass;
}

/** Layer-space rectangle a threeD child projects: a composition's frame, otherwise its content bounds. */
function frameOf(child: Sequence): () => { x: number; y: number; width: number; height: number } {
  if (child instanceof CompositionSequence) {
    return () => ({ x: 0, y: 0, width: child.intrinsicWidth, height: child.intrinsicHeight });
  }
  return () => child.target!.getLocalBounds();
}

/** The time inside a composition that loops its first `L` seconds. */
function loopTime(t: number, L: number): number {
  return ((t % L) + L) % L;
}

/**
 * When what happens inside ends, in the composition's own seconds: the latest end of its layers (`at + duration` when a layer has a duration,
 * otherwise the end of its last keyframe, a nested composition's own content when it has neither). Null when it cannot be known (a keyframe
 * measured from the end, a duration that is not a number): the content then lasts the whole composition.
 */
function contentEnd(layers: readonly LayerSpec[], span: number): number | null {
  let end = 0;
  for (const l of layers) {
    const at = layerAt(l);
    if (typeof l.duration === 'number') { end = Math.max(end, at + l.duration); continue; }
    let last = at;
    for (const kf of l.keyframes ?? []) {
      const kAt = kf.at ?? 0;
      const raw = (kf as { duration?: unknown }).duration;
      if (typeof kAt !== 'number' || kAt < 0 || (raw !== undefined && raw !== 'auto' && typeof raw !== 'number')) return null;
      const d = kfDuration(kf as { duration?: number | 'auto'; ease?: string });                 // a spring's 'auto' is the time it takes to settle
      const repeat = Math.max(0, (kf as { repeat?: number }).repeat ?? 0), gap = (kf as { repeatDelay?: number }).repeatDelay ?? 0;
      last = Math.max(last, at + kAt + d * (repeat + 1) + gap * repeat);
    }
    if (l.type === 'composition') {
      const inner = contentEnd((l as { layers?: LayerSpec[] }).layers ?? [], span);
      if (inner === null) return null;
      last = Math.max(last, at + inner);
    }
    end = Math.max(end, last);
  }
  return Math.min(end, span);
}

/** The params that are numbers (a number, or a number written as text: a `{variable}` put in a param leaves its value as text). */
function numberParams(params: Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'string' && /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i.test(v)) out[k] = Number(v);
  }
  return out;
}
