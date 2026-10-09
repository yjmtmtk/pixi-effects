# Agent skill registration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, the owner's standing choice). Steps use checkbox (`- [ ]`) syntax.

**Goal:** `npx skills add yjmtmtk/pixi-effects` (and `/plugin install` in Claude Code) registers pixi-effects as a skill that agents use without being told the library's name.

**Architecture:** The skill becomes the ONE copy: `ai/SKILL.md`, `ai/reference/*`, `ai/template.html`, `ai/tools/save-image.py` move to `skills/pixi-effects/` (no generator, no second SKILL.md). Text is path-neutral (`npx pixi-effects-*`). A `.claude-plugin/` manifest points the plugin at `./skills`. One-line entry points go into README, the landing page, AGENTS.md, llms.txt and the guide.

**Tech Stack:** git mv + sed, vitest, the `skills` CLI (`npx skills`) and `claude plugin validate` for manual checks.

**Spec:** `docs/superpowers/specs/2026-10-10-agent-skill-design.md` (revised: single source)

## Global Constraints

- Breaking changes are fine; no compat shims or redirect stubs. All replies to the owner in Japanese; repo text in English.
- Never `git add -A` (explicit paths; `git mv` for the move); commits end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; do not push until the owner says so.
- Description is **broad**: task words first, the library named in the second sentence; ≤ 1000 characters; never name the closed 3D beta's engine.
- The skill folder must work from `~/.claude/skills/pixi-effects/` and `.agents/skills/pixi-effects/`: no `ai/` path, no `node ai/…`, no `docs/` path, every relative link inside the folder.
- Historical records keep their old paths: `examples/gallery/_notes/*.md`, `CHANGELOG.md` entries before this change, `docs/superpowers/**`.
- Speed rule: iterate with the targeted test files; `npm run test:fast` once at the end of each task.

## Review Focus

- A moved file that something still reads at the old path (a test, a script, the playground, `stage-site`) fails loudly, not silently: after Task 1 `grep -rn "ai/SKILL.md\|ai/reference/\|ai/template.html" ` outside the historical paths is EMPTY.
- The release routine bumps the template pin: its file list must name `skills/pixi-effects/template.html`, and the Skill test fails if the pin, the "Written for" line, `plugin.json` and `package.json` disagree.
- `npx skills add <checkout> --list` shows exactly ONE skill (no `ai/SKILL.md` left behind).
- The plugin manifest `name` equals the marketplace entry `name`; `claude plugin validate .` passes.
- Everything SKILL.md tells an agent to run works from an installed folder (read each command once; `python3 scripts/save-image.py`, `npx pixi-effects-check`, the template copy).

---

### Task 1: Move the skill and fix every reference

**Files:**
- Move (`git mv`): `ai/SKILL.md` → `skills/pixi-effects/SKILL.md`; `ai/reference/` → `skills/pixi-effects/reference/`; `ai/template.html` → `skills/pixi-effects/template.html`; `ai/tools/save-image.py` → `skills/pixi-effects/scripts/save-image.py`
- Modify: every non-historical file that names the old paths: `AGENTS.md`, `README.md`, `ai/CHAT.md`, `ai/tools/{check,render,view}.mjs`, `docs/dsl.md`, `examples/gallery/{BRIEF.md,MODELS.md,index.html}`, `examples/{index.html,music-lab.html,playground/app.js}`, `examples/showreel/BRIEF.md`, `index.html`, `scripts/{build-llms.mjs,site-parts.mjs,test-changed.mjs}`, `site/guide/with-ai.md`, `site/landing/{FACTS.md,NOTES.md}`, `skills/pixi-effects/reference/pitfalls.md`, tests `tests/{core/ease,docs/{AgentEntry,Guide,Llms,MusicDocs,Recipes,SfxDocs},playground/mcp,tools/testChanged}.test.ts`; `package.json` (`files` gains `"skills"`)
- Generated, regenerate: `llms.txt`, `llms-full.txt` (`npm run build:ai`)

**Interfaces:** Produces the new paths every later task uses: `skills/pixi-effects/{SKILL.md,template.html,reference/{cheatsheet,pitfalls,recipes}.md,scripts/save-image.py}`.

