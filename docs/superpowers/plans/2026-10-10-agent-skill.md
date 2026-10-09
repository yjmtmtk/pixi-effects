# Agent skill registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, the owner's standing choice). Steps use checkbox (`- [ ]`) syntax.

**Goal:** `npx skills add yjmtmtk/pixi-effects` (and `/plugin install` in Claude Code) registers pixi-effects as a skill that agents use without being told the library's name.

**Architecture:** `ai/` stays the source. `scripts/build-skill.mjs` generates a committed `skills/pixi-effects/` (SKILL.md with repo-only text removed and paths made install-safe, template, references, one script); `npm run build:ai` runs it; a unit test fails when the copy is stale or invalid. A `.claude-plugin/` manifest points the plugin at `./skills`. One-line entry points are added to README, the landing page, AGENTS.md, llms.txt.

**Tech Stack:** Node ESM scripts, vitest, the `skills` CLI (`npx skills`) and `claude plugin validate` for manual checks.

**Spec:** `docs/superpowers/specs/2026-10-10-agent-skill-design.md`

## Global Constraints

- Breaking changes are fine; no compat shims. All replies to the owner in Japanese; repo text in English.
- Never `git add -A`; commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; do not push until the owner says so.
- The description is **broad (option A)**: task words first, the library named in the second sentence; ≤ 1000 characters; no engine names of the closed 3D beta anywhere.
- The skill must work from `~/.claude/skills/pixi-effects/` and `.agents/skills/pixi-effects/`: no `ai/` path, no `node ai/…`, every relative link inside the folder.
- Speed rule: run only the targeted test file while iterating (`npx vitest run tests/docs/Skill.test.ts`), `npm run test:fast` once per task end.
- Do not touch the release routine: the pin bump edits `ai/template.html`; `build:ai` regenerates the copy.

## Review Focus

