# AGENTS.md — if you were asked to make a video with this repository

The person said something like "Use https://github.com/yjmtmtk/pixi-effects to make a video: …". Do NOT read the whole repository. Follow the path that matches what you can do.

## You can run commands (a shell, Node 22, Chrome): Claude Code, Codex, Cursor, …
1. Read `skills/pixi-effects/SKILL.md` (the workflow and the rules that cause most failures), then `skills/pixi-effects/reference/cheatsheet.md`. Copy a block from `skills/pixi-effects/reference/recipes.md` when one fits; `skills/pixi-effects/reference/pitfalls.md` lists real mistakes.
2. Start from `skills/pixi-effects/template.html`: copy it next to the person's work and edit the composition. It loads the released library from a CDN, so the file works from any folder (no install needed).
3. A video is plain data: a tree of plain objects (`text`, `shape`, `image`, `audio` with `sfx` or `music`, nested `composition`s, a `camera`) with `at` / `duration` / `initial` / `keyframes`. You never write per-frame code. Sound needs no files: `sfx` for effects, `music` for a tune written as text.
4. Check your work like a reviewer, in a loop: `npx pixi-effects-check your-video.html --out check-out` (or `node ai/tools/check.mjs your-video.html --out <a folder outside the repository>` inside this repository; without `--out` it writes `check-out/` into the current folder). It reports library warnings (each says what to change), layout problems, sound problems and a real export; it writes a contact sheet PNG: LOOK at it (open the image) before you say you are done.
5. Export: `npx pixi-effects-render your-video.html -o your-video.mp4`, or the download button in the player bar.

## You can only write text (a browser chat with no shell, no files)
Fetch https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/CHAT.md and follow it. It tells you to copy `ai/chat-template.html` (one self-contained page that runs in a preview and shows every warning in a red box for the person to paste back), gives a worked example and the rules, and explains how the person gets the MP4. If your browser exposes WebMCP tools, the Playground (https://yjmtmtk.github.io/pixi-effects/examples/playground.html) offers `set_code` / `run` / `check` / `look` so you can verify your own work without a person pasting warnings back.

## Always
- Look before you claim: a contact sheet, `movie.inspect(frame)` and `movie.inspectAudio()` are built in; the library cannot tell you the video is good, only that nothing is broken.
- While you iterate, do not export the whole movie: `check --no-export --at <the moment you changed>` (seconds), `render --range 10:15` or `--scene name` for a part; one full `check` at the end.
- Ask the person only for what you cannot decide (what to show, the mood, the length); pick sizes, colours, timing and sound yourself.
- Full docs for an AI in one file: https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/llms-full.txt (the index is `llms.txt`).

## If you are changing the library itself
`npm install`, `npm run build`, then test in the order of cost: `npm run test:fast` (units, about 20 s), `npm run test:changed` (the units plus only the browser tests the changed files need; `-- --dry` says which; anything it does not know runs everything), `npm run release:check` (the whole suite, once, before a release). To see whether a change altered any picture the repository shows (the gallery and the examples), draw the pages with `node scripts/compare-frames.mjs capture --root <a tree with a built dist/> --pages <list> --out <dir>` for the old and the new tree, and `compare <dirBefore> <dirAfter>` (64 pages in about 70 s with 4 tabs, hashes first, pixels only for the frames that differ; the same build twice already differs by 1/255 on a few pages). After `npm publish`, `npm run post-publish:check` (npm, jsDelivr and only the tests that load the release from the CDN: under a minute). The real-browser tests need Chrome and a built `dist/` (rebuild after changing `src/`); they share one browser per worker, a tab per test (`PE_FRESH_BROWSER=1` starts one per test again). Read `docs/philosophy.md` first: a composition is data; every layer shares one vocabulary; time is deterministic. Docs are generated: `npm run build:ai`, `npm run guide`.
