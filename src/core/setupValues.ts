/**
 * What `setup` left on the objects a layer's keyframes reach (`scene2d.box.alpha`, `scene3d.cube.position.x`, `three.knot.rotation.y`), kept for a rebuild that takes the scene
 * over (core/reuse.ts). The timeline reads where a property starts when it is built, from the object: a new tree built while the old one still plays would read the value
 * of the frame the old movie showed last (a box faded out at 2 s stays faded at 1 s after the rebuild). So:
 * - the layer that ran `setup` notes each property the first time one of its paths reaches it, before any keyframe writes it;
 * - a layer that borrowed the scene reaches it through a stand-in that reads the noted value and keeps its writes to itself while the scene is still the old layer's
 *   (the old movie goes on drawing untouched, also when the new tree is thrown away);
 * - at the swap the noted values are put back, so the new timeline starts from setup's picture, as a fresh page does; the frame drawn after the swap writes the rest.
 */
export class SetupValues {
  private readonly values = new Map<object, Map<string, unknown>>();

  /** The value `target[prop]` has now, noted the first time only. */
  note(target: object, prop: string): void {
    let props = this.values.get(target);
    if (!props) { props = new Map(); this.values.set(target, props); }
    if (!props.has(prop)) props.set(prop, (target as Record<string, unknown>)[prop]);
  }

  /** For a layer that borrowed: a one-property stand-in for `target[prop]`, the noted value while `borrowed()`, the object itself after. */
  view(target: object, prop: string, borrowed: () => boolean): { target: object; prop: string } {
    this.note(target, prop);
    const noted = () => this.values.get(target)!.get(prop);
    let held: { v: unknown } | null = null;
    const view = {};
    Object.defineProperty(view, prop, {
      enumerable: true,
      get: () => (borrowed() ? (held ? held.v : noted()) : (target as Record<string, unknown>)[prop]),
      set: (v: unknown) => { if (borrowed()) held = { v }; else (target as Record<string, unknown>)[prop] = v; },
    });
    return { target: view, prop };
  }

  /** The swap: every noted property back to the value setup left. */
  restore(): void {
    for (const [target, props] of this.values) {
      for (const [prop, v] of props) {
        try { (target as Record<string, unknown>)[prop] = v; } catch { /* a property that cannot be written back: the next frame writes it */ }
      }
    }
  }
}