- A `<!--repo-->` block that is unbalanced or nested must fail the build (not silently eat the file).
- The generated SKILL.md must not mention a file that is not in the folder (cheatsheet, pitfalls, recipes, dsl, template, save-image).
- The skill's `template.html` pin equals `package.json` version (a bump that skips `build:ai` is caught).
- The manifest `name` equals the marketplace entry `name`; `claude plugin validate .` passes.
- A second `SKILL.md` anywhere else in the tree (e.g. `ai/SKILL.md` is found by the CLI's recursive fallback) must not confuse `npx skills add --list`: it lists exactly one skill.

---

### Task 1: The generator, the broad description, the committed copy

**Files:**
- Create: `scripts/build-skill.mjs`, `tests/docs/Skill.test.ts`
- Modify: `ai/SKILL.md` (description; `<!--repo-->` markers), `scripts/build-llms.mjs` is NOT touched; `package.json` (`build:ai`, `files`)
- Generate + commit: `skills/pixi-effects/**`

**Interfaces:**
- Produces: `buildSkill(): Record<string, string | Buffer>` — map from path under `skills/pixi-effects/` to file content; `writeSkill()` writes it (CLI: `node scripts/build-skill.mjs`).

- [ ] **Step 1: Write the failing test** (`tests/docs/Skill.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';
// @ts-expect-error plain ESM script without types
import { buildSkill, stripRepoBlocks } from '../../scripts/build-skill.mjs';

const root = resolve(__dirname, '../..');
const dir = resolve(root, 'skills/pixi-effects');
const files = buildSkill() as Record<string, string>;

function walk(d: string): string[] {
  return readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [relative(dir, join(d, f))]);
}

describe('skills/pixi-effects — the skill an agent installs', () => {
  it('is committed and up to date (run `npm run build:ai` after editing ai/ or docs/)', () => {
    expect(walk(dir).sort()).toEqual(Object.keys(files).sort());
    for (const [p, c] of Object.entries(files)) expect(readFileSync(join(dir, p), 'utf8'), p).toBe(c);
  });

  const skill = files['SKILL.md']!;
  const fm = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(skill);

  it('has the frontmatter every agent reads: name = folder, a broad description of at most 1000 characters', () => {
    expect(fm).not.toBeNull();
    expect(fm![1]).toBe('pixi-effects');
    expect(fm![2]!.length).toBeLessThanOrEqual(1000);
    for (const w of ['video', 'motion graphics', 'animated title', 'lower third', 'promo', 'chart', 'slideshow', 'pixi-effects']) expect(fm![2]!.toLowerCase(), w).toContain(w);
  });

  it('names the library in its second sentence, so a user of another tool can see why it fired', () => {
    const sentences = fm![2]!.split(/(?<=\.)\s/);
    expect(sentences[1]).toContain('pixi-effects');
  });

  it('says which version it was written for, and the template pins that version', () => {
    const v = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).version as string;
    expect(skill).toContain(`Written for pixi-effects ${v}`);
    expect(files['template.html']).toContain(`pixi-effects@${v}/dist/index.js`);
  });

  it('has no path that only exists inside the repository', () => {
    for (const [p, c] of Object.entries(files)) {
      if (!/\.(md|html|py)$/.test(p)) continue;
      expect(c, p).not.toMatch(/node ai\/|ai\/tools\/|ai\/reference\/|\.\.\/\.\.\/dist/);
      expect(c, p).not.toContain('<!--repo-->');
    }
  });

  it('every file SKILL.md points to is in the folder, and it stays under 500 lines', () => {
    expect(skill.split('\n').length).toBeLessThan(500);
    for (const m of skill.matchAll(/`((?:reference|scripts)\/[\w./-]+|template\.html)`/g)) expect(files[m[1]!], m[1]).toBeDefined();
  });

  it('stripRepoBlocks removes a marked block, and refuses an unbalanced or nested one', () => {
    expect(stripRepoBlocks('a <!--repo-->x<!--/repo--> b')).toBe('a  b');
    expect(() => stripRepoBlocks('a <!--repo-->x')).toThrow(/repo/);
    expect(() => stripRepoBlocks('<!--repo-->a<!--repo-->b<!--/repo--><!--/repo-->')).toThrow(/repo/);
    expect(() => stripRepoBlocks('x<!--/repo-->')).toThrow(/repo/);
  });
});
```

- [ ] **Step 2: Run it to see it fail**
Run: `npx vitest run tests/docs/Skill.test.ts` — Expected: FAIL (`Cannot find module '../../scripts/build-skill.mjs'`).

- [ ] **Step 3: Edit the source `ai/SKILL.md`**
  1. Replace the `description:` with the broad one (one line, ≤ 1000 chars): first sentence = the tasks (`Use when asked to make, animate, preview or export a video, motion graphics, an animated title, a lower third, kinetic type, a promo, a slideshow with transitions, an animated chart or data story, a social clip, a 2.5D / depth scene, or music and sound for a video, written as code in JavaScript or HTML.`); second sentence = `pixi-effects is a JS library where a video is a plain-object composition (text, shape, image, video, audio and file-free sfx / music, camera, light and shader layers with keyframes) that plays in the browser, is checked by a tool the agent can run, and exports MP4 / WebM / MOV with no server.`
  2. Make every command path-neutral: write `npx pixi-effects-check my-video.html` / `npx pixi-effects-render …` / `npx pixi-effects-view …` first; put the repository-only forms in `<!--repo-->(inside this repository: `node ai/tools/check.mjs …`)<!--/repo-->` markers; the `save-image.py` command becomes `python3 scripts/save-image.py` with a `<!--repo-->` note that the repository's copy is `ai/tools/save-image.py`; `docs/dsl.md` becomes `reference/dsl.md` (in the source: write `reference/dsl.md`, and let the repo build `ai/reference/dsl.md`? **No**: keep `docs/dsl.md` in the source inside a `<!--repo-->` block and give the skill's reference line separately — see the generator's inject list below).
  3. `grep -n "node ai/\|ai/tools/\|docs/dsl.md\|\.\./\.\./dist" ai/SKILL.md` must show only text inside `<!--repo-->` blocks.

- [ ] **Step 4: Write `scripts/build-skill.mjs`**

```js
// Generates skills/pixi-effects/ (what `npx skills add yjmtmtk/pixi-effects` installs) from ai/ and docs/.
// Run: npm run build:ai   (tests/docs/Skill.test.ts fails when the committed copy is stale)
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(resolve(root, p), 'utf8');

/** Removes `<!--repo-->…<!--/repo-->` blocks (text that only makes sense inside this repository); an unbalanced or nested marker throws. */
export function stripRepoBlocks(s) {
  let out = '', i = 0;
  for (;;) {
    const open = s.indexOf('<!--repo-->', i), close = s.indexOf('<!--/repo-->', i);
    if (open < 0 && close < 0) return out + s.slice(i);
    if (close >= 0 && (open < 0 || close < open)) throw new Error('build-skill: a <!--/repo--> without its <!--repo-->');
    const end = s.indexOf('<!--/repo-->', open);
    if (end < 0) throw new Error('build-skill: a <!--repo--> that is never closed');
    if (s.slice(open + 11, end).includes('<!--repo-->')) throw new Error('build-skill: <!--repo--> blocks must not nest');
    out += s.slice(i, open); i = end + 12;
  }
}

export function buildSkill() {
  const pkg = JSON.parse(read('package.json'));
  const src = read('ai/SKILL.md');
  const m = /^(---\n[\s\S]*?\n---\n)([\s\S]*)$/.exec(src);
  if (!m) throw new Error('build-skill: ai/SKILL.md has no frontmatter');
  const body = stripRepoBlocks(m[2]);
  const note = `\n> Written for pixi-effects ${pkg.version}. Update with \`npx skills update\`; the newest docs are at https://yjmtmtk.github.io/pixi-effects/\n`;
  return {
    'SKILL.md': m[1] + note + body,
    'template.html': read('ai/template.html'),
    'reference/cheatsheet.md': read('ai/reference/cheatsheet.md'),
    'reference/pitfalls.md': read('ai/reference/pitfalls.md'),
    'reference/recipes.md': read('ai/reference/recipes.md'),
    'reference/dsl.md': read('docs/dsl.md'),
    'scripts/save-image.py': read('ai/tools/save-image.py'),
  };
}

export function writeSkill() {
  const out = resolve(root, 'skills/pixi-effects');
  rmSync(out, { recursive: true, force: true });
  const files = buildSkill();
  for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(out, p)), { recursive: true }); writeFileSync(join(out, p), c); }
  return Object.keys(files);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) console.log(`skills/pixi-effects: ${writeSkill().length} files`);
