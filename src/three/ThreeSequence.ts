import { Sprite, Texture, TextureSource } from 'pixi.js';
import { Box3, PerspectiveCamera, Plane, Quaternion, Raycaster, RenderTarget, Scene, Vector2, Vector3, WebGLRenderer, type Camera, type Object3D } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { Sequence } from '../sequences/Base';
import { buildScope } from '../expr/Scope';
import { evaluateExpr } from '../expr/Parser';
import type { PathRouters } from '../core/Timeline';
import type { PropValue } from '../types';
import type { ThreeContext, ThreeSequenceSpec } from './types';
import { checkRendererKind, getPageRenderer } from './defaults';
import { applyCameraState, FogMirror, LightMirror } from './spaceBridge';
import { releaseThree, trackThree } from './budget';
import type { CanvasCheck } from '../sequences/Canvas';
import type { SharedGpu } from '../core/gpuShare';
import type { Rebindable, ThreeLayerHost } from './layerTexture';

/** What makes a frame depend on more than the time (the same list as the canvas layer's). */
const NOT_PURE = /\bMath\s*\.\s*random\s*\(|\bDate\s*\.\s*now\s*\(|\bperformance\s*\.\s*now\s*\(|\bnew\s+Date\s*\(/;

export class ThreeSequence extends Sequence {
  private _renderer: WebGLRenderer | WebGPURenderer | null = null;
  /** The renderer this layer draws with (`'webgl'` or `'webgpu'`), once it is built. */
  renderer: 'webgl' | 'webgpu' | null = null;
  /** The backend under it: `'webgl'`, `'webgpu'`, or `'webgl2'` when three's WebGPURenderer found no WebGPU in this browser and used its own WebGL2 backend (the same picture). */
  backend: 'webgl' | 'webgpu' | 'webgl2' | null = null;
  private _gpu = false;                       // renderer: 'webgpu': async init and async render
  /** True when the layer draws on PixiJS's own GPU device into a texture PixiJS samples directly (no canvas of its own, no copy, no share of the page's context cap). */
  sharedGpu = false;
  private _rt: RenderTarget | null = null;     // the texture a shared layer draws into
  private _sharedTexture: Texture | null = null;
  private _texture: Texture | null = null;       // what the layer's sprite shows (the canvas's, or the shared render target's)
  /** What a rebuilt layer is compared with to take this one's place (core/reuse.ts); null: this layer is never kept (`reuse: false`, no `name`). */
  private _key: string | null = null;
  /** The layer of the tree being replaced whose state this one is using until the new tree is on stage (`commitReuse`): not this layer's to let go. */
  private _borrowed: ThreeSequence | null = null;
  /** True once another layer owns this layer's state: destroying this one must not let it go. */
  private _donated = false;
  /** Things to do just before every draw (the 2D layers shown on meshes: `threeLayerTexture`), and those layers' handles. Both go with the state to a layer that takes it over. */
  private _drawHooks = new Set<() => void>();
  private _layerTextures: Rebindable[] = [];
  private _scene: Scene | null = null;
  private _camera: Camera | null = null;
  private _ctx: ThreeContext | null = null;
  private _objects: Record<string, object> = {};
  private _warnedUpdate = false;
  private _warnedNodeFrame = false;
  private _warnedPaths = new Set<string>();
  private _lightMirror: LightMirror | null = null;
  private _fogMirror: FogMirror | null = null;
  private _warnedSpace = new Set<string>();
  private _tracked = false;
  /** Set when this layer lets its renderer go on purpose: the context loss that follows is its own doing, not the browser's. */
  private _closing = false;

  private get _threeSpec(): ThreeSequenceSpec {
    return this.spec as unknown as ThreeSequenceSpec;
  }

  protected override pathRouters(): PathRouters {
    return { three: (path) => this._resolveThreePath(path) };
  }

  async build(): Promise<void> {
    const spec = this._threeSpec;
    if (this.duration === undefined) {
      this.duration = this.parent?.duration ?? this.root.duration;
    }
    if (typeof spec.update === 'function' && NOT_PURE.test(spec.update.toString())) {
      console.warn(`pixi-effects: three layer${spec.name ? ` "${spec.name}"` : ''}: update calls Math.random, Date.now, performance.now or new Date, so it is not deterministic: the same frame would draw differently in playback, in a seek and in an export. Derive the value from t`);
    }

    // Resolve layer size. Expressions see the usual scope; intrinsic w/h are
    // still 0 here (same chicken-and-egg as shapes), so W/H/GW/GH carry it.
    const scope = buildScope(this, this.parent, this.root) as unknown as Record<string, number>;
    const width = resolveDim(spec.width, scope) ?? this.parent?.width ?? this.root.width;
    const height = resolveDim(spec.height, scope) ?? this.parent?.height ?? this.root.height;
    const resolution = spec.resolution ?? 1;

    const antialias = spec.antialias ?? true;
    const kind = spec.renderer ?? getPageRenderer();
    checkRendererKind(kind, "a three layer's renderer");
    this._gpu = kind === 'webgpu';
    this.renderer = kind;

    // A rebuild (setVars, resize) builds this layer while the old one still plays: when it cannot be told apart from one of the old tree it takes over that one's scene and renderer (setup does not run again).
    this._key = spec.reuse === false || !spec.name ? null
      : JSON.stringify([spec.name, idOf(spec.setup), width, height, resolution, antialias, kind, spec.shareGpu !== false && !!this.root.gpu, !!spec.followCamera, !!spec.followLights, !!spec.followFog]);
    const donor = this._key !== null ? (this.root.reuse?.claim(this._key) as ThreeSequence | null | undefined) : null;
    if (donor && donor._lendable()) { this._borrow(donor, width, height, spec.name); return; }

    // Offscreen canvas — never attached to the DOM. document.createElement
    // (not OffscreenCanvas) so PIXI's Texture.from and three both accept it.
    const canvas = document.createElement('canvas');
    let renderer: WebGLRenderer | WebGPURenderer;
    if (this._gpu) {
      let mod: typeof import('three/webgpu');
      try { mod = await import('three/webgpu'); } catch (err) {
        throw new Error(`pixi-effects: renderer: 'webgpu' needs three 0.17x or later with "three/webgpu" in the import map (${err instanceof Error ? err.message : err})`);
      }
      // On PixiJS's own GPU device when there is one (a WebGPU movie): the layer draws into a texture PixiJS samples, with no canvas of its own. Anything that goes wrong there is said once
      // and the layer is made again on a canvas of its own, before its setup has run.
      let shared = spec.shareGpu === false ? undefined : this.root.gpu;
      for (;;) {
        renderer = new mod.WebGPURenderer(shared ? { device: shared.device as never, alpha: true, antialias } : { canvas, alpha: true, antialias });
        this._renderer = renderer;
        if (!shared) this._track();
        // The device is made here: nothing may render before. Where there is no WebGPU three uses its own WebGL2 backend and says so with a warning: that is not a problem
        // (it draws the same picture), so it becomes `backend: 'webgl2'` instead of a line in the author's console.
        const warn = console.warn;
        let noGpu = false;
        console.warn = (...args: unknown[]) => { if (/WebGPU is not available/.test(String(args[0]))) noGpu = true; else warn.apply(console, args as []); };
        try {
          await renderer.init();
          if (shared) { renderer.setSize(Math.round(width * resolution), Math.round(height * resolution), false); renderer.setClearColor(0x000000, 0); this._prepareShared(renderer, shared, width, height, resolution, antialias); }
          this.backend = noGpu ? 'webgl2' : 'webgpu';
          break;
        } catch (err) {
          this._disposeRenderer();
          if (!shared) throw err;
          console.warn(`pixi-effects: three layer${spec.name ? ` "${spec.name}"` : ''}: could not draw on PixiJS's GPU device (${err instanceof Error ? err.message : err}); it uses a canvas of its own (shareGpu: false does this on purpose)`);
          shared = undefined;
          this._closing = false;
        } finally { console.warn = warn; }
      }
    } else {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias });
      this._renderer = renderer;
      this._track();
      let said = false;
      canvas.addEventListener('webglcontextlost', () => {              // the browser took the context away: the layer draws nothing from now on
        if (said || this._closing) return;                              // not the browser's doing: this layer is letting its context go
        said = true;
        console.warn(`pixi-effects: three layer${spec.name ? ` "${spec.name}"` : ''}: the browser took this layer's WebGL context away (a page keeps about 16 for all its layers, PixiJS and shader layers: too many were alive), so the layer draws nothing. Put several objects in one three layer, or destroy layers that are over`);
      });
      this.backend = 'webgl';
    }
    try {
      renderer.setSize(Math.round(width * resolution), Math.round(height * resolution), false);
      renderer.setClearColor(0x000000, 0);

      const scene = new Scene();
      const camera: Camera = new PerspectiveCamera(50, width / height, 0.1, 2000);
      const ctx: ThreeContext = { scene, camera, renderer, width, height, _host: this._makeHost() };
      if (spec.followCamera) this._checkFollowShape(width, height, spec.name);

      let result: Awaited<ReturnType<ThreeSequenceSpec['setup']>>;
      try { result = await spec.setup(ctx); } catch (err) { throw this._gpu ? this._explainWebGpuError(err, spec.name) : err; }
      if (result?.camera) ctx.camera = result.camera;
      this._scene = scene;
      this._camera = ctx.camera;
      this._ctx = ctx;
      this._objects = { ...(result?.objects ?? {}) };
      if (!('camera' in this._objects)) this._objects.camera = this._camera;

      if (this._gpu) this._checkWebGpuMaterials(scene, spec.name);
      // Frame 0 so the texture is never blank before the first tick.
      this._draw(0);

      this._texture = this._sharedTexture ?? Texture.from(canvas);
      this._makeSprite(this._texture, width, height, spec.name);
    } catch (err) {
      this._disposeRenderer();
      throw err;
    }
  }

  private _makeSprite(texture: Texture, width: number, height: number, name: string | undefined): void {
    const sprite = new Sprite({ texture, label: name });
    sprite.cullable = true;
    // Texture is canvas-sized (layer px × resolution); scale back to comp px.
    sprite.width = width;
    sprite.height = height;
    this.target = sprite;
    this.intrinsicWidth = width;
    this.intrinsicHeight = height;
    this.buildFilters();
  }

  /** The 2D layer that a material shows (`threeLayerTexture`), for a click on the mesh to reach it (movie.pick); null for any other material. */
  screenOf(material: unknown): { source: Sequence } | null {
    const handle = this._layerTextures.find((h) => h.material === material);
    return handle ? { source: handle.source() } : null;
  }

  /** What `threeLayerTexture` asks of this layer: the layers listed before it, PixiJS's renderer, whether the GPU device is shared, and a place to hook in before every draw. */
  private _makeHost(): ThreeLayerHost {
    return {
      findLayer: (name) => this.parent?.findLayer?.(name) ?? null,
      layerNames: () => this.parent?.layerNames?.() ?? [],
      pixiRenderer: this.root.pixiRenderer ?? null,
      shared: this.sharedGpu,
      beforeDraw: (fn) => { this._drawHooks.add(fn); return () => { this._drawHooks.delete(fn); }; },
      track: (handle) => { this._layerTextures.push(handle); },
    };
  }

  /** Reuse (core/reuse.ts): the key this layer is matched by, while it can still lend its state. */
  reuseKey(): string | null { return this._renderer && !this._donated && !this._closing ? this._key : null; }
  private _lendable(): boolean { return this.reuseKey() !== null && !!this._scene && !!this._ctx && !!this._texture; }

  /** Take over a layer of the tree being replaced: its scene, renderer, texture and mirrors. Nothing is drawn until the new tree is on stage; the old layer goes on drawing meanwhile. */
  private _borrow(d: ThreeSequence, width: number, height: number, name: string | undefined): void {
    this.renderer = d.renderer; this.backend = d.backend; this._gpu = d._gpu; this.sharedGpu = d.sharedGpu;
    this._renderer = d._renderer; this._scene = d._scene; this._camera = d._camera; this._ctx = d._ctx; this._objects = d._objects;
    this._rt = d._rt; this._sharedTexture = d._sharedTexture; this._texture = d._texture;
    this._lightMirror = d._lightMirror; this._fogMirror = d._fogMirror; this._tracked = d._tracked;
    this._borrowed = d;
    this._drawHooks = d._drawHooks; this._layerTextures = d._layerTextures;
    const host = this._makeHost();
    for (const h of this._layerTextures) h.rebind(host);                       // the 2D layers of the new tree are the ones shown now
    if (this.spec && (this._threeSpec as { followCamera?: boolean }).followCamera) this._checkFollowShape(width, height, name);
    this._makeSprite(this._texture!, width, height, name);
  }

  /** The new tree is on stage: the layer this one borrowed from has given its state away for good. */
  commitReuse(): void {
    const d = this._borrowed;
    if (!d) return;
    d._donated = true; d._tracked = false;
    this._borrowed = null;
  }

  /**
   * Per-frame sync hook. Movie._awaitVideoFrames duck-types on this method
   * (same contract as VideoSequence) and awaits it inside gotoFrame — the
   * single frame path shared by playback and export, which is what makes
   * three layers deterministic in both.
   */
  async awaitFrameAt(local: number): Promise<void> {
    if (!this._renderer || !this._scene || !this._camera || !this._ctx) return;
    const spec = this._threeSpec;
    const t = Math.max(0, Math.min(local, this.duration ?? local));
    this._followSpace(t);
    if (spec.update) {
      try {
        spec.update(t, this._ctx);
      } catch (err) {
        if (!this._warnedUpdate) {
          this._warnedUpdate = true;
          console.warn('pixi-effects: three update() threw (reported once) —', err);
        }
      }
    }
    this._draw(t);
    if (!this.sharedGpu) (this.target as Sprite | null)?.texture.source.update();       // a shared layer's texture is the GPU's own: it is already the new picture
  }

  /**
   * `movie.pick`: a ray through the point (u, v) of the layer's picture (0..1, v down) from the layer's camera, and what it meets first: the object's name (its own, or its nearest
   * ancestor's that has one), where, and how far from the camera. Invisible objects and groups are not met. null when the ray meets nothing.
   */
  pickAt(u: number, v: number): { object: string; point: [number, number, number]; distance: number; object3d: Object3D; uv?: { u: number; v: number }; material?: unknown } | null {
    const scene = this._scene, camera = this._camera;
    if (!scene || !camera) return null;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    const ray = new Raycaster();
    ray.setFromCamera(new Vector2(u * 2 - 1, -(v * 2 - 1)), camera);
    const visibleChain = (o: Object3D | null): boolean => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
    for (const hit of ray.intersectObjects(scene.children, true)) {
      if (!visibleChain(hit.object)) continue;
      let name = '';
      for (let n: Object3D | null = hit.object; n && n !== scene; n = n.parent) if (n.name) { name = n.name; break; }
      const m = (hit.object as unknown as { material?: unknown }).material;
      const material = Array.isArray(m) ? m[hit.face?.materialIndex ?? 0] : m;
      return { object: name, point: hit.point.toArray() as [number, number, number], distance: hit.distance, object3d: hit.object, ...(hit.uv ? { uv: { u: hit.uv.x, v: hit.uv.y } } : {}), material };
    }
    return null;
  }

  /**
   * `hit.three.grab(plane)`: drag a grabbed point of the scene. Returns a function of a point (u, v) of the layer's picture (0..1, v down) that gives where the pointer's ray through the layer's
   * camera meets a plane through the grabbed point, and how far that is from the grabbed point (`delta`): move the object by it and it follows the pointer exactly. `plane`: `'screen'` (facing the
   * camera: the default), `'floor'` (horizontal, the three y up), `'wall'` (z constant), or a normal `[x, y, z]`. null where the ray never meets it (a floor seen edge-on, behind the camera).
   */
  dragPlane(point: [number, number, number], plane: 'screen' | 'floor' | 'wall' | [number, number, number] = 'screen'): (u: number, v: number) => { point: [number, number, number]; delta: [number, number, number] } | null {
    const grabbed = new Vector3(...point);
    let normal: Vector3;
    if (plane === 'floor') normal = new Vector3(0, 1, 0);
    else if (plane === 'wall') normal = new Vector3(0, 0, 1);
    else if (Array.isArray(plane)) normal = new Vector3(...plane).normalize();
    else {
      const turn = new Quaternion();
      this._camera?.updateMatrixWorld();
      this._camera?.getWorldQuaternion(turn);
      normal = new Vector3(0, 0, 1).applyQuaternion(turn);             // the camera looks along -z: its back is the plane's normal
    }
    const surface = new Plane().setFromNormalAndCoplanarPoint(normal, grabbed);
    return (u, v) => {
      const scene = this._scene, camera = this._camera;
      if (!scene || !camera) return null;
      scene.updateMatrixWorld();
      camera.updateMatrixWorld();
      const ray = new Raycaster();
      ray.setFromCamera(new Vector2(u * 2 - 1, -(v * 2 - 1)), camera);
      const at = ray.ray.intersectPlane(surface, new Vector3());
      if (!at) return null;
      return { point: at.toArray() as [number, number, number], delta: at.clone().sub(grabbed).toArray() as [number, number, number] };
    };
  }

  /**
   * The determinism check (`check`, `movie.review()`): the scene drawn at a few moments in two orders, with one draw thrown away first, and the pictures compared, as the canvas layer
   * does. A layer whose same frame is not the same picture (a clock, `Math.random`, a mixer advanced with `update(dt)`, any state that builds up from call to call) is reported.
   * It runs the layer's own `update`, draws with its renderer and reads the picture from the renderer's canvas in the same task; the next real frame draws again, so nothing is left behind.
   */
  checkDeterminism(times: number[]): CanvasCheck {
    const none: CanvasCheck = { differs: [], drawMs: 0, threw: [] };
    const renderer = this._renderer, ctx = this._ctx;
    if (!renderer || !this._scene || !this._camera || !ctx) return none;
    const source = (renderer as unknown as { domElement: HTMLCanvasElement }).domElement;
    const w = source.width, h = source.height;
    const scratch = document.createElement('canvas');
    scratch.width = w; scratch.height = h;
    const g = scratch.getContext('2d', { willReadFrequently: true });
    if (!g) return none;
    const keep = w * h * 4 * times.length <= 96e6;
    const hash = (d: Uint8ClampedArray): number => { let x = 0x811c9dc5; for (let i = 0; i < d.length; i++) { x ^= d[i]!; x = Math.imul(x, 0x01000193); } return x >>> 0; };
    const ms: number[] = [];
    const threw = new Set<number>();
    const once = (t: number, timed: boolean): Uint8ClampedArray => {
      const from = performance.now();
      try {
        this._followSpace(t);
        this._threeSpec.update?.(t, ctx);
        this._draw(t, true);                                           // (a shared layer draws to the renderer's own canvas here: the same scene and update, the picture readable now)
        g.clearRect(0, 0, w, h);
        g.drawImage(source, 0, 0);
      } catch { threw.add(t); }
      if (timed) { g.getImageData(0, 0, 1, 1); ms.push(performance.now() - from); }
      return g.getImageData(0, 0, w, h).data;
    };
    for (const t of times) once(t, false);                         // the warm-up
    const first = times.map(t => { const d = once(t, true); return keep ? d.slice() : hash(d); });
    const second = [...times].reverse().map(t => once(t, false)).reverse();
    scratch.width = scratch.height = 1;
    const differs: CanvasCheck['differs'] = [];
    times.forEach((t, i) => {
      const a = first[i]!, b = second[i]!;
      if (typeof a === 'number') { if (a !== hash(b)) differs.push({ t, pixels: -1, maxDiff: -1 }); return; }
      let pixels = 0, maxDiff = 0;
      for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k]! - b[k]!); if (d) { pixels++; if (d > maxDiff) maxDiff = d; } }
      if (pixels) differs.push({ t, pixels, maxDiff });
    });
    ms.sort((x, y) => x - y);
    return { differs: differs.filter(d => !threw.has(d.t)), drawMs: ms.length ? ms[Math.floor(ms.length / 2)]! : 0, threw: times.filter(t => threw.has(t)) };
  }

  /** `followCamera` / `followLights`: before each frame, ask the composition for its camera and lights at this moment (the layer's time on the composition's clock) and mirror them in the scene. */
  private _followSpace(t: number): void {
    const spec = this._threeSpec;
    if (!spec.followCamera && !spec.followLights && !spec.followFog) return;
    const ctx = this._ctx, scene = this._scene;
    if (!ctx || !scene) return;
    if (!this.parent?.spaceAt) {
      this._saidOnce('parent', `followCamera / followLights / followFog need the layer to sit in a composition that has a camera or a light to follow; this layer's parent cannot say (it keeps its own camera and lights)`, spec.name);
      return;
    }
    const space = this.parent.spaceAt((this.absoluteStart ?? this.at) + t);
    ctx.space = space;
    if (spec.followCamera) {
      const camera = ctx.camera as PerspectiveCamera;
      if (!camera.isPerspectiveCamera) this._saidOnce('camera', `followCamera needs a PerspectiveCamera (this layer's camera is a ${(ctx.camera as { type?: string }).type ?? 'different camera'}); it keeps it as it is`, spec.name);
      else applyCameraState(camera, space.camera, ctx.width / ctx.height);
    }
    if (spec.followLights) {
      const mirror = (this._lightMirror ??= new LightMirror(scene, Math.max(ctx.width, ctx.height) * 2));
      mirror.update(space.lights);
      if (!this._warnedSpace.has('inverseSquare')) this._checkInverseSquare(space.lights, scene, spec.name);
      if (mirror.castsShadows && !ctx.renderer.shadowMap.enabled) ctx.renderer.shadowMap.enabled = true;
    }
    if (spec.followFog) {
      if (space.fog && space.fog.amount !== 1) this._saidOnce('fogAmount', `followFog: the camera's fogAmount is ${space.fog.amount}, and three's Fog has no amount below 1: the layer uses the full amount (set fogColor to the colour you want at the far end, or leave followFog off and make the fog yourself from ctx.space.fog)`, spec.name);
      (this._fogMirror ??= new FogMirror(scene)).update(space.fog);
    }
  }

  /**
   * An inverse-square light is held at full strength inside its `radius` by the composition; three's decay-2 light keeps rising (4x at half the radius, 11x at a third). When the scene has
   * an object closer to such a light than 0.8 of its radius, say so once, with the way out. (The check is the scene's bounding box against the light's place: no object is measured.)
   */
  private _checkInverseSquare(lights: ReadonlyArray<{ kind: string; falloff: string; radius: number; x: number; y: number; z: number }>, scene: Scene, name: string | undefined): void {
    const near = lights.filter((l) => l.falloff === 'inverseSquare' && (l.kind === 'point' || l.kind === 'spot'));
    if (!near.length) return;
    const box = new Box3().setFromObject(scene);
    if (box.isEmpty()) return;
    for (const l of near) {
      const d = box.distanceToPoint(new Vector3(l.x, -l.y, l.z));
      if (d < 0.8 * l.radius) {
        this._saidOnce('inverseSquare', `followLights: a light with falloff 'inverseSquare' and radius ${l.radius} is only ${Math.round(d)} px from the nearest part of the scene. The composition holds such a light at full strength inside its radius; three's inverse-square light keeps rising there (${(Math.pow(l.radius / Math.max(d, 1), 2)).toFixed(1)}x at that distance), so those parts come out much brighter. Make the radius smaller than that distance, or use falloff 'smooth' (it is fitted to the composition's curve)`, name);
        return;
      }
    }
  }

  /** followCamera shows the whole composition through the layer's picture: a layer of another shape would show it squeezed or cut. Said once at build. */
  private _checkFollowShape(width: number, height: number, name: string | undefined): void {
    const p = this.parent;
    if (!p || !(p.width > 0 && p.height > 0)) return;
    if (Math.abs(width * p.height - height * p.width) <= 1e-3 * width * p.height) return;
    this._saidOnce('shape', `followCamera: the layer is ${width} x ${height} but the composition is ${p.width} x ${p.height}; the camera shows the whole composition, so the layer needs its aspect ratio (drop width / height to cover the composition)`, name);
  }

  private _saidOnce(key: string, message: string, name: string | undefined): void {
    if (this._warnedSpace.has(key)) return;
    this._warnedSpace.add(key);
    console.warn(`pixi-effects: three layer${name ? ` "${name}"` : ''}: ${message}`);
  }

  /**
   * One render of the scene at the layer-local time `t`. WebGPURenderer.render() needs `await init()` first (done in build); it queues the GPU work, and PixiJS reads the canvas after.
   *
   * Three's WebGPU node system updates the light uniforms (and its `time`) once per FRAME ID, and bumps that id in its own requestAnimationFrame loop only. Renders that
   * follow each other in one task (a seek, an export) would all show the lights of the last animation frame: a lamp keyframed with `three.lamp.intensity` would not move.
   * So before each render the layer advances the node frame itself, and gives `time` the layer's own time (not three's wall clock).
   */
  private _draw(t: number, toCanvas = false): void {
    if (!this._renderer || !this._scene || !this._camera) return;
    for (const hook of this._drawHooks) hook();                          // the 2D layers shown on meshes are drawn into their textures first
    if (this._gpu) this._advanceNodeFrame(t);
    if (!this._rt || toCanvas) { this._renderer.render(this._scene, this._camera); return; }
    // A shared layer draws into its texture. setOutputRenderTarget (not setRenderTarget) keeps the canvas route's output pass: tone mapping, the sRGB encode, fog and the multisample resolve.
    const r = this._renderer as unknown as { setOutputRenderTarget(rt: RenderTarget | null): void; setRenderTarget(rt: RenderTarget | null): void };
    r.setOutputRenderTarget(this._rt);
    try { this._renderer.render(this._scene, this._camera); } finally { r.setOutputRenderTarget(null); r.setRenderTarget(null); }       // (three leaves the output target set as the render target too)
  }

  /**
   * A shared layer's texture: a render target of the layer's size, drawn into once (the GPU texture exists only after a draw) and adopted by a PixiJS texture source. Throws when something
   * is not as this expects (the build then makes the layer again on a canvas of its own). Done before `setup`, so nothing the author made yet depends on the renderer.
   */
  private _prepareShared(renderer: WebGPURenderer, shared: SharedGpu, width: number, height: number, resolution: number, antialias: boolean): void {
    const w = Math.round(width * resolution), h = Math.round(height * resolution);
    const rt = new RenderTarget(w, h, { depthBuffer: true, samples: antialias ? 4 : 0 });
    this._rt = rt;
    const r = renderer as unknown as { setOutputRenderTarget(rt: RenderTarget | null): void; setRenderTarget(rt: RenderTarget | null): void; backend?: { get?(t: unknown): { texture?: { format?: string; createView?: unknown } } | undefined } };
    if (typeof r.setOutputRenderTarget !== 'function') throw new Error('this three has no setOutputRenderTarget');
    r.setOutputRenderTarget(rt);
    try { renderer.render(new Scene(), new PerspectiveCamera()); } finally { r.setOutputRenderTarget(null); r.setRenderTarget(null); }
    const gpuTexture = r.backend?.get?.(rt.texture)?.texture;
    if (!gpuTexture || typeof gpuTexture.createView !== 'function') throw new Error("three keeps no GPU texture for a render target");
    const source = new TextureSource({ width: w, height: h, format: gpuTexture.format as never, label: 'three layer (shared GPU)' });
    shared.adopt(source, gpuTexture);
    this._sharedTexture = new Texture({ source });
    this.sharedGpu = true;
  }

  /**
   * The author chose renderer: 'webgpu'. Three's WebGPU renderer turns materials into node materials: a ShaderMaterial / RawShaderMaterial cannot run there (three logs an error on
   * every render and draws a default material) and `onBeforeCompile` (a patch of the WebGL shader text) is ignored without a word. Stop, once, naming the first such material and the fix,
   * instead of drawing a picture that is wrong without saying so.
   */
  private _checkWebGpuMaterials(scene: Scene, layerName: string | undefined): void {
    const bad: string[] = [];
    const seen = new Set<unknown>();
    const check = (m: unknown): void => {
      if (!m || typeof m !== 'object' || seen.has(m)) return;
      seen.add(m);
      const mat = m as { type?: string; name?: string; isShaderMaterial?: boolean; isRawShaderMaterial?: boolean };
      const label = `${mat.name ? `"${mat.name}" ` : ''}${mat.type ?? 'material'}`;
      if (mat.isShaderMaterial || mat.isRawShaderMaterial) bad.push(`${label} is a ShaderMaterial (it cannot run on the WebGPU renderer)`);
      else if (Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile')) bad.push(`${label} sets onBeforeCompile (the WebGPU renderer ignores it)`);
    };
    scene.traverse?.((o: unknown) => {
      const mats = (o as { material?: unknown }).material;
      for (const m of Array.isArray(mats) ? mats : [mats]) check(m);
    });
    if (!bad.length) return;
    this._disposeRenderer();
    throw new Error(`pixi-effects: three layer${layerName ? ` "${layerName}"` : ''} with renderer: 'webgpu': ${bad[0]}${bad.length > 1 ? ` (and ${bad.length - 1} more)` : ''}. ` +
      `Add renderer: 'webgl' to this layer (or registerThree({ renderer: 'webgl' }) for the page), or write the look with three's node materials (TSL).`);
  }

  /** The one setup failure everybody meets on the WebGPU renderer: a PMREMGenerator imported from 'three' reads WebGL state the WebGPU renderer does not have. */
  private _explainWebGpuError(err: unknown, layerName: string | undefined): unknown {
    if (err instanceof TypeError && /reading 'buffers'|renderer\.state/.test(err.message)) {
      return new Error(`pixi-effects: three layer${layerName ? ` "${layerName}"` : ''} with renderer: 'webgpu': setup used a WebGL-only helper, most likely a PMREMGenerator imported from 'three'. ` +
        `Import it from 'three/webgpu' (import * as THREE from 'three/webgpu'), or add renderer: 'webgl' to this layer.`, { cause: err });
    }
    return err;
  }

  private _advanceNodeFrame(t: number): void {
    const frame = (this._renderer as unknown as { _nodes?: { nodeFrame?: { update?: () => void; time: number; deltaTime: number } } })._nodes?.nodeFrame;
    if (!frame || typeof frame.update !== 'function') {
      if (!this._warnedNodeFrame) {
        this._warnedNodeFrame = true;
        console.warn("pixi-effects: this three has no node frame to advance (renderer: 'webgpu'): a light animated by keyframes may not follow the time in a seek or an export; use renderer: 'webgl' or report the three version");
      }
      return;
    }
    frame.update();
    frame.time = t;
    frame.deltaTime = 1 / ((this.root as { frameRate?: number }).frameRate ?? 30);
  }

  private _resolveThreePath(path: string): { target: object; prop: string } | null {
    const segs = path.split('.');
    if (segs.length < 2) {
      this._warnPath(path, 'needs at least <object>.<prop>');
      return null;
    }
    let obj: unknown = this._objects[segs[0]!];
    if (obj == null) {
      this._warnPath(path, `unknown object "${segs[0]}" — expose it via setup's { objects }`);
      return null;
    }
    for (let i = 1; i < segs.length - 1; i++) {
      obj = (obj as Record<string, unknown>)[segs[i]!];
      if (obj == null) {
        this._warnPath(path, `"${segs[i]}" is undefined along the path`);
        return null;
      }
    }
    const prop = segs[segs.length - 1]!;
    if (typeof obj !== 'object' || !(prop in (obj as object))) {
      this._warnPath(path, `no property "${prop}"`);
      return null;
    }
    return { target: obj as object, prop };
  }

  private _warnPath(path: string, why: string): void {
    if (this._warnedPaths.has(path)) return;
    this._warnedPaths.add(path);
    console.warn(`pixi-effects: keyframe path three.${path} ${why}; skipped`);
  }

  /** Count this layer's renderer against the page's allowance of graphics contexts (given back when the renderer is disposed). */
  private _track(): void {
    this._tracked = true;
    trackThree(this._gpu ? 'webgpu' : 'webgl');
  }

  private _disposeRenderer(): void {
    if (!this._renderer) return;
    this._closing = true;
    if (this._tracked) { this._tracked = false; releaseThree(this._gpu ? 'webgpu' : 'webgl'); }
    try {
      this._renderer.dispose();
      if (!this._gpu) (this._renderer as WebGLRenderer).forceContextLoss();
    } catch (err) {
      console.warn('pixi-effects: three renderer dispose threw —', err);
    }
    this._renderer = null;
    try { this._rt?.dispose(); } catch { /* the renderer took the texture with it */ }
    this._rt = null;
  }

  override destroy(): void {
    const spec = this._threeSpec;
    // another layer has this layer's state, or has not yet let go of it (a rebuild in progress): the scene, the renderer and the texture are not this layer's to let go
    const kept = this._donated || this._borrowed !== null;
    if (!kept && this._ctx && spec.dispose) {
      try { spec.dispose(this._ctx); } catch (err) {
        console.warn('pixi-effects: three dispose() threw —', err);
      }
    }
    const texture = this._texture;
    if (!kept) {
      for (const h of this._layerTextures) { try { h.dispose(); } catch { /* the 2D layer is gone with its tree */ } }
      this._lightMirror?.dispose();
      this._fogMirror?.dispose();
      this._disposeRenderer();
    }
    this._lightMirror = null;
    this._fogMirror = null;
    this._renderer = null;
    this._rt = null;
    this._scene = null;
    this._camera = null;
    this._ctx = null;
    this._objects = {};
    super.destroy();
    if (!kept) texture?.destroy(true); // canvas-backed source is per-sequence; safe to kill (a shared layer's source owns no GPU texture: the render target did)
    this._texture = null;
    this._sharedTexture = null;
  }
}

function resolveDim(v: PropValue | undefined, scope: Record<string, number>): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return v;
  return evaluateExpr(v, scope);
}

/** A number for each function: two layers are the same layer only when their `setup` is the same function. */
const ids = new WeakMap<object, number>();
let lastId = 0;
function idOf(fn: unknown): number {
  if (typeof fn !== 'function') return 0;
  let id = ids.get(fn);
  if (id === undefined) { id = ++lastId; ids.set(fn, id); }
  return id;
}
