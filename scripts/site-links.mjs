// Finds the local links of a staged site (see stage-site.mjs) that do not resolve. No browser, no network.
//   node scripts/site-links.mjs <siteDir>      exit 1 and a list when something is broken
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ORIGIN = 'https://yjmtmtk.github.io/pixi-effects/';
const SKIP_DIRS = new Set(['node_modules', '.git', 'wedding-profilemovie', '_notes']);
const ATTR = /\b(?:href|src|poster|data-src|data-embed)\s*=\s*"([^"]*)"/gi;
const SRCSET = /\bsrcset\s*=\s*"([^"]*)"/gi;
const IMPORTMAP = /<script\b[^>]*type=["']importmap["'][^>]*>([\s\S]*?)<\/script>/gi;
const MODULE = /<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi;
// `import x from "…"`, `import "…"`, `export … from "…"`, `import("…")`: only the relative or root-absolute ones (bare names go through the import map)
const SPECIFIER = /(?:\bimport\s*(?:[\w*{}\s,]+?\s+from\s*)?|\bexport\s[^;]*?\sfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g;

export function htmlFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (statSync(p).isDirectory()) htmlFiles(p, out);
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}

/** The page without its inline script bodies, styles and comments (templates inside scripts hold `href="${…}"`), keeping `<script src>` tags. */
function scannable(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

/** Every reference of a page that must resolve to a file of the site: attributes, srcset, import-map targets, module imports. */
function refsOf(html) {
  const page = html.replace(/<!--[\s\S]*?-->/g, '');
  const refs = [];
  for (const m of page.matchAll(IMPORTMAP)) {
    let map = {};
    try { map = JSON.parse(m[1]); } catch { /* not JSON: nothing to check */ }
    const targets = [...Object.values(map.imports ?? {}), ...Object.values(map.scopes ?? {}).flatMap((o) => Object.values(o))];
    refs.push(...targets.filter((t) => typeof t === 'string'));
  }
  for (const m of page.matchAll(MODULE)) for (const spec of m[1].matchAll(SPECIFIER)) if (/^(\.{1,2}\/|\/)/.test(spec[1])) refs.push(spec[1]);
  const markup = scannable(page);
  for (const m of markup.matchAll(ATTR)) refs.push(m[1]);
  for (const m of markup.matchAll(SRCSET)) for (const cand of m[1].split(',')) refs.push(cand.trim().split(/\s+/)[0] ?? '');
  return refs;
}

export function brokenLinks(siteDir) {
  const problems = [];
  const site = resolve(siteDir);
  for (const file of htmlFiles(site)) {
    const page = relative(site, file).split(sep).join('/');
    for (const raw of refsOf(readFileSync(file, 'utf8'))) {
      const ref = raw.trim();
      if (!ref || ref.startsWith('#') || /^(data:|mailto:|tel:|javascript:)/i.test(ref) || ref.includes('${') || ref.includes('{{')) continue;
      let target;
      if (ref.startsWith(ORIGIN)) target = resolve(site, ref.slice(ORIGIN.length).split(/[?#]/)[0]);
      else if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('//')) continue;           // another origin
      else if (ref.startsWith('/')) { problems.push({ page, ref, reason: 'root-absolute path (breaks under /pixi-effects/)' }); continue; }
      else target = resolve(dirname(file), ref.split(/[?#]/)[0]);
      if (!target.startsWith(site)) { problems.push({ page, ref, reason: 'points outside the site' }); continue; }
      if (!existsSync(target)) { problems.push({ page, ref, reason: 'file not found' }); continue; }
      if (statSync(target).isDirectory() && !existsSync(join(target, 'index.html'))) problems.push({ page, ref, reason: 'directory has no index.html' });
    }
  }
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = resolve(process.argv[2] ?? fileURLToPath(new URL('../_site', import.meta.url)));
  const problems = brokenLinks(dir);
  for (const p of problems) console.error(`${p.page}: ${p.ref} (${p.reason})`);
  console.log(problems.length ? `${problems.length} broken link(s)` : 'no broken local link');
  process.exit(problems.length ? 1 : 0);
}
