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

## Design (revised the same day: ONE source, no generated copy)

The first draft generated `skills/pixi-effects/` from `ai/`. That leaves two `SKILL.md` in the tree (an agent reading the repository sees both; the
`skills` CLI may list both) and a staleness test to keep them equal. The owner's first rule is "clear for the AI, no failure, nothing wasted", so the
skill itself becomes the only copy:

1. **Move, do not copy.** `ai/SKILL.md`, `ai/reference/*`, `ai/template.html` and `ai/tools/save-image.py` move to `skills/pixi-effects/` (`SKILL.md`,
   `reference/`, `template.html`, `scripts/save-image.py`). `ai/` keeps what is not part of the skill: `CHAT.md`, `chat-template.html`, `tools/` (the
   npm bins). Old raw URLs under `ai/SKILL.md` and `ai/reference/` stop working (breaking changes are fine; the in-repo links, `llms.txt` and the
   guide are updated).
2. **Path-neutral text.** Commands read `npx pixi-effects-check|render|view` everywhere (in this repository `AGENTS.md` says the local `node
   ai/tools/*.mjs` forms). The full DSL reference is not copied into the skill: SKILL.md points to the cheatsheet (every layer, prop and default) and to
   `https://yjmtmtk.github.io/pixi-effects/docs/dsl.md` for the long form.
3. **The description** (≤ 1000 characters): the task words first (video, motion graphics, animated title, lower third, kinetic type, promo, slideshow
   with transitions, animated chart or data story, social clip, 2.5D / depth, music or sound for a video), then one sentence that names pixi-effects.
   First line of the body: `Written for pixi-effects <version>.`; `template.html` pins the same version (a test compares both with `package.json`,
   so a release that forgets them fails).
4. **Claude Code plugin manifest** (`.claude-plugin/marketplace.json` + `plugin.json`, the plugin root is the repository, skills are read from `skills/`).
5. **npm package**: `files` gains `skills`.
6. **Entry points** (one line each, the command first): README, the landing page (next to "tell any AI one sentence"), `AGENTS.md`, `llms.txt`, the
   guide's AI page.

## Tests

- `tests/docs/Skill.test.ts`: frontmatter valid for every agent (`name` = folder; `description` ≤ 1000 chars, the task words, the library named in the
  second sentence); no `ai/` path and no `node ai/` in the skill folder; every relative path in SKILL.md exists; SKILL.md under 500 lines; the version
  line and the template pin equal `package.json`; the plugin manifests agree with the package.
- Manual (in the plan): `npx skills add <local checkout> --list` in a temp HOME lists exactly ONE skill; `-a claude-code -a codex -a cursor` installs the
  folder into `.claude/skills/` and `.agents/skills/`; `claude plugin validate .`.

## Out of scope

Per-agent rule files (Cursor `.mdc`, Copilot instructions, `GEMINI.md`): the skill covers them through the CLI. An MCP server. Uploading to a skills API.
A command of our own that installs the skill (the CLI already does).

## Risks

- **Over-trigger** (accepted by the owner): the description names the library in its second sentence, so a user of another tool can see why it fired.
- **Stale installs**: an installed copy does not follow `main`; `npx skills update` does. SKILL.md's first line says which version it was written for.
- **Path churn**: about 25 non-historical files mention the moved paths; the old notes under `examples/gallery/_notes/` are records and keep the old paths.
