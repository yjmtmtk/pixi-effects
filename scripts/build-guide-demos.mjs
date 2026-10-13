#!/usr/bin/env node
// Writes examples/_guide/<id>.html: one small page per guide recipe, built from the code block the guide itself shows
// (the `// @recipe <name>` blocks), so a demo can never drift from the text beside it. The guide embeds them with
// {{demo examples/_guide/<id>.html}}; the gallery's pieces are never used in the guide.
//   node scripts/build-guide-demos.mjs          write the pages
//   node scripts/build-guide-demos.mjs --check  exit 1 if a page on disk differs from what would be written
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// id = the file name (examples/_guide/<id>.html); recipe = the `// @recipe` name; file = the guide page that holds it
export const DEMOS = [
  { id: 'title-card',    file: 'cookbook',   recipe: 'title-card',      title: 'A title card',                duration: 5,  poster: 2.6 },
  { id: 'lower-third',   file: 'cookbook',   recipe: 'lower-third',     title: 'A lower third',               duration: 4,  poster: 2, bg: '#1b2238' },
  { id: 'count-up',      file: 'cookbook',   recipe: 'count-up',        title: 'Numbers that count up',       duration: 4.5, poster: 3.5 },
  { id: 'slideshow',     file: 'cookbook',   recipe: 'slideshow',       title: 'A slideshow with transitions', assets: [['p1', 'lake-autumn.jpg'], ['p2', 'lake-dusk.jpg'], ['p3', 'lake-lookout.jpg']], poster: 5.5 },
  { id: 'typewriter',    file: 'cookbook',   recipe: 'typewriter',      title: 'Terminal lines that type themselves', duration: 9, poster: 8 },
  { id: 'confetti',      file: 'cookbook',   recipe: 'confetti',        title: 'Confetti, the same every time', duration: 7, poster: 2.2 },
  { id: 'confetti-blur', file: 'cookbook',   recipe: 'confetti',        title: 'Confetti with motion blur',   duration: 7, poster: 2.2, motionBlur: '{ samples: 8, shutter: 0.55 }' },
  { id: 'orbit-chain',   file: 'motion',     recipe: 'orbit-chain',     title: 'An orbit within an orbit',    duration: 8, poster: 1.5 },
  { id: 'path-ride',     file: 'motion',     recipe: 'path-ride',       title: 'Travel along a path',         duration: 5.5, poster: 2.5 },
  { id: 'ripple',        file: 'motion',     recipe: 'ripple',          title: 'Waves with stagger',          duration: 5, poster: 2.4 },
  { id: 'animate-text',  file: 'text',       recipe: 'animate-text',    title: 'Per-letter animation',        duration: 6, poster: 3 },
  { id: 'vertical-text', file: 'text',       recipe: 'vertical-text-guide', title: 'Vertical writing',        duration: 5, poster: 4.2, bg: '#efe9dc' },
  { id: 'music',         file: 'audio',      recipe: 'music-guide',     title: 'Music written as text',       duration: 12, poster: 1.5 },
  { id: 'audio-react',   file: 'audio',      recipe: 'audio-react-guide', title: 'Visuals that follow the music', duration: 8, poster: 3.2 },
  { id: 'deck',          file: 'presenting', recipe: 'present-deck',    title: 'A talk made with deck()',     deck: true, poster: 1.5 },
];

const HELPERS = ['kenBurns', 'withFade', 'orbit', 'splitText', 'measureText', 'wiggle', 'stagger', 'animateText', 'followPath', 'cameraPath', 'particles', 'react', 'bpmEnvelope', 'random', 'rand', 'noise'];

export function recipeCode(name, file) {
  const md = readFileSync(resolve(root, 'site/guide', file + '.md'), 'utf8');
  const m = [...md.matchAll(/```js\n\/\/ @recipe ([^\n]+)\n([\s\S]*?)```/g)].find(x => x[1].trim() === name);
  if (!m) throw new Error(`no "// @recipe ${name}" block in site/guide/${file}.md`);
  return m[2].trimEnd();
}

