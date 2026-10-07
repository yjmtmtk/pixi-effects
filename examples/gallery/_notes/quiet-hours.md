# quiet-hours — stumble notes
Model: sonnet   Cycles: 3 (1 write, 2 look-and-adjust)   Result: works
Note: written by the library's author to put `deck()`, stops, the Presenter and the Controller's Present button through a real piece; not a fresh-session trial.

## Went smoothly
- The deck is one `deck({ transition, pages })` call spread into `movie.init`: five pages, each a nested composition laid out after the one before, so every page's layers are written in the page's own time (`at: 0` is the start of the page). The stops come out of the pages (`stops: [1.7, 3.6]` are page-local) and the slide between pages is the existing `slide` transition.
- Steps are just layers that start at the previous stop: the second line of the statement starts at the first stop and finishes at the second, so "press next" plays exactly that animation and pauses.
- The Controller needed nothing: a movie with stops gets a mark per stop on the seek bar and a Present button that hands the page to a Presenter (arrows, Space, click, swipe, Home / End, a page number, B / W, F, ?).
- `animateText` made every headline, quote line and bullet; the chart is bars that grow (`height` is animatable) with `stagger` and a `{value}` counter.

## Stumbles
### 1. A transition ending exactly where its page ends failed on the 15th decimal   [LIBRARY BUG, FIXED]
- 2.4 + 4.3 is 6.699999999999999 and the transition ended at 6.7, so "not covered by `from`" was thrown for an overlap that is exactly right. The coverage check now allows 1e-6 s.

### 2. A page lasts until its stop plus the slide   [WORTH KNOWING]
- After a page's last stop the next press plays the rest of the page and the slide into the next one. A page that is longer than its last stop plus the transition would sit still for the difference, so each page's duration is its last stop + the slide. (Without a transition a page's default stop is its end.)

### 3. The first layout collided   [LAYOUT]
- The title ran into the big terracotta circle and the tallest bar of the chart into the heading. The circle moved right and shrank, the bars got 82 px per hour, the statement moved down.
