// Writes the shared parts into every page listed in site/pages.json, between its <!--site:NAME-->…<!--/site:NAME--> markers.
//   node scripts/sync-site.mjs            write
//   node scripts/sync-site.mjs --check    write nothing; exit 1 and list the pages that are out of date
// A page may list `parts` (default head, header, footer) and extra `regions` (see REGIONS) in site/pages.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderFooter, renderHead, renderHeader, rootPrefix } from './site-parts.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Extra regions a page may ask for in site/pages.json (`regions: ["examples-list"]`): name → (ctx) => html. */
export const REGIONS = {};

export function syncSite({ root = ROOT, check = false } = {}) {
  const { pages } = JSON.parse(readFileSync(join(root, 'site/pages.json'), 'utf8'));
  const stale = [], written = [];
  for (const page of pages) {
    const file = join(root, page.file);
    const depth = page.file.split('/').length - 1;
    const ctx = { root: rootPrefix(depth), current: page.current ?? '', root_dir: root, page };
    const all = { head: renderHead(ctx), header: renderHeader(ctx), footer: renderFooter(ctx) };
    const parts = {};
    for (const name of page.parts ?? ['head', 'header', 'footer']) parts[name] = all[name];
    for (const name of page.regions ?? []) {
      if (!REGIONS[name]) throw new Error(`${page.file}: unknown region "${name}"`);
      parts[name] = REGIONS[name](ctx);
    }
    const before = readFileSync(file, 'utf8');
    let html = before;
    for (const [name, body] of Object.entries(parts)) {
      const re = new RegExp(`(<!--site:${name}-->)[\\s\\S]*?(<!--/site:${name}-->)`);
      if (!re.test(html)) throw new Error(`${page.file}: no <!--site:${name}-->…<!--/site:${name}--> markers (add them where the part belongs)`);
      html = html.replace(re, (_m, open, close) => `${open}\n${body}\n${close}`);
    }
    if (html !== before) { stale.push(page.file); if (!check) { writeFileSync(file, html); written.push(page.file); } }
  }
  return { stale, written };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const check = process.argv.includes('--check');
  const { stale, written } = syncSite({ check });
  if (check && stale.length) { console.error(`out of date (run \`npm run site:sync\`): ${stale.join(', ')}`); process.exit(1); }
  console.log(check ? 'site parts are up to date' : written.length ? `synced: ${written.join(', ')}` : 'nothing to sync');
}
