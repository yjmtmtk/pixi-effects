// examples/_presets/index.js
import hello from './01-hello.js';
import keyframes from './02-keyframes.js';
import shapes from './03-shapes.js';
import media from './04-media.js';
import compositionMask from './05-composition-mask.js';
import filters from './06-filters.js';
import transitions from './07-transitions.js';
import presetsExport from './08-presets-export.js';

export default [
  { id: '01-hello',       label: '01 · hello',              code: hello },
  { id: '02-keyframes',   label: '02 · keyframes',          code: keyframes },
  { id: '03-shapes',      label: '03 · shapes',             code: shapes },
  { id: '04-media',       label: '04 · media',              code: media },
  { id: '05-composition', label: '05 · composition + mask', code: compositionMask },
  { id: '06-filters',     label: '06 · filters',            code: filters },
  { id: '07-transitions', label: '07 · transitions',        code: transitions },
  { id: '08-presets',     label: '08 · presets + export',   code: presetsExport },
];
