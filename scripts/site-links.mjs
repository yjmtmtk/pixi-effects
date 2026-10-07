// Finds the local links of a staged site (see stage-site.mjs) that do not resolve. No browser, no network.
//   node scripts/site-links.mjs <siteDir>      exit 1 and a list when something is broken
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ORIGIN = 'https://yjmtmtk.github.io/pixi-effects/';
const SKIP_DIRS = new Set(['node_modules', '.git', 'wedding-profilemovie', '_notes']);
const ATTR = /\b(?:href|src|poster|data-src|data-embed)\s*=\s*"([^"]*)"/gi;

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

export function brokenLinks(siteDir) {
  const problems = [];
  const site = resolve(siteDir);
  for (const file of htmlFiles(site)) {
    const page = relative(site, file).split(sep).join('/');
    for (const m of scannable(readFileSync(file, 'utf8')).matchAll(ATTR)) {
      const ref = m[1].trim();
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