```
  (If `ai/SKILL.md` mentions `docs/dsl.md` outside a repo block, the generated text must say `reference/dsl.md`: do that by writing the sentence in the source as `` `reference/dsl.md` `` inside `<!--skill-->…<!--/skill-->`? **Simpler ruling:** keep one sentence in the source that reads "the full reference: `docs/dsl.md` in the repository, `reference/dsl.md` in an installed skill" and let the test's no-`ai/`-path rule pass because `docs/dsl.md` is allowed. Record this as the ledger ruling when you reach it.)

- [ ] **Step 5: Wire it into `build:ai`** — `package.json`: `"build:ai": "node scripts/build-llms.mjs && node scripts/build-skill.mjs"`; `files`: add `"skills"`.

- [ ] **Step 6: Generate and go green** — Run `npm run build:ai && npx vitest run tests/docs/Skill.test.ts` — Expected: PASS (6 tests). Mutation check: edit one generated file by hand → the staleness test FAILS; restore with `npm run build:ai`.

- [ ] **Step 7: Targeted regression** — Run `npx vitest run tests/docs/Llms.test.ts tests/docs/AgentEntry.test.ts tests/docs/Recipes.test.ts` — Expected: PASS (SKILL.md edits must not break the llms-full or recipe tests).

- [ ] **Step 8: Commit** — `git add scripts/build-skill.mjs tests/docs/Skill.test.ts ai/SKILL.md package.json skills llms-full.txt` then `git commit` ("feat: the skill an agent installs (skills/pixi-effects, generated from ai/), with a broad description").

---

### Task 2: The Claude Code plugin manifest

**Files:**
- Create: `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`
- Modify: `tests/docs/Skill.test.ts` (manifest consistency)

**Interfaces:** Consumes `skills/pixi-effects/` (Task 1) through the plugin's default `skills/` folder at the plugin root (the repository root).

- [ ] **Step 1: Failing test** — append to `tests/docs/Skill.test.ts`:

```ts
describe('the Claude Code plugin manifest', () => {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const plugin = JSON.parse(readFileSync(resolve(root, '.claude-plugin/plugin.json'), 'utf8'));
  const market = JSON.parse(readFileSync(resolve(root, '.claude-plugin/marketplace.json'), 'utf8'));
  it('describes the same plugin under the same name, at the package version', () => {
    expect(plugin.name).toBe('pixi-effects');
    expect(plugin.version).toBe(pkg.version);
    expect(market.plugins.map((p: { name: string }) => p.name)).toEqual([plugin.name]);
    expect(market.plugins[0].source).toBe('./');
    expect(market.owner?.name).toBeTruthy();
  });
});
```
  Run: `npx vitest run tests/docs/Skill.test.ts` — Expected: FAIL (no such file).

- [ ] **Step 2: Create the manifests** (schema from the plugin docs: marketplace needs `name`, `owner`, `plugins[].name/source`; plugin needs `name`; a plugin's skills are read from `skills/` at its root):
  `.claude-plugin/plugin.json`: `{ "name": "pixi-effects", "version": "0.25.0", "description": "<the first sentence of the skill description>", "author": { "name": "yjmtmtk" }, "homepage": "https://yjmtmtk.github.io/pixi-effects/", "repository": "https://github.com/yjmtmtk/pixi-effects", "license": "MIT" }`
  `.claude-plugin/marketplace.json`: `{ "name": "pixi-effects", "description": "Write a video as data", "owner": { "name": "yjmtmtk" }, "plugins": [ { "name": "pixi-effects", "source": "./", "description": "<same>" } ] }`
  If `claude plugin validate .` (Step 3) rejects `"./"`, ledger a ruling and switch to `"source": { "source": "git-subdir"… }` or move the plugin into `plugins/pixi-effects/` with a symlink-free copy produced by `build-skill` (decide from the validator's message).

- [ ] **Step 3: Validate for real** — Run `claude plugin validate .` — Expected: `✔ Validation passed`. Then in a temp HOME-free way: `claude plugin marketplace add .` and `claude plugin install pixi-effects@pixi-effects`, `claude plugin details pixi-effects` shows `Skills (1)  pixi-effects`; clean up with `claude plugin marketplace remove pixi-effects`.

- [ ] **Step 4: Version in the release routine** — the plugin `version` must move with `package.json`: in `scripts/build-skill.mjs` `writeSkill()` also rewrites `.claude-plugin/plugin.json`'s `version` from `package.json` (and the test above stays green after a bump + `build:ai`). Add this with its own failing assertion first (change the version in a temp copy? simpler: the test already compares `plugin.version` to `pkg.version`).

- [ ] **Step 5: Green + commit** — `npx vitest run tests/docs/Skill.test.ts` PASS; commit ("feat: the Claude Code plugin manifest").

---

### Task 3: Entry points, the changelog, and the real install check

**Files:**
- Modify: `README.md`, `index.html`, `AGENTS.md`, `scripts/build-llms.mjs` (llms.txt "Start here"), `site/guide/ai.md` (the guide's AI page, if the name differs find it with `ls site/guide`), `CHANGELOG.md`, `tests/docs/AgentEntry.test.ts`

- [ ] **Step 1: Failing tests** — in `tests/docs/AgentEntry.test.ts` add: README, AGENTS.md and `llms.txt` each contain `npx skills add yjmtmtk/pixi-effects`; in `tests/docs/Landing.test.ts` add: `index.html` contains it once. Run the two files — Expected: FAIL.

- [ ] **Step 2: Write the lines** (each one line, command first):
  - README, near the top (after the one-sentence request): "Register it as a skill in your AI agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot, OpenCode, …): `npx skills add yjmtmtk/pixi-effects`. Claude Code also: `/plugin marketplace add yjmtmtk/pixi-effects`, then `/plugin install pixi-effects@pixi-effects`. Update with `npx skills update`."
  - landing page: after `cta-note` in the hero: `<p class="cta-note">Or give your agent the skill: <code>npx skills add yjmtmtk/pixi-effects</code></p>` (style with the existing `.cta-note`; keep it on one line on a phone: allow wrap).
  - AGENTS.md: first bullet of "You can run commands": `0. If your agent supports skills: npx skills add yjmtmtk/pixi-effects (the skill is skills/pixi-effects/SKILL.md; the steps below are the same workflow).`
  - `build-llms.mjs`: one bullet in "Start here" with the command; run `npm run build:ai`.
  - guide AI page: one paragraph with both commands and what a skill is.
  - CHANGELOG: `## Unreleased` → **Added**: "Agent skill: `npx skills add yjmtmtk/pixi-effects` registers the skill (generated `skills/pixi-effects/`) in Claude Code, Codex, Cursor and ~70 more; a Claude Code plugin manifest; `movie.audioBlocked`."

