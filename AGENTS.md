# AGENTS.md — you were asked to make a video with this repository

Do not read the whole repository.

## You can run commands (a shell, Node 22, Chrome)

Read `skills/pixi-effects/reference/quickstart.md` (2 KB; `npx pixi-effects quickstart` prints it) and `skills/pixi-effects/SKILL.md` (6 KB): the commands and the facts you cannot guess. Then `npx pixi-effects new my-video`, edit the composition, `npx pixi-effects check my-video.html` (it writes `check-out/<name>/`; look at its contact sheet) and `npx pixi-effects render my-video.html -o my-video.mp4`. For anything else ask the docs: `npx pixi-effects help <word>`, `npx pixi-effects recipe [id]`. `npx skills add yjmtmtk/pixi-effects` installs the same as a skill. Inside THIS repository the tools are `node ai/tools/pixi-effects.mjs …` (`npm i pixi-effects` and `node node_modules/pixi-effects/ai/tools/…` when `npx` prints nothing).

### If your shell is a sandbox that is not the person's computer

A chat's code execution is a container (often root, a weak CPU, no CDN): Chrome stalls there and `check` only says "timed out" after minutes. No `npx`, no `npm`, no check / render / view: follow the chat way below. Do not start Chrome or render there: give the person the page as it is (its CDN imports load in their browser); they export with the download button of the player bar, and warnings come back from the page's red box. If something stalls, stop after two tries and say what you did not check.

## You can only write text (a browser chat)

Fetch https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/CHAT.md and follow it.

## If you are changing the library itself

Read `docs/development.md`.
