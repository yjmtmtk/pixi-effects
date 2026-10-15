// examples/playground/presets/index.js — the Playground's examples, in the form of the chat template's edit block.
// `hello` is hand-written; the others are tested recipes (skills/pixi-effects/reference/recipes.md) wrapped by scripts/build-presets.mjs from presets/list.json.
import hello from './01-hello.js';
import recipes from './recipes.js';

export default [
  { id: 'hello', label: 'hello: the smallest video', code: hello },
  ...recipes,
];

/** Import-map entries a piece of code needs beyond the template's own (the old Playground's values). */
export function extraImportsFor(code) {
  const extra = {};
  if (/from\s+['"]pixi-filters['"]|import\(\s*['"]pixi-filters['"]\s*\)/.test(code)) extra['pixi-filters'] = 'https://esm.sh/pixi-filters@6.1.4?external=pixi.js';
  return extra;
}