- [ ] **Step 3: Green** — `npm run build:ai`, then `npx vitest run tests/docs/AgentEntry.test.ts tests/docs/Landing.test.ts tests/docs/Llms.test.ts tests/docs/Skill.test.ts tests/docs/SiteLinks.test.ts tests/docs/Guide.test.ts` — Expected: PASS. Then `npm run test:fast` — Expected: all pass.

- [ ] **Step 4: The real install check (manual, record the output in the ledger)** — in a temp dir with a temp HOME: `HOME=$(mktemp -d) npx skills add <repo checkout> --list` → lists exactly ONE skill, `pixi-effects`; then `npx skills add <repo checkout> -a claude-code -a codex -a cursor -y` and confirm `.claude/skills/pixi-effects/{SKILL.md,template.html,reference/*,scripts/save-image.py}` and `.agents/skills/pixi-effects/` exist. If `--list` also shows the `ai/SKILL.md`, ledger a ruling: rename it away from the name `SKILL.md` is NOT allowed (it is the source): instead add `metadata:\n  internal: true` to `ai/SKILL.md`'s frontmatter (hidden from discovery) and have `build-skill` drop that key from the copy; add a failing test for the drop first.

- [ ] **Step 5: Commit** — `git add` the explicit paths; commit ("feat: tell agents how to register the skill: README, landing page, AGENTS.md, llms.txt, the guide").

---

## Final review

Dispatch one fresh-context reviewer (most capable model) on the whole range with the Review Focus list above; fix Critical/Important in one pass with RED→GREEN; ledger minors. Do NOT push: the owner says when. After the owner's go: `npm run release:check` is not needed for a docs-only push, but run `npm run test:fast` once more; the next release picks the skill up (`build:ai` already runs in the routine).
