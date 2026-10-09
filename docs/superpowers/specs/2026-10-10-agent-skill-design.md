# Agent skill registration — design

Date: 2026-10-10 · Status: draft for the owner's review

## Goal

An AI coding agent (Claude Code, Codex, Cursor, Gemini CLI, Copilot, OpenCode, … ) registers pixi-effects as a **skill with ONE command**, and from then on
uses it **without being told the library's name**: "make a promo video", "animate this chart", "a lower third in HTML" reach the skill.

```
npx skills add yjmtmtk/pixi-effects
```

## What exists

- `ai/SKILL.md` (57 lines, 17 KB) already has `name` + `description` frontmatter and the workflow; `ai/reference/{cheatsheet,pitfalls,recipes}.md` (143 KB,
  read on demand), `ai/template.html`, `ai/tools/*` (also shipped as the bins `pixi-effects-check|render|view`).
- It sits in `ai/`, which the `skills` CLI does not search (it searches the repository root, `skills/<name>/`, `.claude/skills/`, `.agents/skills/` and ~60
  other agent folders, 3 levels deep; flat `skills/<name>/SKILL.md` is the standard layout).
- Its text says `node ai/tools/check.mjs`: right inside this repository, wrong in an installed skill (`~/.claude/skills/pixi-effects/` has no `ai/tools`).

## Decisions (owner, 2026-10-10)

- **The description is broad (option A):** it triggers on the *task* (video, motion graphics, animated title / lower third / chart, promo, slideshow with
  transitions), not only on the library's name. Cost accepted: it may also fire for people who use another tool.

## Design

1. **One source, one generated copy.** `ai/` stays the source of truth. `scripts/build-skill.mjs` writes `skills/pixi-effects/` and the copy is committed
   (GitHub is what `npx skills add` reads, so it must exist in the tree):
   ```
   skills/pixi-effects/
     SKILL.md                 ← ai/SKILL.md, paths rewritten (below)
     template.html            ← ai/template.html (loads the released library from the CDN, so it works from any folder)
     reference/cheatsheet.md pitfalls.md recipes.md  ← ai/reference/*
     reference/dsl.md         ← docs/dsl.md (SKILL.md points to it)
     scripts/save-image.py    ← ai/tools/save-image.py
   ```
   Rewrites: `node ai/tools/check.mjs` → `npx pixi-effects-check`, `render.mjs` → `npx pixi-effects-render`, `view.mjs` → `npx pixi-effects-view`;
   `ai/tools/save-image.py` → `scripts/save-image.py`; `docs/dsl.md` → `reference/dsl.md`. `build:ai` runs it too, so the existing release routine
   (bump pins → `build:ai`) keeps the copy current; no new step to remember.
2. **The description** (≤ 1000 characters, the 1,536-character listing limit of Claude Code leaves room): first the task words a user would say
   (video, motion graphics, animated title, lower third, kinetic type, promo, slideshow, animated chart, data story, social clip, 2.5D / depth, music or
   sound for a video), then what the skill does (a video as plain data, JS/HTML, plays in the browser, exports MP4/WebM/MOV, checked by a tool). The
   same text is the source in `ai/SKILL.md`, so `ai/` and the skill never differ.
3. **Claude Code plugin manifest** (`.claude-plugin/marketplace.json` + `plugin.json`, skills path `./skills`), so `/plugin marketplace add
   yjmtmtk/pixi-effects` + `/plugin install` also work. Exact schema: read the plugin docs while planning (not verified yet).
4. **npm package**: add `skills` to `files`, so an agent that finds `node_modules/pixi-effects/skills/pixi-effects/` can copy or point at it.
5. **Entry points** (one line each, the command first): README, the landing page (next to "tell any AI one sentence"), `AGENTS.md`, `llms.txt` /
   `llms-full.txt`, the guide's AI page.

## Tests

- `tests/docs/Skill.test.ts` (units, fast): the committed `skills/pixi-effects/` equals what `build-skill` makes (stale = fail, like the llms test);
  frontmatter valid for every agent (`name` = folder, lowercase-hyphen; `description` ≤ 1000 chars, contains the task words); no `ai/tools/` or
  `node ai/` left; every relative path in SKILL.md exists in the folder; SKILL.md under 500 lines; `template.html` pins the package version.
- A manual check (recorded in the plan, not CI): `npx skills add <local checkout> --list` in a temp HOME finds exactly one skill, and `-a claude-code -a
  codex -a cursor` installs it with its files into `.claude/skills/` and `.agents/skills/`.

## Out of scope

Per-agent rule files (Cursor `.mdc`, Copilot instructions, `GEMINI.md`): the skill covers them through the CLI. An MCP server. Uploading to a skills API.
A command of our own that installs the skill (the CLI already does).

## Risks

- **Over-trigger** (accepted by the owner): mitigated by naming the library in the first line of the description's second sentence, so a user of another
  tool can see why it fired; the description says "when the user wants a video written as code in JavaScript / HTML", not "any video".
- **Stale installs**: an installed copy does not follow `main`; `npx skills update` does. The README line says so.
- **Template pin**: the copy's `template.html` pins the released version; between a release and the next one `main` may document unreleased features. The
  SKILL.md's first line says which version it was written for.
