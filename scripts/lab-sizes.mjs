// The Lab's "light" block shows the size of the comparison piece as a page and as an MP4. This writes them, measured, to lab/sizes.json.
//   node scripts/lab-sizes.mjs           write
//   node scripts/lab-sizes.mjs --check   write nothing; exit 1 when lab/sizes.json is not the real sizes
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function measure(root = ROOT) {
  return { html: statSync(join(root, 'lab/pieces/compare.html')).size, mp4: statSync(join(root, 'lab/media/compare.mp4')).size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const now = measure();
  const file = join(ROOT, 'lab/sizes.json');
  const text = JSON.stringify(now, null, 2) + '\n';
  if (process.argv.includes('--check')) {
    let before = '';
    try { before = readFileSync(file, 'utf8'); } catch { /* none yet */ }
    if (before !== text) { console.error(`lab/sizes.json is not the real sizes (run node scripts/lab-sizes.mjs): ${text.trim()}`); process.exit(1); }
    console.log('lab/sizes.json is up to date');
  } else { writeFileSync(file, text); console.log(`lab/sizes.json: ${text.trim()}`); }
}
