// examples/_presets/index.js
import basic from './basic.js';
import shapes from './shapes.js';
import transitions from './transitions.js';
import chromakey from './chromakey.js';
import nested from './nested.js';

export default [
  { id: 'basic',       label: 'Basic — text + keyframes', code: basic },
  { id: 'shapes',      label: 'Shape primitives',         code: shapes },
  { id: 'transitions', label: 'Transitions',              code: transitions },
  { id: 'chromakey',   label: 'Chromakey video',          code: chromakey },
  { id: 'nested',      label: 'Nested composition',       code: nested },
];
