// pixi-effects recipe | help | new: let an agent read what it needs instead of a 35 KB cheatsheet and a 69 KB list of recipes.
//
//   npx pixi-effects recipe              the recipes (id and title)
//   npx pixi-effects recipe <id>         one recipe: its text and its code (a part of an id works when it is unique)
//   npx pixi-effects help <word>         the sections of the docs about a word (mask, threeD, keyframes, music …)
//   npx pixi-effects new <name>          <name>.html from the template, pinned to this package's version
//
// Zero dependencies. The texts are the ones the package ships (docs/dsl.md, docs/api.md, skills/pixi-effects/reference/*.md, skills/pixi-effects/template.html).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RECIPES = 'skills/pixi-effects/reference/recipes.md';
/** What `help` reads, most useful first (the number is a small bonus in the ranking). */
const CORPUS = [
  ['docs/dsl.md', 10], ['skills/pixi-effects/reference/cheatsheet.md', 8], ['skills/pixi-effects/reference/pitfalls.md', 6],
  ['docs/api.md', 4], ['skills/pixi-effects/reference/direction.md', 2],
];
const MAX_HITS = 5, MAX_LINES_PER_HIT = 30, MAX_OUTPUT_LINES = 170;

function distance(a, b) {
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) m[i][j] = Math.min(m[i][j], m[i - 2][j - 2] + 1);
  }
  return m[a.length][b.length];
}
const nearestOf = (word, list) => {
  let best = null;
  for (const c of list) { const d = distance(word.toLowerCase(), c.toLowerCase()); if (d <= Math.max(2, Math.floor(c.length / 3)) && (!best || d < best.d)) best = { c, d }; }
  return best ? best.c : undefined;
};

/** The "## " sections of a markdown text (a heading inside a code fence is not one). Each: { title, text, line (1-based), ids (the names after // @recipe or // @docs-only) }. */
export function parseRecipes(md) {
  const lines = md.split('\n');
  const sections = [];
  let fence = false, cur = null;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) fence = !fence;
    const h = !fence && /^## (.+)$/.exec(line);
    if (h) { cur = { title: h[1].trim(), lines: [line], line: i + 1 }; sections.push(cur); }
    else if (cur) cur.lines.push(line);
  });
  return sections.map(s => {
    const body = [...s.lines];
    while (body.length && /^(---|\s*)$/.test(body[body.length - 1])) body.pop();             // the separator belongs to nobody
    const text = body.join('\n');
    return { title: s.title, text, line: s.line, ids: [...text.matchAll(/\/\/ @(?:recipe|docs-only)[ \t]+([A-Za-z0-9_-]+)/g)].map(m => m[1]) };
  });
}

/** { section, id } for an exact id or a unique part of one (or of a title); { many } when several match; { nearest } (maybe undefined) when none does. */
export function findRecipe(sections, query) {
  const q = query.trim().toLowerCase();
  const exact = sections.find(s => s.ids.some(id => id.toLowerCase() === q));
  if (exact) return { section: exact, id: exact.ids.find(id => id.toLowerCase() === q) };
  const part = sections.filter(s => s.ids.some(id => id.toLowerCase().includes(q)) || s.title.toLowerCase().includes(q));
  if (part.length === 1) return { section: part[0] };
  if (part.length > 1) return { many: part };
  return { nearest: nearestOf(q, sections.flatMap(s => s.ids)) };
}

const readIf = (file) => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };

/** Sections of a doc: a "## / ### / ####" heading each; for the pitfalls, a numbered item each ("84. **Subtract …**"). */
function docSections(text, file) {
  const out = [];
  const lines = text.split('\n');
  const pit = /pitfalls\.md$/.test(file);
  let fence = false, cur = null;
  lines.forEach((line, i) => {
    if (/^```/.test(line)) fence = !fence;
    let heading = null;
    if (!fence) {
      const h = /^#{2,4} (.+)$/.exec(line);
      const p = pit && /^(\d+[a-z]?)\. \*\*(.+?)\*\*/.exec(line);
      if (h) heading = h[1].trim();
      else if (p) heading = `pitfall ${p[1]}: ${p[2].replace(/[`*]/g, '')}`.slice(0, 100);
    }
    if (heading) { cur = { file, heading, line: i + 1, lines: [line] }; out.push(cur); }
    else if (cur) cur.lines.push(line);
  });
  return out;
}

/** The sections of the docs about `word` (all its words must appear), best first: [{ file, line, heading, lines, more }]. */
export function searchDocs(root, word) {
  const tokens = String(word).toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored = [];
  for (const [file, bonus] of CORPUS) {
    const text = readIf(path.join(root, file));
    if (!text) continue;
    for (const s of docSections(text, file)) {
      const heading = s.heading.toLowerCase();
      const body = s.lines.join('\n').toLowerCase();
      if (!tokens.every(t => body.includes(t))) continue;
      const inHeading = tokens.every(t => heading.includes(t));
      const count = tokens.reduce((n, t) => n + body.split(t).length - 1, 0);
      scored.push({ s, score: (inHeading ? 1000 : 0) + Math.min(count, 50) + bonus });
    }
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_HITS).map(({ s }) => {
    const body = s.lines.filter((l, i) => i === 0 || l.trim() !== '' || true);
    const shown = body.slice(0, MAX_LINES_PER_HIT);
    return { file: s.file, line: s.line, heading: s.heading, lines: shown, more: Math.max(0, body.length - shown.length) };
  });
}

/** The lines `help` prints for those hits (the whole answer stays under MAX_OUTPUT_LINES), with the next step at the end. */
export function formatHelp(hits, word, root = PACKAGE_ROOT) {
  const out = [];
  const share = Math.max(8, Math.floor((MAX_OUTPUT_LINES - 6 - hits.length * 3) / Math.max(1, hits.length)));
  for (const h of hits) {
    out.push(`── ${h.file}:${h.line}  ${h.heading}`);
    const lines = h.lines.slice(0, share);
    out.push(...lines);
    const more = h.more + (h.lines.length - lines.length);
    if (more > 0) out.push(`… ${more} more lines: ${h.file}:${h.line}`);
    out.push('');
  }
  const md = readIf(path.join(root, RECIPES));
  const ids = md ? parseRecipes(md).filter(s => String(word).toLowerCase().split(/\s+/).every(t => s.title.toLowerCase().includes(t) || s.ids.some(id => id.includes(t)))).flatMap(s => s.ids).slice(0, 6) : [];
  out.push(`next: pixi-effects help <another word>${ids.length ? ` · recipes about it: ${ids.map(i => `pixi-effects recipe ${i}`).join(', ')}` : ' · pixi-effects recipe (the tested pieces to copy)'}`);
  return out.slice(0, MAX_OUTPUT_LINES);
}

/** <name>.html from the template, titled with the name, its CDN pins set to this package's version. Throws if the file exists (without `force`). */
export function newPage(name, { cwd = process.cwd(), root = PACKAGE_ROOT, force = false } = {}) {
  if (!name || !String(name).trim()) throw new Error('give the page a name: pixi-effects new my-video');
  const raw = String(name).trim();
  const base = path.basename(raw).replace(/\.html?$/i, '');
  const dir = path.dirname(raw);
  const file = path.resolve(cwd, dir, base.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '-') + '.html');
  if (!fs.existsSync(path.dirname(file))) throw new Error(`the folder ${path.dirname(file)} does not exist`);
  if (fs.existsSync(file) && !force) throw new Error(`${file} already exists (give another name, or --force to replace it)`);
  const template = readIf(path.join(root, 'skills/pixi-effects/template.html'));
  if (!template) throw new Error('the template is missing from this package (skills/pixi-effects/template.html)');
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const html = template
    .replace(/pixi-effects@\d+\.\d+\.\d+/g, `pixi-effects@${version}`)
    .replace('<title>pixi-effects video</title>', `<title>${base.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`);
  fs.writeFileSync(file, html);
  return { file };
}

const shownPath = (file, cwd) => { const r = path.relative(cwd, file); return r.startsWith('..') || path.isAbsolute(r) ? file : r; };

export const LOOKUP_COMMANDS = ['recipe', 'help', 'new'];

/** Run one of the commands: { code, stdout, stderr } (nothing is printed here). */
export function runLookup(cmd, args, { cwd = process.cwd(), root = PACKAGE_ROOT } = {}) {
  const ok = (stdout) => ({ code: 0, stdout: stdout.endsWith('\n') ? stdout : stdout + '\n', stderr: '' });
  const fail = (stderr, code = 1) => ({ code, stdout: '', stderr: stderr.endsWith('\n') ? stderr : stderr + '\n' });
  if (cmd === 'recipe') {
    const md = readIf(path.join(root, RECIPES));
    if (!md) return fail(`the recipes are missing from this package (${RECIPES})`);
    const sections = parseRecipes(md);
    const query = args.join(' ').trim();
    if (!query) {
      const lines = ['recipes (pixi-effects recipe <id> prints one with its code):'];
      for (const s of sections) for (const id of s.ids) lines.push(`  ${id.padEnd(28)} ${s.title}`);
      return ok(lines.join('\n'));
    }
    const r = findRecipe(sections, query);
    if (r.section) return ok(r.section.text);
    if (r.many) return fail(`several recipes match "${query}": ${r.many.map(s => s.ids[0] ?? s.title).join(', ')}. Give one id (pixi-effects recipe lists them).`);
    return fail(`no recipe "${query}"${r.nearest ? `; did you mean "${r.nearest}"?` : ''} (pixi-effects recipe lists them)`);
  }
  if (cmd === 'help') {
    const word = args.join(' ').trim();
    if (!word) {
      return ok([
        'pixi-effects help <word>: the sections of the docs about a word. Try:',
        '  layers      text  shape  image  video  audio  composition  camera  light  shader  null',
        '  motion      keyframes  ease  stagger  wiggle  spring  speed  time  expression',
        '  look        mask  filters  blendMode  gradient  transition  threeD  depth of field',
        '  sound       sfx  music  audioEnvelope',
        '  checking    check  inspect  contactSheet  render  stops',
        'pixi-effects recipe lists the tested pieces to copy; pixi-effects check <page.html> reviews your work.',
      ].join('\n'));
    }
    const hits = searchDocs(root, word);
    if (!hits.length) return fail(`nothing in the docs about "${word}": try another word (pixi-effects help lists some), or pixi-effects recipe`);
    return ok(formatHelp(hits, word, root).join('\n'));
  }
  if (cmd === 'new') {
    const force = args.includes('--force');
    const name = args.filter(a => a !== '--force')[0];
    if (!name) return fail('give the page a name: pixi-effects new my-video [--force]', 2);
    try {
      const { file } = newPage(name, { cwd, root, force });
      const f = shownPath(file, cwd);
      return ok([
        `created ${f} (the template: a 1280x720 page that collects every warning in window.__logs)`,
        `next: npx pixi-effects view ${f}     look at it as you edit (it says when the file changed)`,
        `      npx pixi-effects check ${f}    review it: warnings, layout, sound, a contact sheet, a real export`,
        '      npx pixi-effects recipe        tested pieces to copy  ·  npx pixi-effects help <word>',
      ].join('\n'));
    } catch (e) { return fail(`pixi-effects new: ${e.message}`); }
  }
  return fail(`unknown command ${cmd}`, 2);
}