- [ ] **Step 1: Capture the reference list** — `grep -rnE "ai/(SKILL\.md|reference/|template\.html|tools/save-image)" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=superpowers --exclude-dir=.superpowers --exclude-dir=.claude --exclude-dir=_notes --exclude=CHANGELOG.md > /private/tmp/claude-501/refs-before.txt`; note the count (the "red" state: these must all change).
- [ ] **Step 2: Move** — `mkdir -p skills/pixi-effects/scripts && git mv ai/SKILL.md skills/pixi-effects/SKILL.md && git mv ai/reference skills/pixi-effects/reference && git mv ai/template.html skills/pixi-effects/template.html && git mv ai/tools/save-image.py skills/pixi-effects/scripts/save-image.py`
- [ ] **Step 3: Rewrite the references** — within the files above, replace `ai/SKILL.md`→`skills/pixi-effects/SKILL.md`, `ai/reference/`→`skills/pixi-effects/reference/`, `ai/template.html`→`skills/pixi-effects/template.html`, `ai/tools/save-image.py`→`skills/pixi-effects/scripts/save-image.py` (BSD sed: `sed -i ''`). Inside the moved SKILL.md and `template.html`, relative links such as `reference/cheatsheet.md` and `template.html` stay as they are (they were relative to `ai/`, and the folder keeps the same shape). Fix `scripts/build-llms.mjs` reads (`ai/SKILL.md` etc.), `scripts/site-parts.mjs`, `scripts/test-changed.mjs` path table, the pin-bump list wherever it is recorded (memory `project_state-*` and any script: `grep -rn "template.html" scripts memory-notes`).
- [ ] **Step 4: Verify the grep is empty** — rerun Step 1's grep: Expected: no output. Then `npm run build:ai`.
- [ ] **Step 5: Targeted tests** — `npx vitest run tests/docs tests/tools tests/playground tests/core/ease.test.ts 2>&1 | tail`: Expected: PASS. Fix what fails (a test that hardcodes the old path is part of this task).
- [ ] **Step 6: `npm run test:fast`** — Expected: all pass. Commit: `git add` explicit paths (`git add -u` is not allowed; list them from `git status --short`), message "refactor: the skill lives in skills/pixi-effects/ (the one place an agent installs it from)".

---

### Task 2: Make the skill install-safe and broad

**Files:**
- Modify: `skills/pixi-effects/SKILL.md`, `skills/pixi-effects/template.html` (only if it names repo paths)
- Create: `tests/docs/Skill.test.ts`

