// The layout GitHub Pages serves, built into <outDir>. The Pages workflow and the tests both call this, so what is tested is what ships.
//   node scripts/stage-site.mjs [outDir]      default _site
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildGuide } from './build-guide.mjs';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function stageSite(outDir, { root = ROOT } = {}) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const copy = (from, to = from) => {
    if (!existsSync(join(root, from))) return;
    mkdirSync(dirname(join(outDir, to)), { recursive: true });
    cpSync(join(root, from), join(outDir, to), { recursive: true });
  };
  for (const dir of ['dist', 'ai', 'skills']) copy(dir);
  // what the site shows from examples/ (a list: examples/_checks is never shipped)
  for (const f of ['gallery', 'interactive', 'showreel', 'films', '_assets', 'playground', 'playground.html']) copy(`examples/${f}`);
  // until the Guide, the music lab and the numbered tour are removed (plan 2026-10-15-site-restructure, tasks 4-6) they are still staged
  for (const f of ['index.html', 'examples.json', 'examples.css', 'music-lab.html', 'music-lab', '_guide']) copy(`examples/${f}`);
  for (const f of readdirSync(join(root, 'examples'))) if (/^\d\d-.*\.html$/.test(f)) copy(`examples/${f}`);
  rmSync(join(outDir, 'ai/tools/media-page.html'), { force: true });      // the browser page of the media commands is served by their own local server (/__mb/, /__in/): it is not a page of the site
  for (const f of ['docs/dsl.md', 'docs/api.md', 'llms.txt', 'llms-full.txt']) copy(f);
  copy('index.html');
  copy('for-ai.html');
  copy('site/landing/landing.css');
  copy('site/shared');
  await buildGuide({ srcDir: join(root, 'site/guide'), outDir: join(outDir, 'guide'), root });
  return outDir;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = resolve(process.argv[2] ?? join(ROOT, '_site'));
  await stageSite(out);
  console.log(`site staged → ${out}`);
}