function pins() {
  const t = readFileSync(resolve(root, 'skills/pixi-effects/template.html'), 'utf8');
  const get = key => t.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))[1];
  // the library comes from this repository's build, like the gallery pages (../../dist/…): a demo then shows the code of the same commit, also for a feature not released yet
  const local = key => '../../dist/' + get(key).split('/dist/')[1];
  return { pixi: get('pixi.js'), mediabunny: get('mediabunny'), index: local('pixi-effects'), controller: local('pixi-effects/controller'), present: local('pixi-effects/present') };
}

export function page(d) {
  const code = recipeCode(d.recipe, d.file);
  const p = pins();
  const used = HELPERS.filter(h => new RegExp(`\\b${h}\\(`).test(code));
  const body = d.deck ? code.replace(/return \{ duration: d\.duration[^\n]*/, 'return d;') : code;
  const indent = s => s.split('\n').map(l => (l ? '      ' + l : l)).join('\n');
  const imports = ['Movie', ...used].join(', ');
  const init = d.deck
    ? `await movie.init({ canvas, width: 1280, height: 720, frameRate: 30, background: '#f4efe6', poster: ${d.poster}, ...built });`
    : `await movie.init({ canvas, width: 1280, height: 720, duration: ${d.duration ? d.duration : 'built.duration || 8'}, frameRate: 30, background: '${d.bg || '#101424'}', poster: ${d.poster},${d.motionBlur ? `\n      motionBlur: ${d.motionBlur},` : ''}${d.assets ? `\n      assets: [${d.assets.map(([n, f]) => `{ name: '${n}', src: '../_assets/photos/${f}' }`).join(', ')}],` : ''}
      composition: Array.isArray(built) ? { sequences: built } : { sequences: built.sequences, transitions: built.transitions } });`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${d.title}</title>
  <!-- written by scripts/build-guide-demos.mjs from the \`// @recipe ${d.recipe}\` block of site/guide/${d.file}.md: edit the guide, then run the script -->
  <style>
    body { margin: 0; padding: 16px; background: #0d1220; }
    canvas { width: min(960px, 100%); border-radius: 8px; }
    .movie-controller-wrap { width: min(960px, 100%); }
  </style>
</head>
<body>
  <canvas id="stage" width="1280" height="720"></canvas>

<script type="importmap">
  {
    "imports": {
      "pixi.js":                 "${p.pixi}",
      "mediabunny":              "${p.mediabunny}",
      "pixi-effects":            "${p.index}",
      "pixi-effects/controller": "${p.controller}",
      "pixi-effects/present":    "${p.present}"
    }
  }
  </script>

  <script type="module">
    import { ${imports} } from 'pixi-effects';
    import { Controller } from 'pixi-effects/controller';${d.deck ? "\n    import { deck } from 'pixi-effects/present';" : ''}

    const canvas = document.getElementById('stage');
    const movie = new Movie();
    new Controller(movie, { canvas });       // a movie with stops gets a Present button

    // the guide's recipe, as it is printed there
    const built = (() => {
${indent(body)}
    })();

    ${init}

    window.movie = movie;
    window.__ready = true;
  </script>
</body>
</html>
`;
}

export function pathOf(d) { return resolve(root, 'examples/_guide', d.id + '.html'); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let bad = 0;
  for (const d of DEMOS) {
    const out = page(d), path = pathOf(d);
    if (check) { if (!existsSync(path) || readFileSync(path, 'utf8') !== out) { console.error('out of date: examples/_guide/' + d.id + '.html'); bad++; } }
    else writeFileSync(path, out);
  }
  if (check) process.exit(bad ? 1 : 0);
  console.log(`wrote ${DEMOS.length} pages to examples/_guide/`);
}