- [ ] **Step 1: Failing test** (`tests/docs/Skill.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(__dirname, '../..');
const dir = resolve(root, 'skills/pixi-effects');
const read = (p: string) => readFileSync(join(dir, p), 'utf8');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string };
const walk = (d: string): string[] => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]);

describe('skills/pixi-effects — what an agent installs', () => {
  const skill = read('SKILL.md');
  const fm = /^---\nname: ([^\n]+)\ndescription: ([^\n]+)\n---\n/.exec(skill);

  it('is the only SKILL.md in the repository outside node_modules and the historical paths', () => {
    const found = walk(root).filter(f => f.endsWith('/SKILL.md') && !/node_modules|\/\.git\/|\/\.claude\/|\/dist\//.test(f));
    expect(found.map(f => f.slice(root.length + 1))).toEqual(['skills/pixi-effects/SKILL.md']);
  });

  it('has the frontmatter every agent reads: name = folder, a broad description of at most 1000 characters', () => {
    expect(fm).not.toBeNull();
    expect(fm![1]).toBe('pixi-effects');
    expect(fm![2]!.length).toBeLessThanOrEqual(1000);
    for (const w of ['video', 'motion graphics', 'animated title', 'lower third', 'promo', 'chart', 'slideshow']) expect(fm![2]!.toLowerCase(), w).toContain(w);
  });

  it('names the library in its second sentence, so a user of another tool can see why it fired', () => {
    expect(fm![2]!.split(/(?<=\.)\s/)[1]).toContain('pixi-effects');
  });

  it('says which version it was written for, and the template pins that version', () => {
    expect(skill).toContain(`Written for pixi-effects ${pkg.version}`);
    expect(read('template.html')).toContain(`pixi-effects@${pkg.version}/dist/index.js`);
  });

  it('has no path that only exists inside the repository', () => {
    for (const f of walk(dir)) {
      if (!/\.(md|html|py)$/.test(f)) continue;
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/node ai\/|ai\/tools\/|ai\/reference\/|ai\/template|\.\.\/\.\.\/dist|docs\/dsl\.md/);
    }
  });

  it('every file SKILL.md points to is in the folder, and it stays under 500 lines', () => {
    expect(skill.split('\n').length).toBeLessThan(500);
    for (const m of skill.matchAll(/`((?:reference|scripts)\/[\w./-]+|template\.html)`/g)) expect(existsSync(join(dir, m[1]!)), m[1]).toBe(true);
  });
});
```
  Run `npx vitest run tests/docs/Skill.test.ts` — Expected: FAIL (description not broad, repo paths, no version line).

- [ ] **Step 2: Edit SKILL.md** — (a) `description:` one line ≤ 1000 chars: sentence 1 = the tasks (`Use when asked to make, animate, preview or export a video, motion graphics, an animated title, a lower third, kinetic type, a promo, a slideshow with transitions, an animated chart or data story, a social clip, a 2.5D / depth scene, or music and sound for a video, written as code in JavaScript or HTML.`); sentence 2 = `pixi-effects is a JS library where a video is a plain-object composition (text, shape, image, video, audio and file-free sfx / music, camera, light and shader layers with keyframes) that plays in the browser, is checked by a tool the agent can run, and exports MP4 / WebM / MOV with no server.` (b) directly after the frontmatter: `> Written for pixi-effects 0.25.0. Update the skill with \`npx skills update\`; the newest docs are at https://yjmtmtk.github.io/pixi-effects/` (c) commands: `npx pixi-effects-check my-video.html`, `npx pixi-effects-render my-video.html -o my-video.mp4`, `npx pixi-effects-view my-video.html`, `python3 scripts/save-image.py`; delete the "or `node ai/tools/…` in this repository" halves (AGENTS.md carries the repo forms); (d) `docs/dsl.md` → `https://yjmtmtk.github.io/pixi-effects/docs/dsl.md` (and in `reference/*.md` the same, if they name it).
- [ ] **Step 3: Green** — `npx vitest run tests/docs/Skill.test.ts` PASS (6 tests); also `tests/docs/{Llms,Recipes,AgentEntry}.test.ts`. Mutation check: change `"name: pixi-effects"` → `pixi` in the file: the name test FAILS; restore.
- [ ] **Step 4: Pin bump awareness** — find where the release routine lists the pin files (`git log -p --stat -S"0.22.0" -- ai/template.html | head`, or the memory note) and make sure `skills/pixi-effects/SKILL.md` ("Written for …") and `skills/pixi-effects/template.html` are in it; write the file list into `CHANGELOG`-adjacent notes only if a script owns it (otherwise the Skill test is the guard).
- [ ] **Step 5: Commit** — explicit paths; "feat: the skill's description is broad (the tasks first), its commands work from an installed folder, a test guards both".

---

### Task 3: The Claude Code plugin manifest

**Files:** Create `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`; modify `tests/docs/Skill.test.ts`.

- [ ] **Step 1: Failing test** — append:

```ts
describe('the Claude Code plugin manifest', () => {
  const plugin = JSON.parse(readFileSync(resolve(root, '.claude-plugin/plugin.json'), 'utf8'));
  const market = JSON.parse(readFileSync(resolve(root, '.claude-plugin/marketplace.json'), 'utf8'));
  it('is one plugin under one name, at the package version, whose skills folder exists', () => {
    expect(plugin.name).toBe('pixi-effects');
    expect(plugin.version).toBe(pkg.version);
    expect(market.plugins.map((p: { name: string }) => p.name)).toEqual([plugin.name]);
    expect(market.plugins[0].source).toBe('./');
    expect(market.owner?.name).toBeTruthy();
    expect(existsSync(join(root, 'skills/pixi-effects/SKILL.md'))).toBe(true);
  });
});
```
  Run — Expected: FAIL (files missing).
- [ ] **Step 2: Create the manifests** — `plugin.json`: `{ "name": "pixi-effects", "version": "0.25.0", "description": "<sentence 1 of the skill description>", "author": { "name": "yjmtmtk" }, "homepage": "https://yjmtmtk.github.io/pixi-effects/", "repository": "https://github.com/yjmtmtk/pixi-effects", "license": "MIT" }`; `marketplace.json`: `{ "name": "pixi-effects", "description": "Write a video as data", "owner": { "name": "yjmtmtk" }, "plugins": [ { "name": "pixi-effects", "source": "./", "description": "<same>" } ] }`.
- [ ] **Step 3: Validate for real** — `claude plugin validate .` → `✔ Validation passed`. If `"./"` is refused, ledger a ruling and pick the smallest valid form from the validator's message (e.g. a `plugins/pixi-effects/` plugin root whose `skills` is a real folder is NOT allowed: it would duplicate SKILL.md; prefer `git-subdir` or the plugin's `skills` path field pointing to `./skills`). Then `claude plugin marketplace add .`, `claude plugin install pixi-effects@pixi-effects`, `claude plugin details pixi-effects` shows `Skills (1)  pixi-effects`; clean up: `claude plugin uninstall pixi-effects@pixi-effects` and `claude plugin marketplace remove pixi-effects`.
- [ ] **Step 4: Green + commit** — Skill test PASS; commit "feat: the Claude Code plugin manifest (the repository is the plugin, skills/ is its skill)".

