// examples/playground/presets/index.js — the Playground's examples, in the form of the chat template's edit block.
import hello from './01-hello.js';
import keyframes from './02-keyframes.js';
import shapes from './03-shapes.js';
import media from './04-media.js';
import compositionMask from './05-composition-mask.js';
import filters from './06-filters.js';
import transitions from './07-transitions.js';
import presetsExport from './08-presets-export.js';
import audio from './09-audio.js';
import depth from './11-depth.js';
import sfx from './13-sfx.js';
import drawOn from './14-draw-on.js';
import timeRemap from './15-time-remap.js';
import depthOfField from './16-depth-of-field.js';
import blendModes from './17-blend-modes.js';
import mattes from './18-mattes.js';

export default [
  { id: '01-hello',       label: '01 · hello',              code: hello },
  { id: '02-keyframes',   label: '02 · keyframes',          code: keyframes },
  { id: '03-shapes',      label: '03 · shapes',             code: shapes },
  { id: '04-media',       label: '04 · media',              code: media },
  { id: '05-composition', label: '05 · composition + mask', code: compositionMask },
  { id: '06-filters',     label: '06 · filters',            code: filters },
  { id: '07-transitions', label: '07 · transitions',        code: transitions },
  { id: '08-presets',     label: '08 · presets + export',   code: presetsExport },
  { id: '09-audio',       label: '09 · audio',              code: audio },
  { id: '11-depth',       label: '11 · depth + camera',     code: depth },
  { id: '13-sfx',         label: '13 · sound effects',      code: sfx },
  { id: '14-draw-on',     label: '14 · draw-on & text',     code: drawOn },
  { id: '15-time-remap',  label: '15 · time: rewind & slow',  code: timeRemap },
  { id: '16-depth-of-field', label: '16 · depth of field: rack focus', code: depthOfField },
  { id: '17-blend-modes', label: '17 · blend modes: light and colour', code: blendModes },
  { id: '18-mattes', label: '18 · mattes and a luma wipe', code: mattes },
];

/** Import-map entries a piece of code needs beyond the template's own (the old Playground's values). */
export function extraImportsFor(code) {
  const extra = {};
  if (/from\s+['"]pixi-filters['"]|import\(\s*['"]pixi-filters['"]\s*\)/.test(code)) extra['pixi-filters'] = 'https://esm.sh/pixi-filters@6.1.4?external=pixi.js';
  return extra;
}
