import { ImageSequence } from '../sequences/Image';
import { TextSequence } from '../sequences/Text';
import { AudioSequence } from '../sequences/Audio';
import { VideoSequence } from '../sequences/Video';
import { ShapeSequence } from '../sequences/Shape';
import { NullSequence } from '../sequences/Null';
import { CameraSequence } from '../space/CameraSequence';
import { LightSequence } from '../space/LightSequence';
import { ShaderSequence } from '../sequences/Shader';
import { CanvasSequence } from '../sequences/Canvas';
import { Scene2DSequence } from '../sequences/Scene2D';
import type { Sequence } from '../sequences/Base';
import { expandSpans } from '../text/spans';
import { buildScope } from '../expr/Scope';
import type { LayerSpec, CompositionShape, TextLayerSpec } from '../types';
import { layerAt } from './layerAt';
import { describeLayer } from './lint';
import { SHAPE_NAMES, LAYER_TYPES } from './layerKeys';
import { guessType, guessShape } from './typeGuess';

let _CompositionSequence: typeof import('../sequences/Composition').CompositionSequence | null = null;
async function getCompositionSequence() {
  if (!_CompositionSequence) {
    _CompositionSequence = (await import('../sequences/Composition')).CompositionSequence;
  }
  return _CompositionSequence;
}

let _SpansSequence: typeof import('../sequences/Spans').SpansSequence | null = null;
async function getSpansSequence() {
  if (!_SpansSequence) _SpansSequence = (await import('../sequences/Spans')).SpansSequence;
  return _SpansSequence;
}

export type SequenceCtor = { new (spec: LayerSpec, parent: CompositionShape | null, root: CompositionShape): Sequence };

const staticTypes: Partial<Record<LayerSpec['type'], SequenceCtor>> = {
  image: ImageSequence as unknown as SequenceCtor,
  text: TextSequence as unknown as SequenceCtor,
  audio: AudioSequence as unknown as SequenceCtor,
  video: VideoSequence as unknown as SequenceCtor,
  shape: ShapeSequence as unknown as SequenceCtor,
  camera: CameraSequence as unknown as SequenceCtor,
  light: LightSequence as unknown as SequenceCtor,
  shader: ShaderSequence as unknown as SequenceCtor,
  canvas: CanvasSequence as unknown as SequenceCtor,
  scene2d: Scene2DSequence as unknown as SequenceCtor,
  null: NullSequence as unknown as SequenceCtor,
};

// Externally-registered sequence types (e.g. `scene3d` from `pixi-effects/3d`).
// tsup splits shared code into common chunks, so every entry point sees this
// single module instance.
const registry: Record<string, SequenceCtor> = {};

/** Register an external sequence type. Later registrations overwrite earlier ones. */
export function registerSequenceType(type: string, ctor: SequenceCtor): void {
  registry[type] = ctor;
}

/** Layer types that live in an optional entry: an unregistered one names the entry and the call. */
const OPTIONAL_ENTRIES: Record<string, { from: string; call: string }> = {
  scene3d: { from: 'pixi-effects/3d', call: 'register3D' },
};
/** Layer types that are gone, with what to write instead (said in place of "unknown"). */
const REMOVED_TYPES: Record<string, string> = {
  three: "the three layer was removed in 0.52.0: a 3D scene is a scene3d layer (PixiJS 3D: import { register3D } from 'pixi-effects/3d'); three.js itself can still be drawn in a canvas layer (recipe three-in-canvas)",
};

export async function buildSequenceTree(
  specs: LayerSpec[],
  parent: CompositionShape | null,
  root: CompositionShape,
  /** Filled one by one as each layer is built: a layer's setup (a `scene3d` layer's `layerTexture`) can find the layers listed before it. */
  out: Sequence[] = [],
): Promise<Sequence[]> {
  for (let spec of specs) {
    let Cls: SequenceCtor | undefined = staticTypes[spec.type] ?? registry[spec.type];
    // a text layer with `spans` stands for a group of text layers, one per piece (src/text/spans.ts)
    if (spec.type === 'text' && (spec as { spans?: unknown }).spans !== undefined) {
      // the layer's own scope (W, H, GW, GH, the declared variables): the style's expressions are resolved for measuring
      spec = expandSpans(spec as TextLayerSpec, undefined, buildScope({ intrinsicWidth: 0, intrinsicHeight: 0, at: layerAt(spec), duration: spec.duration }, parent, root) as unknown as Record<string, number>);
      Cls = (await getSpansSequence()) as unknown as SequenceCtor;
    }
    if (!Cls && spec.type === 'composition') {
      Cls = (await getCompositionSequence()) as unknown as SequenceCtor;
    }
    if (!Cls) {
      const type = (spec as { type: string }).type;
      const entry = OPTIONAL_ENTRIES[type], removed = REMOVED_TYPES[type];
      const guess = entry || removed ? null : guessType(String(type));
      console.warn(removed ? `pixi-effects: ${removed}` : `pixi-effects: unknown layer type "${type}"${entry ? `: import { ${entry.call} } from '${entry.from}' and call ${entry.call}() before movie.init` : guess ? ` — did you mean ${guess}? (types: ${LAYER_TYPES.join(', ')})` : ''}`);
      await root.onLayerBuilt?.();                    // it was counted: count it done, or the bar would stop short
      continue;
    }
    if (spec.type === 'shape' && !SHAPE_NAMES.includes(String((spec as { shape?: unknown }).shape))) {
      const shape = String((spec as { shape?: unknown }).shape), guess = guessShape(shape);
      console.warn(`pixi-effects: ${describeLayer(spec as never)}: unknown shape "${shape}"${guess ? ` — did you mean "${guess}"?` : ''} (shapes: ${SHAPE_NAMES.join(', ')}); it is not drawn`);
      await root.onLayerBuilt?.();
      continue;
    }
    const seq = new Cls(spec, parent, root);
    await seq.build();
    await root.onLayerBuilt?.();
    if (seq.duration === undefined) {
      seq.duration = parent?.duration ?? root.duration;
    }
    out.push(seq);
  }
  return out;
}
