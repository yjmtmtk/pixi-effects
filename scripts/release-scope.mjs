// What a release changed since the last tag, and whether the heavy browser tests can be left out of the release gate.
//
// The gate (`npm run release:check`) runs every test, the browser ones too (about 4 minutes). A release that only changes documents and the version pins cannot break
// what those tests draw: the gallery pages and the real-browser suites read `dist/` and the sources, which did not change. This decides, conservatively: the mode is
// `docs-only` ONLY when every changed file is a document from the list below or a bump of this package's own version, and `full` otherwise. When in doubt: full.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Documents: changing one cannot change a browser test. (`site/` and the skill's `reference/` are NOT here: the guide demos and the recipe tests are built from them.) */
const DOCUMENT = [
  /^(CHANGELOG|README|AGENTS|CLAUDE)\.md$/, /^llms(-full)?\.txt$/, /^docs\/.+\.(md|txt)$/, /^skills\/pixi-effects\/SKILL\.md$/,
];
const isDocument = (p) => DOCUMENT.some((re) => re.test(p));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Is this change nothing but the package's old version turned into its new one (`0.38.0` → `0.38.1`)? The lines removed and added must match one to one. */
function isVersionBump({ path, minus, plus }, { oldVersion, newVersion }) {
  if (!oldVersion || !newVersion || oldVersion === newVersion || (!minus.length && !plus.length) || minus.length !== plus.length) return false;
  const norm = (line) => line.replace(new RegExp(esc(oldVersion), 'g'), 'V').replace(new RegExp(esc(newVersion), 'g'), 'V');
  const a = minus.map(norm).sort(), b = plus.map(norm).sort();
  if (!a.every((line, i) => line === b[i])) return false;
  if (!minus.every((line) => line.includes(oldVersion)) || !plus.every((line) => line.includes(newVersion))) return false;      // every changed line really is a pin of THIS release
  if (/(^|\/)package(-lock)?\.json$/.test(path)) return minus.concat(plus).every((line) => /"version":/.test(line));            // in the manifests only the version itself, never a dependency
  return true;
}

/**
 * `changes`: [{ path, status ('A' | 'M' | 'D' | 'R'…), minus: [removed lines], plus: [added lines] }]; `ctx`: { oldVersion, newVersion }.
 * → { mode: 'docs-only' | 'full', reasons: [one sentence for each file (or the situation) that makes it full] }.
 */
export function classify(changes, ctx) {
  const reasons = [];
  if (!changes.length) reasons.push('nothing changed since the last tag: nothing to leave out, so everything runs');
  if (!ctx.oldVersion || !ctx.newVersion) reasons.push('the version of the last tag or of this tree could not be read');
  for (const c of changes) {
    if (isDocument(c.path)) continue;                                      // any change to a document is fine: added, edited, deleted
    if (c.status === 'M' && isVersionBump(c, ctx)) continue;
    reasons.push(`${c.path} (${c.status === 'M' ? 'changed beyond the version pins' : c.status === 'A' ? 'added' : c.status === 'D' ? 'deleted' : 'renamed'}) is not a document or a version bump`);
  }
  return { mode: reasons.length ? 'full' : 'docs-only', reasons };
}

const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/** The last `v*` tag and the change from it to the working tree (commits, edits, new files), judged by `classify`. */
export function scopeSince(dir) {
  let base;
  try { base = git(dir, 'describe', '--tags', '--abbrev=0', '--match', 'v*').trim(); } catch { base = null; }
  if (!base) return { mode: 'full', base: null, reasons: ['no tag to compare with (no v* tag in this repository)'], files: [] };
  const status = git(dir, 'diff', '--name-status', '--no-renames', base).split('\n').filter(Boolean).map((l) => { const [s, ...p] = l.split('\t'); return { path: p.join('\t'), status: s[0] }; });
  for (const p of git(dir, 'ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)) status.push({ path: p, status: 'A' });
  const changes = status.map((c) => {
    if (c.status !== 'M') return { ...c, minus: [], plus: [] };
    const lines = git(dir, 'diff', '-U0', '--no-color', base, '--', c.path).split('\n');
    return { ...c, minus: lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).map((l) => l.slice(1)), plus: lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1)) };
  });
  const version = (text) => { try { return JSON.parse(text).version ?? null; } catch { return null; } };
  let oldVersion = null, newVersion = null;
  try { oldVersion = version(git(dir, 'show', `${base}:package.json`)); } catch { /* no manifest at the tag */ }
  try { newVersion = version(readFileSync(join(dir, 'package.json'), 'utf8')); } catch { /* no manifest here */ }
  return { ...classify(changes, { oldVersion, newVersion }), base, files: changes.map((c) => c.path) };
}
