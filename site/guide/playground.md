---
title: Playground
section: Guides
order: 12
summary: Write a video in the browser, run it, see what the library finds, share it as a link, and let an AI in your browser drive it.
---

The [Playground](../examples/playground.html) is the quickest way to try pixi-effects: an editor on the left, the movie on the right, and under them a list of what the library found wrong. Nothing to install.

## What is on the page

- **The editor** holds one block of code, the same block an AI edits when it works in a chat (the part of [`ai/chat-template.html`](https://raw.githubusercontent.com/yjmtmtk/pixi-effects/main/ai/chat-template.html) between `EDIT FROM HERE` and `EDIT UNTIL HERE`): `const W, H, FPS, DURATION`, `BACKGROUND`, `sequences`, `POSTER`. Whatever an AI wrote in a chat can be pasted straight in, and what you write here can be saved as the chat template's page.
- **Run** (⌘↵ or Ctrl+↵) builds a fresh movie from the code. The twelve examples in the menu are the starting points; each one runs without a warning.
- **Problems** is what `movie.review()` finds, the same judgement as [`pixi-effects-check`](review.html): the library's warnings (each says what to change), text cut off by an edge or outside the canvas, fonts that are not available, and the sound's problems. Things that are often intentional (text that overlaps other text) are listed apart, "to look at". **Show** jumps the preview to the first frame where it happens.
- **Share link** copies a link that carries your code in its address (packed in the `#code=` part, so no server is involved). **Save HTML** downloads the video as one HTML file that runs on its own (a piece that uses the examples' own files, such as `_assets/green.mp4`, loads them from this site, so it needs to be online). **Copy for AI** copies the code with a sentence that tells an AI how to change it.

## Safe to open a link

Code from a link **is never run when the page opens**. You see the code and a note ("A shared link was opened: read the code, then press Run"); it runs when you press Run. A link that unpacks to more than 200 KB, or that is not a link of this page (a character lost or added when it was copied), is refused with a message.

A movie whose code never finishes starting (an endless loop) is given up on after 70 s, and a command it does not answer after 120 s, so the page and an AI agent are never stuck: press Run to start again.

The code runs inside an `iframe` with no origin (`sandbox="allow-scripts allow-downloads"`), so it can neither reach the Playground's page nor this site's stored data. The page and the movie talk through eight fixed commands (status, play, pause, seek, review, look, onion, render) and nothing else.

Running again builds the movie again: 0.2 to 0.3 s for a title, 0.4 to 0.6 s for a piece with a video file (measured in headless Chrome on the author's machine, the libraries already cached).

## For an AI in your browser: WebMCP

[WebMCP](https://github.com/webmachinelearning/webmcp) lets a page offer tools to an AI agent in the browser. Where the browser has it, the Playground offers ten, so an agent can write a video, run it, read what is wrong, look at it and fix it, without you pasting anything back:

| Tool | What it does |
|---|---|
| `get_docs` | the cheatsheet, recipes or pitfalls of this library (read the cheatsheet first) |
| `list_examples`, `load_example` | the twelve examples, and loading one |
| `get_code`, `set_code` | read the editor; replace it and run it |
| `run` | run the code again: ready or not, the warnings, the duration and size |
| `check` | the review: layout problems, fonts, sound as numbers |
| `look` | a picture: a contact sheet, or the frames at moments such as `3.5`, `50%`, `title@end` |
| `onion` | one picture of how things move between two moments |
| `render_draft` | a quick low-quality export, to prove that export works |

The tools run one at a time. A mistake in an argument comes back as an error that says what is wrong. The page shows "AI agent tools: 10" when they are on, and says so when the browser has no WebMCP.

**Checked with Chrome 154 on 2026-10-08**, started with `--enable-features=WebMCP`. The standard is still being written, so names and shapes may change; only the thin layer in [`examples/playground/mcp.js`](https://github.com/yjmtmtk/pixi-effects/blob/main/examples/playground/mcp.js) that registers the tools would have to follow.

Without WebMCP the loop still works the old way: an AI in a chat writes the block, you run it, and a red box under the picture has the warnings to paste back (see [Working with an AI](with-ai.html)).
