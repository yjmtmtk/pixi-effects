import { suggestName } from './options';
import { SHAPE_NAMES, LAYER_TYPES } from './layerKeys';

const SHAPES = new Set(SHAPE_NAMES);
/** Shapes by the names other programs give them. */
const SHAPE_ALIASES: Record<string, string> = { rectangle: 'rect', square: 'rect', box: 'rect', roundrect: 'rect', roundedrect: 'rect', oval: 'ellipse', dot: 'circle', disc: 'circle', disk: 'circle', ring: 'circle',
  triangle: 'polygon', star: 'polygon', hexagon: 'polygon', pentagon: 'polygon', poly: 'polygon', polyline: 'line', segment: 'line', pie: 'arc', wedge: 'arc', svg: 'path', bezier: 'path', curve: 'path' };
/** Layer types by the names other tools give them. */
const TYPE_ALIASES: Record<string, string> = { group: 'composition', precomp: 'composition', comp: 'composition', container: 'composition', scene: 'composition', nest: 'composition',
  sprite: 'image', picture: 'image', img: 'image', photo: 'image', bitmap: 'image', sound: 'audio', sfx: 'audio', music: 'audio', bgm: 'audio', movie: 'video', clip: 'video', footage: 'video',
  label: 'text', title: 'text', caption: 'text', glsl: 'shader', fragment: 'shader', nullobject: 'null', empty: 'null', 'null-object': 'null' };

/** What an unknown type probably meant: a layer type, or a shape written as the type (`type: 'rect'` → `type: 'shape', shape: 'rect'`). */
export function guessType(type: string): string | null {
  const n = type.toLowerCase().replace(/[-_ ]/g, '');
  const shape = SHAPES.has(n) ? n : SHAPE_ALIASES[n];
  if (shape) return `type: 'shape', shape: '${shape}'`;
  const t = TYPE_ALIASES[n] ?? suggestName(type, LAYER_TYPES);
  return t ? `"${t}"` : null;
}
/** What an unknown shape probably meant. */
export function guessShape(shape: string): string | null {
  const n = shape.toLowerCase().replace(/[-_ ]/g, '');
  return SHAPE_ALIASES[n] ?? suggestName(shape, SHAPE_NAMES);
}

