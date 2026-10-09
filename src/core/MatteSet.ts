import { Container, Matrix, RenderTexture, Sprite } from 'pixi.js';
import { MatteFilter } from '../filters/Matte';
import type { Sequence } from '../sequences/Base';
import type { SpaceHost } from '../space/Layer3D';

const EMPTY = new Container();

interface Matte { seq: Sequence; chain: Sequence[]; rt: RenderTexture; sprite: Sprite }

/**
 * The mattes of one composition: each is a layer drawn, once per frame, into a texture the size of the composition. A hidden sprite showing
 * the texture sits in the composition's inner container (so its world transform says where the texture is on screen) and the matted layers'
 * `MatteFilter`s read it. Nothing here remembers a frame: the texture is redrawn from the state the timeline just set.
 */
export class MatteSet {
  private readonly mattes = new Map<string, Matte>();
  private readonly sources = new Set<Sequence>();

  constructor(private readonly inner: Container, private readonly width: number, private readonly height: number) {}

  get size(): number { return this.mattes.size; }
  has(key: string): boolean { return this.mattes.has(key); }
  /** Is this layer a matte's source (so it is not drawn on screen)? */
  isSource(seq: Sequence): boolean { return this.sources.has(seq); }

  /** `chain`: the null layers the source sits in, nearest first (the source is in no container, so their transforms are composed by hand). */
  add(key: string, seq: Sequence, chain: Sequence[] = []): void {
    if (this.mattes.has(key)) return;
    const rt = RenderTexture.create({ width: this.width, height: this.height, resolution: 1, antialias: true });
    const sprite = new Sprite(rt);
    sprite.renderable = false;                                  // only its worldTransform is used: where the texture sits on screen
    this.inner.addChild(sprite);
    this.mattes.set(key, { seq, chain, rt, sprite });
    this.sources.add(seq);
  }

  filterFor(key: string, opts: { channel: 'alpha' | 'luma'; invert: boolean }): MatteFilter | null {
    const m = this.mattes.get(key);
    return m ? new MatteFilter({ sprite: m.sprite, channel: opts.channel, invert: opts.invert }) : null;
  }

  /** Draw every matte into its texture from the state the timeline has just set; a hidden matte is an empty texture (it cuts everything away). */
  render(host: SpaceHost): void {
    for (const { seq, chain, rt } of this.mattes.values()) {
      const target = seq.target;
      if (target && target.renderable && target.visible) {
        target.updateLocalTransform();
        const m = target.localTransform.clone();
        for (const p of chain) { p.target?.updateLocalTransform(); if (p.target) m.prepend(p.target.localTransform); }
        host.render({ container: target, target: rt, transform: m, clear: true, clearColor: [0, 0, 0, 0] });
      } else {
        host.render({ container: EMPTY, target: rt, transform: new Matrix(), clear: true, clearColor: [0, 0, 0, 0] });
      }
    }
  }

  destroy(): void {
    for (const m of this.mattes.values()) { m.sprite.destroy(); m.rt.destroy(true); }
    this.mattes.clear();
    this.sources.clear();
  }
}
