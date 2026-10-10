# Directing a film (for any AI that makes video with code)

Read this before you write a composition for anything longer than a title card: a product film, a company introduction, a launch, a data story. It is about the decisions around the renderer, so it names no tool; `SKILL.md` has the pixi-effects commands.

A one-line prompt makes the model fill every missing decision with its safest default: large text in the middle, a gradient behind it, everything fading in, the logo last. The fix is not a cleverer prompt. It is to remove the missing decisions before anything is drawn, and to judge what was drawn with evidence.

## The five layers (do not collapse them into one step)

| Layer | The question | Where the answer lives |
|---|---|---|
| Director | What is the film trying to say, to whom? | `brief.md` |
| Reference | What should it look and feel like? | `style-guide.md` |
| Timeline | What changes at each beat, and why? | `shotlist.md` |
| Renderer | How is every frame produced? | `src/` (seekable code) |
| Critic | What failed, exactly where, and why? | `reviews/` |

## Keep the decisions in files, not in the chat

A film whose only record is a conversation is a lucky session. Put the decisions where the next run can read them:

```
film/
  brief.md        the one-sentence goal, the audience, the product facts, the real assets
  style-guide.md  palette, type, motion rules, banned defaults
  shotlist.md     beats, states, timestamps, purpose
  assets/         approved logos, photos, screens, footage, sound
  src/            the composition and its code
  reviews/        contact sheets and defect notes
  out/            exports
```

The next film swaps the brief and the assets and keeps the rest. A run that stops can resume from the last file it finished and say which one is missing; "the last command exited 0" is never the definition of done.

## brief.md: facts about the product, choices about the film

Separate what is true (it comes from the product) from what is chosen (it comes from you). The model may invent a camera move or a stronger opening. It may not invent a dashboard, a figure, a logo or a client.

```
FILM
One sentence: what the viewer should remember
Audience:     who it is for
Duration:     seconds
Formats:      ask the human; one format unless they name more (see "Formats" below)

ASSETS (paths; everything on screen comes from here)
Logo · photos · screens · copy and numbers · brand type and colours · sound reference

VISUAL RULES
Keep:   traits taken from the reference
Avoid:  the clichés you will not use
Never:  invent a product screen, a metric, a claim or a logo

DELIVERABLES
Final video, poster frame, contact sheets, source, an asset list, a note on what a human still has to check
```

**Collect the assets first, list them, and read the list before building.** If the brief needs an asset that is missing, stop and ask. A convincing fake (a drawn logo, an invented dashboard, a guessed number) is the one failure that cannot be repaired afterwards. Words and numbers on screen are the source's own; take colours and type from the source itself (a site's CSS, a brand sheet), never from an adjective such as "premium".

## style-guide.md: a visual grammar written down

Without one the model supplies its own, which is why unrelated one-prompt films look related. Give it a frame, a film or the real site, and make it write what it saw:

```
REFERENCE ANALYSIS
Palette:      the actual colours (hex), not an adjective
Typography:   family, weight, scale
Composition:  where the eye goes first
Pacing:       average time between meaningful changes
Motion:       snap, glide, overshoot, cut or hold
Texture:      grain, paper, glass, flat
DO NOT COPY:  the reference's subjects, logos, copy or product imagery
```

The result is a style guide, not a collage of borrowed shots. Add a **motion rule per class of object**, because "motion with weight" is the difference between decoration and direction: small controls snap, large panels settle, the camera is almost invisible, headlines enter strongly and then hold long enough to read, one playful object is allowed to overshoot. If everything overshoots, nothing feels precise. After each move ask: does the viewer know where to look?

## shotlist.md: states and beats, not effects

"Zoom in, then morph, then add particles" lists activity. A plan says what the viewer knows at each moment:

```
00-02  HOOK     one image that earns attention
02-05  PROBLEM  the friction, shown, not described in a paragraph
05-09  REVEAL   the product enters through a real interaction
09-13  PROOF    one screen or number that demonstrates the claim
13-16  CLOSE    a clean final state and a readable call to action
```

Each row has an entry state, an exit state and a reason to exist. For a UI film write the state list first (SEARCH → RESULT → DETAIL → ACTION → CONFIRMATION) so one component can change size, colour and content while staying recognisably the same object. The shot list is a contract: a shot nobody can justify is cut.

## Seekable and deterministic, or it cannot be reviewed

Frame 240 must render directly, without replaying frames 0 to 239: no hidden clock, no unseeded randomness, nothing that only works after eight seconds of running. Think of a frame as a query: `frame = render(time, shotlist, assets, style, seed)`. Then a revision is local (change one time value, one curve, one asset) and a reviewed frame stays reviewed. Two renders of the same moment must give the same pixels; check it.

## Sound is on the same timeline

Many AI films look finished with the sound off; then the click lands after the button, the cut misses the beat, the logo arrives before the music resolves. Write a beat grid and drive picture and sound from it: choose a tempo whose bar is a round number of seconds, put every cut on a bar line and every cue on the beat it belongs to. With a licensed or original track, measure its beats and cut against them. Test: close your eyes and listen; if the film has no shape without the picture, the sound is not finished.

## Review the rendered frames, not your intent

Do not start by watching a full export ten times, and do not describe what you meant to make. Ask the renderer for a contact sheet: one frame at every beat, a short strip around the fastest transitions, and a frame from the middle of each cut taken from the exported file. Look cold, then write the **three largest defects**, each with a **timestamp**, the **evidence** (what you see) and a **local fix**; patch only those, render those frames again. Ask for a second pair of eyes on the sheet whenever one is available: the author reads their own intent into it.

```
[ ] text readable at phone size (about 34 px or more on a 1080p frame)
[ ] nothing in the outer 5 % of the frame
[ ] real assets only, none redrawn or invented
[ ] one type and colour system across scenes
[ ] no awkward half-transition frame
[ ] cuts and sound cues land together
[ ] the first two seconds are a real hook
[ ] the last frame works as a poster
```

"The agent made a video" stops when the file exists. "The agent directed a video" stops when the evidence says the film works.

## Formats

A 16:9 film and a 9:16 cut are different compositions: the vertical one needs larger type, fewer things at once, another layout, sometimes a tighter story. Never crop the middle of the wide one. **Do not make a format nobody asked for:** ask which formats are wanted, make one if the answer is "whatever", and offer the others. When more than one is wanted, keep the same assets, timeline and states, define the layout per format, and look at a contact sheet of each: an export is correct because the composition survived the format, not because the encoder finished.

## Gates, and what to do when no human is there

Long runs need places to stop. With a human present:

1. approve the references and the asset list
2. approve the style guide and the shot list
3. look at representative stills
4. look at a rough cut and its contact sheet
5. repair the three highest-impact defects
6. check sound, formats and deliverables

Between gates the agent may work for hours; it never makes an irreversible brand decision (logo, claim, number) for the human, and a missing real asset is a blocker, not an invitation to invent one. If the reference is unclear, the right output is a question or one small test frame, not nine hundred polished wrong ones. With nobody to ask, record each decision you took as a "ruling" in the review notes, with what it costs if wrong, and finish with a short note of what still needs a human.

## The loop

PROMPT → CLIP is a demo. BRIEF → SYSTEM → FILM → REVIEW → BETTER SYSTEM is a studio: every stage leaves evidence the next one can use, and the tenth film can be better than the first.

*The shape of this guide follows a published breakdown of building a code-rendered video studio around an AI model ("Motion Engineering", @0xwhrrari, September 2026); the wording and the checklist are rewritten for this library's users.*