---

### Task 4: Entry points, changelog, and the real install check

**Files:** Modify `README.md`, `index.html`, `AGENTS.md`, `scripts/build-llms.mjs`, `site/guide/with-ai.md`, `CHANGELOG.md`, `tests/docs/AgentEntry.test.ts`, `tests/docs/Landing.test.ts`; regenerate `llms*.txt`.

- [ ] **Step 1: Failing tests** — AgentEntry: README, AGENTS.md and `llms.txt` contain `npx skills add yjmtmtk/pixi-effects`; Landing: `index.html` contains it once. Run both — Expected: FAIL.
- [ ] **Step 2: The lines** (one line each, the command first): README near the top — "Register it as a skill in your agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot, OpenCode, …): `npx skills add yjmtmtk/pixi-effects`. Claude Code also: `/plugin marketplace add yjmtmtk/pixi-effects` then `/plugin install pixi-effects@pixi-effects`. Update: `npx skills update`." Landing hero, after `cta-note`: `<p class="cta-note">Or give your agent the skill: <code>npx skills add yjmtmtk/pixi-effects</code></p>` (wraps on a phone, check with a screenshot). AGENTS.md first bullet under "You can run commands": "0. If your agent supports skills, `npx skills add yjmtmtk/pixi-effects` installs this workflow (`skills/pixi-effects/SKILL.md`); inside THIS repository run the tools as `node ai/tools/check.mjs …` / `render.mjs` / `view.mjs`." `build-llms.mjs` "Start here": one bullet. Guide `with-ai.md`: a short "Install the skill" paragraph. CHANGELOG `## Unreleased` → **Added**: the skill, the plugin manifest, `movie.audioBlocked`; **Changed**: the skill files moved from `ai/` to `skills/pixi-effects/` (old raw URLs under `ai/SKILL.md` and `ai/reference/` no longer exist).
- [ ] **Step 3: Green** — `npm run build:ai`; `npx vitest run tests/docs/AgentEntry.test.ts tests/docs/Landing.test.ts tests/docs/Llms.test.ts tests/docs/Skill.test.ts tests/docs/SiteLinks.test.ts tests/docs/Guide.test.ts` PASS; `npm run test:fast` all pass.
- [ ] **Step 4: The real install check (record the output in the ledger)** — in a temp dir with a temp HOME: `HOME=$(mktemp -d) npx skills add <checkout> --list` → exactly ONE skill `pixi-effects`; `npx skills add <checkout> -a claude-code -a codex -a cursor -y` → `.claude/skills/pixi-effects/{SKILL.md,template.html,reference/*,scripts/save-image.py}` and `.agents/skills/pixi-effects/` exist; open the installed `SKILL.md` and read every command once (all `npx pixi-effects-*`, no repo path). A landing-page screenshot at 390 px width shows the new line wrapping cleanly.
- [ ] **Step 5: Commit** — explicit paths; "feat: tell agents how to register the skill (README, landing page, AGENTS.md, llms.txt, the guide, the changelog)".

---

## Final review

One fresh-context reviewer (most capable model) over the whole range, with the Review Focus list; Critical/Important fixed in one pass with RED→GREEN; minors ledgered. Do NOT push: the owner says when.
